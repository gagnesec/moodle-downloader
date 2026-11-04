import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../extension/core.js';
import { acquireRequest, RequestPauseError } from '../extension/request-policy.js';

test('a rejected cooldown write preserves the pause and stops the batch',async t=>{
 for(const status of [429,401,403,500,599]) await t.test(`HTTP ${status}`,async t=>{
  const site=core.normalizeSite('https://school.example/moodle');
  const contents=['one.txt','two.txt','three.txt'].map(filename=>({type:'file',filename,filepath:'/',filesize:9,isexternalfile:false,mimetype:'text/plain',fileurl:site.base+'/webservice/pluginfile.php/42/mod_resource/content/2/'+filename}));
  const {files}=core.collectFiles(site,{id:5,shortname:'BIO'},[{name:'Week',modules:[{id:7,contextid:42,modname:'resource',name:'Notes',uservisible:true,contents}]}]);
  const stored={};let rejectedWrites=0;
  const previousChrome=globalThis.chrome;
  globalThis.chrome={storage:{local:{
   async get(key){return {[key]:structuredClone(stored[key])};},
   async set(values){
    if(Object.values(values).some(record=>record.retryAt)&&rejectedWrites===0){rejectedWrites++;throw new Error('private storage failure');}
    Object.assign(stored,structuredClone(values));
   }
  }}};
  t.after(()=>{globalThis.chrome=previousChrome;});
  let requests=0,bodyCancelled=0,pause;
  t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response(new ReadableStream({cancel(){bodyCancelled++;}}),{status,headers:{'Retry-After':'600'}});});
  const directory={async getFileHandle(name){assert.equal(name,'_download-report.json');return {async createWritable(){return {async write(){},async close(){}};}};}};
  const root={async getDirectoryHandle(){return directory;}};
  const request=async(...args)=>{
   const lease=await acquireRequest(...args);
   return {...lease,async check(response){try{await lease.check(response);}catch(error){pause=error;throw error;}}};
  };
  const report=await core.downloadFiles({site,token:'a'.repeat(32)},files,root,undefined,undefined,request);
  assert.equal(requests,1,'A known pause must stop the batch even when its cooldown cannot be saved');
  assert.equal(report.paused,true);assert.equal(report.notStarted,2);assert.equal(report.failed,1);
  assert.equal(bodyCancelled,1,'The unread response must be cancelled');
  assert.equal(rejectedWrites,1);assert.equal(Object.values(stored)[0].retryAt,undefined,'The failed write must not appear persisted');
  assert.ok(pause instanceof RequestPauseError);assert.equal(pause.status,status);assert.equal(pause.code,'request-paused');
  assert.equal(pause.persistenceFailed,true);assert.ok(pause.retryAt>Date.now());
  assert.match(pause.message,/could not save.*do not retry before/i);
  assert.match(pause.message,status===429?/rate limit/i:status===401||status===403?/permission/i:/server.*unavailable/i);
  assert.doesNotMatch(JSON.stringify(report)+pause.message,/private storage failure/);
  const locks=await navigator.locks.query();
  assert.equal(locks.held.filter(lock=>lock.name===`moodle-request:${site.origin}`).length,0,'The request lease must be released');
  assert.equal(locks.pending.filter(lock=>lock.name===`moodle-request:${site.origin}`).length,0);
 });
});

test('an empty or already-cancelled download cannot create directories or issue requests',async()=>{
 assert.equal(typeof core.downloadFiles,'function','The streamed file downloader is not implemented');
 await assert.rejects(()=>core.downloadFiles({},[],null),/files|select/i);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>core.downloadFiles({},[{}],null,()=>{},controller.signal));
});

test('a local directory failure cancels the unread response and preserves the failure report',async t=>{
 const site=core.normalizeSite('https://school.example/moodle');
 const content={type:'file',filename:'notes.txt',filepath:'/',filesize:9,isexternalfile:false,mimetype:'text/plain',fileurl:site.base+'/webservice/pluginfile.php/42/mod_resource/content/2/notes.txt'};
 const {files}=core.collectFiles(site,{id:5,shortname:'BIO'},[{name:'Week',modules:[{id:7,contextid:42,modname:'resource',name:'Notes',uservisible:true,contents:[content]}]}]);
 let cancelled=0,reportText='';
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(9));},cancel(){cancelled++;}}),{headers:{'content-type':'text/plain'}});
 t.mock.method(globalThis,'fetch',async()=>response);
 const directory={
  async getDirectoryHandle(){throw new DOMException('Access denied','NotAllowedError');},
  async getFileHandle(name){assert.equal(name,'_download-report.json');return {async createWritable(){return {async write(text){reportText=text;},async close(){},async abort(){}};}};}
 };
 const root={async getDirectoryHandle(){return directory;}};
 const result=await core.downloadFiles({site,token:'a'.repeat(32)},files,root,undefined,undefined,async()=>({async check(){},release(){}}));
 assert.equal(result.failed,1);assert.equal(result.completed,0);assert.equal(result.cancelled,false);
 assert.equal(result.files[0].error,'This file could not be saved. Check folder access and available disk space.');
 assert.equal(JSON.parse(reportText).files[0].status,'failed');
 assert.equal(cancelled,1,'An unread response must be cancelled when local file setup fails');
});

test('a real request gate stops the whole batch on 429 and blocks another download attempt',async t=>{
 const site=core.normalizeSite('https://school.example/moodle');
 const contents=['one.txt','two.txt','three.txt'].map(filename=>({type:'file',filename,filepath:'/',filesize:9,isexternalfile:false,mimetype:'text/plain',fileurl:site.base+'/webservice/pluginfile.php/42/mod_resource/content/2/'+filename}));
 const {files}=core.collectFiles(site,{id:5,shortname:'BIO'},[{name:'Week',modules:[{id:7,contextid:42,modname:'resource',name:'Notes',uservisible:true,contents}]}]);
 const stored={};
 const previousChrome=globalThis.chrome;
 globalThis.chrome={storage:{local:{async get(key){return {[key]:structuredClone(stored[key])};},async set(values){Object.assign(stored,structuredClone(values));}}}};
 t.after(()=>{globalThis.chrome=previousChrome;});
 let requests=0,bodyCancelled=0;
 t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response(new ReadableStream({cancel(){bodyCancelled++;}}),{status:429,headers:{'Retry-After':'600'}});});
 const directory={async getFileHandle(name){assert.equal(name,'_download-report.json');return {async createWritable(){return {async write(){},async close(){}};}};}};
 const root={async getDirectoryHandle(){return directory;}};
 const result=await core.downloadFiles({site,token:'a'.repeat(32)},files,root);
 assert.equal(requests,1);assert.equal(bodyCancelled,1);assert.equal(result.failed,1);assert.equal(result.notStarted,2);
 assert.equal(result.paused,true);assert.ok(result.retryAt>Date.now());
 await core.downloadFiles({site,token:'a'.repeat(32)},files,root);
 assert.equal(requests,1,'Trying again during the school cooldown must not contact the server');
});
