import test from 'node:test';
import assert from 'node:assert/strict';
import {md5} from '../extension/core.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const site = 'https://school.example/moodle';
const tokenA = 'a'.repeat(32), tokenB = 'b'.repeat(32);

async function background(t) {
  const state = {}, removedOrigins = [], requests = [];
  const localState = {};
  let clock = Date.now();
  t.mock.method(Date,'now',()=>clock+=2000);
  let messageListener, captureListener, actionListener, nextTab = 1;
  const tabs = new Map(), readTabs = [];
  const storage = {
    async get(keys) { return structuredClone(Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>key in state).map(key=>[key,state[key]]))); },
    async set(values) { Object.assign(state,structuredClone(values)); },
    async remove(keys) { for (const key of Array.isArray(keys)?keys:[keys]) delete state[key]; },
    async setAccessLevel() {}
  };
  const oldChrome = globalThis.chrome, oldFetch = globalThis.fetch;
  globalThis.chrome = {
    storage:{session:storage,local:{async get(key){return {[key]:structuredClone(localState[key])};},async set(values){Object.assign(localState,structuredClone(values));}}},
    permissions:{async contains() { return true; },async remove({origins}) { removedOrigins.push(...origins); }},
    tabs:{async create() { return {id:nextTab++}; },async get(id) {readTabs.push(id);if(!tabs.has(id))throw new Error('Missing tab');return tabs.get(id);},async update() {},async remove() {},onRemoved:{addListener() {}}},
    webRequest:{onHeadersReceived:{addListener(fn) { captureListener=fn; }}},
    action:{onClicked:{addListener(fn) {actionListener=fn;}},async setBadgeText(){},async setTitle(){}},
    runtime:{id:'offline-test',getURL:path=>'chrome-extension://offline-test/'+path,async getContexts(){return [];},onMessage:{addListener(fn) { messageListener=fn; }}}
  };
  globalThis.fetch = async (url,options) => {
    const body = new URLSearchParams(options.body);
    const request = deferred();
    requests.push({url,body,signal:options.signal,...request});
    options.signal.addEventListener('abort',()=>request.reject(options.signal.reason),{once:true});
    return request.promise;
  };
  t.after(()=>{ globalThis.chrome=oldChrome; globalThis.fetch=oldFetch; });
  await import(`../extension/background.js?offline=${crypto.randomUUID()}`);
  const send = message => new Promise(resolve => {
    assert.equal(messageListener(message,{id:'offline-test',url:'chrome-extension://offline-test/app.html'},resolve),true);
  });
  async function request(index) {
    for (let turn=0;turn<30 && !requests[index];turn++) await settle();
    assert.ok(requests[index],`Expected offline request ${index}`);
    return requests[index];
  }
  async function connect(index) {
    (await request(index)).resolve(Response.json({userid:4,siteurl:site,downloadfiles:1,functions:['core_webservice_get_site_info','core_enrol_get_users_courses','core_course_get_contents'].map(name=>({name}))}));
    (await request(index+1)).resolve(Response.json([]));
  }
  return {state,localState,tabs,readTabs,action:tab=>actionListener(tab),listen:(message,sender,respond)=>messageListener(message,sender,respond),openedTabs:()=>nextTab-1,removedOrigins,requests,send,request,connect,capture:details=>captureListener(details)};
}

test('retrying site detection inspects only the explicitly chosen tab and makes no school requests',async t=>{
 const bg=await background(t);
 bg.state.sourceTabId=88;bg.tabs.set(88,{id:88,url:site+'/mod/folder/view.php?id=2'});
 const result=await bg.send({type:'detect-site'});
 assert.equal(result.ok,true);assert.equal(result.site.base,site);
 assert.deepEqual(bg.readTabs,[88]);assert.equal(bg.state.detectedSite.site.base,site);
 assert.equal(bg.requests.length,0);assert.equal(bg.openedTabs(),0);
});

