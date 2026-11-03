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
  let messageListener, captureListener, nextTab = 1;
  const storage = {
    async get(keys) { return structuredClone(Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>key in state).map(key=>[key,state[key]]))); },
    async set(values) { Object.assign(state,structuredClone(values)); },
    async remove(keys) { for (const key of Array.isArray(keys)?keys:[keys]) delete state[key]; },
    async setAccessLevel() {}
  };
  const oldChrome = globalThis.chrome, oldFetch = globalThis.fetch;
  globalThis.chrome = {
    storage:{session:storage,local:{async set() {}}},
    permissions:{async contains() { return true; },async remove({origins}) { removedOrigins.push(...origins); }},
    tabs:{async create() { return {id:nextTab++}; },async update() {},async remove() {},onRemoved:{addListener() {}}},
    webRequest:{onHeadersReceived:{addListener(fn) { captureListener=fn; }}},
    action:{onClicked:{addListener() {}}},
    runtime:{id:'offline-test',onMessage:{addListener(fn) { messageListener=fn; }}}
  };
  globalThis.fetch = async (url,options) => {
    const body = new URLSearchParams(options.body);
    const request = deferred();
    requests.push({url,body,...request});
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
  return {state,removedOrigins,requests,send,request,connect,capture:details=>captureListener(details)};
}

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
