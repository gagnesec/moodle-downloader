import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.TEST_OUTPUT??path.join(os.homedir(),'AppData/Local/hermes/cache/scratch/course-files-ui');
await fs.mkdir(base,{recursive:true});
const extension=process.env.EXTENSION_PATH??path.join(root,'extension');
const context=await chromium.launchPersistentContext(path.join(base,'profile-'+Date.now()),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const page=await context.newPage();const errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('http'))network.push(r.url());});
 await page.goto(`chrome-extension://${new URL(worker.url()).host}/app.html`);
 await page.getByRole('heading',{name:'Course Files',exact:true}).waitFor();
 assert.equal(await page.locator('#course-section').isVisible(),false);
 assert.equal(await page.locator('#rescan').count(),1,'Cached course scans need an explicit refresh control');
 await page.getByRole('button',{name:'Privacy',exact:true}).click();assert.equal(await page.locator('#privacy').isVisible(),true);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await page.locator('#token').getAttribute('type'),'password');
 // The actual extension page and service worker must share the same school lock.
 await page.evaluate(async()=>{const {acquireRequest}=await import('./request-policy.js');window.__lease=await acquireRequest('https://request-check.example');});
 await worker.evaluate(()=>{globalThis.__lockProbe=navigator.locks.request('moodle-request:https://request-check.example',()=>true);});
 await page.waitForFunction(async()=>{const snapshot=await navigator.locks.query();return snapshot.pending.some(lock=>lock.name==='moodle-request:https://request-check.example');});
 await page.evaluate(()=>{window.__lease.release();delete window.__lease;});
 assert.equal(await worker.evaluate(()=>globalThis.__lockProbe),true);
 const launcher=await page.evaluate(async()=>{
  const {openDownloader}=await import('./launcher.js');
  const [own]=await chrome.runtime.getContexts({contextTypes:['TAB'],documentUrls:[location.href]});
  const other=await chrome.windows.create({url:'about:blank',focused:true});
  const shown=await openDownloader({windowId:other.id});
  let focused;
  for(let i=0;i<20;i++){focused=await chrome.windows.getLastFocused();if(focused.id===other.id)break;await new Promise(resolve=>setTimeout(resolve,50));}
  const contexts=await chrome.runtime.getContexts({contextTypes:['TAB'],documentUrls:[location.href]});
  return {shown,expected:own.tabId,focused:focused.id,expectedWindow:other.id,openPages:contexts.length};
 });
 assert.equal(launcher.shown,launcher.expected);assert.equal(launcher.focused,launcher.expectedWindow);assert.equal(launcher.openPages,1);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Narrow UI overflows horizontally');
 await page.screenshot({path:path.join(base,'narrow.png'),fullPage:true});
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await page.screenshot({path:path.join(base,'store-screenshot.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 const results={realExtensionLoaded:true,windowAndWorkerShareRequestLock:true,toolbarCrossWindowFocus:true,toolbarNoDuplicateTab:true,narrowLayoutNoOverflow:true,privacyDialogWorks:true,tokenFieldMasked:true,unexpectedNetworkRequests:network.length,pageErrors:errors,schoolRequests:0};
 await fs.writeFile(path.join(base,'ui-result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await context.close();}
