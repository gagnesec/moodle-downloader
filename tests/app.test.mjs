import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {normalizeSite,UserError} from '../extension/core.js';

const site=normalizeSite('https://school.example/moodle');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function app(detection={ok:false}) {
 const saved={},elements=new Map(),messages=[],permissions=[];
 let changed;
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:true,disabled:false,open:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},removeAttribute(){},replaceChildren(){},focus(){},append(){}});
  return elements.get(id);
 };
 const environment=vm.createContext({normalizeSite,UserError,createCourseCache:()=>({clear(){}}),RequestPauseError:class extends Error{},setTimeout,clearTimeout,AbortController,
  document:{getElementById:element,querySelectorAll:()=>[]},window:{addEventListener(){}},
  chrome:{storage:{session:{get:async()=>structuredClone(saved)},local:{get:async()=>({})},onChanged:{addListener:fn=>{changed=fn;}}},runtime:{sendMessage:async message=>{messages.push(message);return message.type==='detect-site'?detection:{ok:false};}},permissions:{request:async request=>{permissions.push(request);return false;}}}
 });
 const source=await fs.readFile(new URL('../extension/app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,''),environment);
 await settle();
 async function refresh(values,removed=[]) {
  Object.assign(saved,structuredClone(values));for(const key of removed)delete saved[key];
  changed(Object.fromEntries([...Object.keys(values),...removed].map(key=>[key,{}])),'session');
  await settle();
 }
 return {saved,element,messages,permissions,refresh,async connect(){element('connect').listeners.click();await settle();},type(value){element('site').value=value;element('site').listeners.input?.();}};
}

test('removing a detected target clears the automatic address and retries the chosen source',async()=>{
 const ui=await app();
 await ui.refresh({sourceTabId:88,detectedSite:{site}});
 assert.equal(ui.element('site').value,site.base);assert.equal(ui.element('detected-target').hidden,false);
 await ui.refresh({sourceTabId:89},['detectedSite']);
 assert.equal(ui.element('site').value,'','An obsolete automatic site must not remain a Connect target');
 assert.equal(ui.element('detected-target').hidden,true);
 assert.equal(ui.element('open-moodle-hint').hidden,false);
 await ui.connect();
 assert.deepEqual(ui.messages.map(message=>message.type),['detect-site']);assert.equal(ui.permissions.length,0);
});

test('clearing a detected address allows a same-site retry before a fresh permission click',async()=>{
 const ui=await app({ok:true,site});
 await ui.refresh({sourceTabId:88,detectedSite:{site}});
 assert.equal(ui.element('site').value,site.base);assert.equal(ui.element('detected-target').hidden,false);
 ui.type('');
 assert.equal(ui.element('site').value,'');assert.equal(ui.element('detected-target').hidden,true);
 await ui.connect();
 assert.deepEqual(ui.messages.map(message=>message.type),['detect-site']);assert.equal(ui.permissions.length,0);
 assert.equal(ui.element('site').value,site.base,'A same-site retry must restore the cleared address');
 assert.equal(ui.element('detected-target').hidden,false);assert.equal(ui.element('detected-address').textContent,site.base);
 await ui.connect();
 assert.deepEqual(ui.messages.map(message=>message.type),['detect-site'],'A fresh Connect click must use the restored address, not detect again');
 assert.equal(ui.permissions.length,1);assert.deepEqual(Array.from(ui.permissions[0].origins),[site.origin+'/*']);
});

test('removing detection without a source change clears its automatic target',async()=>{
 const ui=await app();
 await ui.refresh({sourceTabId:88,detectedSite:{site}});
 await ui.refresh({},['detectedSite']);
 assert.equal(ui.element('site').value,'');assert.equal(ui.element('detected-target').hidden,true);
});

test('source changes preserve genuinely typed addresses including one matching the old automatic address',async()=>{
 for(const address of ['https://manual.example/moodle',site.base]) {
  const ui=await app();await ui.refresh({sourceTabId:88,detectedSite:{site}});
  ui.type(address);await ui.refresh({sourceTabId:89},['detectedSite']);
  assert.equal(ui.element('site').value,address);assert.equal(ui.element('detected-target').hidden,true);
  await ui.refresh({detectedSite:{site:normalizeSite('https://new-school.example/moodle')}});
  assert.equal(ui.element('site').value,address,'A late automatic result must not replace a typed address');
  assert.equal(ui.element('detected-target').hidden,true);
 }
});

test('removing an automatic target leaves a valid connected account intact',async()=>{
 const ui=await app(),connection={site,token:'a'.repeat(32),user:{id:4,name:'Offline User'},courses:[]};
 await ui.refresh({sourceTabId:88,detectedSite:{site},connection,phase:'ready'});
 await ui.refresh({},['sourceTabId','detectedSite']);
 assert.equal(ui.element('account').hidden,false);assert.equal(ui.element('connect-section').hidden,true);
 assert.equal(ui.element('account-name').textContent,'Offline User');assert.equal(ui.element('account-site').textContent,site.base);
 assert.equal(ui.messages.length,0);assert.equal(ui.permissions.length,0);
});