test('a slower old tab inspection cannot replace the latest chosen Moodle site',async t=>{
 const bg=await background(t),oldRead=deferred();let oldStarted=false;
 const newer='https://new-school.example/moodle';
 chrome.scripting={executeScript:async({target})=>{
  if(target.tabId===88){oldStarted=true;return oldRead.promise;}
  return [{result:{root:newer,moodle:true}}];
 }};
 bg.action({id:88,url:site+'/course/view.php?id=2'});
 for(let turn=0;turn<30&&!oldStarted;turn++)await settle();assert.equal(oldStarted,true);
 bg.action({id:89,url:newer+'/course/view.php?id=3'});
 for(let turn=0;turn<30&&bg.state.detectedSite?.site.base!==newer;turn++)await settle();
 assert.equal(bg.state.detectedSite?.site.base,newer);
 oldRead.resolve([{result:{root:site,moodle:true}}]);for(let turn=0;turn<10;turn++)await settle();
 assert.equal(bg.state.sourceTabId,89);assert.equal(bg.state.detectedSite.site.base,newer);
});

test('a retry waiting for tabs.get cannot overwrite a newer toolbar choice',async t=>{
 const bg=await background(t),oldTab=deferred(),lookupStarted=deferred();
 const newer='https://new-school.example/moodle';
 bg.state.sourceTabId=88;
 chrome.tabs.get=async id=>{assert.equal(id,88);lookupStarted.resolve();return oldTab.promise;};
 const retry=bg.send({type:'detect-site'});
 await lookupStarted.promise;
 bg.action({id:89,url:newer+'/course/view.php?id=3'});
 for(let turn=0;turn<30&&bg.state.detectedSite?.site.base!==newer;turn++)await settle();
 assert.equal(bg.state.detectedSite?.site.base,newer);
 oldTab.resolve({id:88,url:site+'/course/view.php?id=2'});
 assert.equal((await retry).ok,false,'An obsolete retry must not return its old target to the app');
 assert.equal(bg.state.sourceTabId,89);assert.equal(bg.state.detectedSite.site.base,newer);
 assert.equal(bg.requests.length,0);
});

test('choosing a new source clears its old automatic target before inspection finishes',async t=>{
 const bg=await background(t),inspection=deferred(),started=deferred();
 bg.state.sourceTabId=88;bg.state.detectedSite={site:{base:site}};
 chrome.scripting={executeScript:async()=>{started.resolve();return inspection.promise;}};
 bg.action({id:89,url:'https://not-moodle.example/news'});
 await started.promise;
 const pendingTarget=bg.state.detectedSite;
 inspection.resolve([{result:{root:null,moodle:false}}]);for(let turn=0;turn<10;turn++)await settle();
 assert.equal(pendingTarget,undefined,'The previous automatic target must disappear while the new source is inspected');
 assert.equal(bg.state.sourceTabId,89);assert.equal(bg.state.detectedSite,undefined);
});

for(const url of ['chrome://newtab/','http://insecure.example/moodle/course/view.php?id=3']) {
 test(`an unsupported toolbar choice clears automatic state and invalidates pending inspection: ${url}`,async t=>{
  const bg=await background(t),oldInspection=deferred(),started=deferred();
  bg.state.sourceTabId=88;bg.state.detectedSite={site:{base:site}};
  chrome.scripting={executeScript:async()=>{started.resolve();return oldInspection.promise;}};
  bg.action({id:88,url:site+'/course/view.php?id=2'});
  await started.promise;
  bg.action({id:89,url});
  for(let turn=0;turn<10;turn++)await settle();
  const afterChoice=structuredClone(bg.state);
  oldInspection.resolve([{result:{root:site,moodle:true}}]);
  for(let turn=0;turn<10;turn++)await settle();
  assert.equal(afterChoice.sourceTabId,undefined,'Unsupported choices must clear the retry source');
  assert.equal(afterChoice.detectedSite,undefined,'Unsupported choices must clear the automatic target');
  assert.equal(bg.state.sourceTabId,undefined);assert.equal(bg.state.detectedSite,undefined);
  assert.equal((await bg.send({type:'detect-site'})).ok,false);assert.deepEqual(bg.readTabs,[]);
  assert.equal(bg.requests.length,0);
 });
}

test('an obsolete missing-tab retry cannot clear a newer toolbar target',async t=>{
 const bg=await background(t),oldTab=deferred(),started=deferred();
 const newer='https://new-school.example/moodle';
 bg.state.sourceTabId=88;
 chrome.tabs.get=async()=>{started.resolve();return oldTab.promise;};
 const retry=bg.send({type:'detect-site'});await started.promise;
 bg.action({id:89,url:newer+'/course/view.php?id=3'});
 for(let turn=0;turn<30&&bg.state.detectedSite?.site.base!==newer;turn++)await settle();
 assert.equal(bg.state.detectedSite?.site.base,newer);
 oldTab.reject(new Error('Old tab closed'));
 assert.equal((await retry).ok,false);assert.equal(bg.state.sourceTabId,89);assert.equal(bg.state.detectedSite.site.base,newer);
});

