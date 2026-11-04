import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseCache} from '../extension/course-cache.js';

const connection={site:{base:'https://school.example/moodle',origin:'https://school.example',path:'/moodle'},token:'a'.repeat(32),user:{id:4}};
const course={id:9,shortname:'BIO'};

test('repeating a course scan reuses a fresh result without more requests',async()=>{
 let calls=0;
 const cache=createCourseCache({load:async()=>{calls++;return [];}});
 const first=await cache.get(connection,course);
 assert.deepEqual(await cache.get(connection,course),first);
 assert.equal(calls,2,'Only the initial File and Folder listings should be requested');
});

test('expiry and explicit refresh fetch new listings instead of hiding new files',async()=>{
 let calls=0,time=1000;
 const cache=createCourseCache({load:async()=>{calls++;return [];},now:()=>time});
 await cache.get(connection,course);
 time+=300000;
 await cache.get(connection,course);
 assert.equal(calls,4);
 await cache.get(connection,course,undefined,{refresh:true});
 assert.equal(calls,6);
});

test('changing account, site, or token cannot reuse another connection listing',async()=>{
 let calls=0;
 const cache=createCourseCache({load:async()=>{calls++;return [];}});
 for(const current of [connection,{...connection,token:'b'.repeat(32)},{...connection,user:{id:8}},{...connection,site:{base:'https://other.example/moodle'}}])await cache.get(current,course);
 assert.equal(calls,8);
});

test('a failed Folder listing preserves partial File results without caching an incomplete scan',async()=>{
 let calls=0;
 const content={type:'file',filename:'notes.txt',filepath:'/',filesize:9,isexternalfile:false,mimetype:'text/plain',fileurl:connection.site.base+'/webservice/pluginfile.php/42/mod_resource/content/2/notes.txt'};
 const cache=createCourseCache({load:async(_connection,_course,kind)=>{
  calls++;if(kind==='folder')throw new Error('Folder listing failed');
  return [{name:'Week',modules:[{id:7,contextid:42,modname:'resource',name:'Notes',uservisible:true,contents:[content]}]}];
 }});
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(cache.get(connection,course),error=>{assert.equal(error.partial.files.length,1);assert.equal(error.partial.files[0].name,'notes.txt');return true;});
 assert.equal(calls,4);
});

test('disconnect invalidation rejects a late result before a second request can start',async()=>{
 let finish,calls=0;
 const cache=createCourseCache({load:async()=>{calls++;if(calls===1)await new Promise(resolve=>{finish=resolve;});return [];}});
 const pending=cache.get(connection,course);
 assert.equal(typeof cache.clear,'function');
 cache.clear();finish();
 await assert.rejects(pending,{name:'AbortError'});
 assert.equal(calls,1);
 await cache.get(connection,course);
 assert.equal(calls,3);
});
