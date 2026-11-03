import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../extension/core.js';

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
 const result=await core.downloadFiles({site,token:'a'.repeat(32)},files,root);
 assert.equal(result.failed,1);assert.equal(result.completed,0);assert.equal(result.cancelled,false);
 assert.equal(result.files[0].error,'This file could not be saved. Check folder access and available disk space.');
 assert.equal(JSON.parse(reportText).files[0].status,'failed');
 assert.equal(cancelled,1,'An unread response must be cancelled when local file setup fails');
});