test('web pages cannot send downloader commands by matching the app pathname',async t=>{
 const bg=await background(t);
 assert.equal(bg.listen({type:'detect-site'},{id:'offline-test',url:'https://other.example/app.html'},()=>{}),false);
 assert.equal(bg.requests.length,0);assert.equal(bg.readTabs.length,0);
});

test('a cancelled token attempt cannot clear a newer ready connection when it rejects',async t=>{
  const bg=await background(t);
  const old=bg.send({type:'token',site,token:tokenA});
  await bg.request(0);
  await bg.send({type:'cancel'});
  const current=bg.send({type:'token',site,token:tokenB});
  await bg.connect(1);
  assert.deepEqual(await current,{ok:true});
  const ready=structuredClone(bg.state), removals=[...bg.removedOrigins];
  bg.requests[0].reject(new Error('Old request failed'));
  assert.equal((await old).ok,false);
  assert.deepEqual(bg.state,ready);
  assert.deepEqual(bg.removedOrigins,removals);
});

test('a cancelled callback attempt cannot clear a newer ready connection when it rejects',async t=>{
  const bg=await background(t);
  await bg.send({type:'connect',site});
  const pending=structuredClone(bg.state.pending);
  const url=new URL(site+'/admin/tool/mobile/launch.php');
  url.search=new URLSearchParams({passport:pending.passport,service:'moodle_mobile_app'}).toString();
  const location='coursefiles://token='+Buffer.from(`${md5(site+pending.passport)}:::${tokenA}`).toString('base64');
  bg.capture({tabId:pending.tabId,url:url.href,responseHeaders:[{name:'Location',value:location}]});
  await bg.request(0);
  await bg.send({type:'cancel'});
  const current=bg.send({type:'token',site,token:tokenB});
  await bg.connect(1);
  assert.deepEqual(await current,{ok:true});
  const ready=structuredClone(bg.state), removals=[...bg.removedOrigins];
  bg.requests[0].reject(new Error('Old callback request failed'));
  for(let turn=0;turn<10;turn++) await settle();
  assert.deepEqual(bg.state,ready);
  assert.deepEqual(bg.removedOrigins,removals);
});

test('failure cleanup cannot overlap a new attempt between its ownership check and permission removal',async t=>{
  const bg=await background(t);
  const old=bg.send({type:'token',site,token:tokenA});
  await bg.request(0);
  const checked=deferred(), release=deferred();
  const get=chrome.storage.session.get;
  let pause=true;
  chrome.storage.session.get=async keys=>{
    const snapshot=await get(keys);
    if(pause && Array.isArray(keys) && keys.includes('activeSite')) {
      pause=false; checked.resolve(); await release.promise;
    }
    return snapshot;
  };
  bg.requests[0].reject(new Error('Connection A failed'));
  await checked.promise;
  const current=bg.send({type:'token',site,token:tokenB});
  for(let turn=0;turn<10;turn++) await settle();
  const overlapped=bg.requests.length>1;
  release.resolve();
  assert.equal((await old).ok,false);
  await bg.connect(1);
  assert.deepEqual(await current,{ok:true});
  assert.equal(overlapped,false,'Connection B began while A still owned cleanup');
  assert.equal(bg.state.connection.token,tokenB);
  assert.equal(bg.state.phase,'ready');
});

test('a saved school cooldown prevents another browser sign-in launch',async t=>{
 const bg=await background(t);
 bg.localState['moodle-request:https://school.example']={status:429,retryAt:Date.now()+300000};
 const result=await bg.send({type:'connect',site});
 assert.equal(result.ok,false);assert.match(result.error,/rate limit/i);
 assert.equal(bg.openedTabs(),0);assert.equal(bg.requests.length,0);
});

test('cancelling verification aborts the active network request',async t=>{
 const bg=await background(t);
 const old=bg.send({type:'token',site,token:tokenA});
 const request=await bg.request(0);
 await bg.send({type:'cancel'});
 const aborted=request.signal.aborted;
 request.reject(new Error('Stop this offline request'));
 await old;
 assert.equal(aborted,true);
});
