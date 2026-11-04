import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../extension/core.js';
import {RequestPauseError} from '../extension/request-policy.js';
const site=core.normalizeSite('https://school.example/moodle');
const token='a'.repeat(32);
const funcs=['core_webservice_get_site_info','core_enrol_get_users_courses','core_course_get_contents'];
const immediateLease=async()=>({async check(){},release(){}});

test('connect and discovery use only fixed POST APIs scoped to own enrolled courses',async()=>{
 assert.equal(typeof core.connectWithToken,'function','The Moodle API adapter is not implemented');
 const calls=[];
 const transport=async(url,options)=>{
  calls.push({url,options}); const params=new URLSearchParams(options.body); const fn=params.get('wsfunction');
  assert.ok(funcs.includes(fn)); assert.equal(params.get('wstoken'),token); assert.equal(options.redirect,'error'); assert.equal(options.credentials,'omit'); assert.equal(options.method,'POST'); assert.ok(!url.includes(token));
  if(fn===funcs[0])return Response.json({userid:4,fullname:'Student',siteurl:site.base,downloadfiles:1,functions:funcs.map(name=>({name}))});
  if(fn===funcs[1]){assert.equal(params.get('userid'),'4');return Response.json([{id:9,shortname:'BIO',fullname:'Biology'}]);}
  assert.equal(params.get('courseid'),'9');assert.equal(params.get('options[0][value]'),'resource');return Response.json([]);
 };
 const connection=await core.connectWithToken(site,token,transport,undefined,immediateLease);
 assert.equal(connection.user.name,'Student');assert.equal(connection.courses[0].id,9);
 await core.fetchContents(connection,9,'resource',undefined,transport,immediateLease);
 assert.equal(calls.length,3);
 await assert.rejects(()=>core.fetchContents(connection,99,'resource',undefined,transport));
 await assert.rejects(()=>core.fetchContents(connection,9,'quiz',undefined,transport));
 assert.equal(calls.length,3);
});

test('server errors never echo server-supplied secret-bearing messages to the user',async()=>{
 assert.equal(typeof core.connectWithToken,'function','The Moodle API adapter is not implemented');
 try{await core.connectWithToken(site,token,async()=>Response.json({exception:'moodle_exception',errorcode:'invalidtoken',message:'secret '+token}),undefined,immediateLease);assert.fail('must reject');}
 catch(error){assert.ok(!error.message.includes(token));assert.match(error.message,/connect|expired/i);}
});

test('a blocked request gate prevents even the first account request',async()=>{
 let calls=0;
 const transport=async()=>{calls++;return Response.json({userid:4,siteurl:site.base,downloadfiles:1,functions:funcs.map(name=>({name}))});};
 const acquire=async()=>{throw new RequestPauseError('School requests are paused.',Date.now()+300000,429);};
 await assert.rejects(core.connectWithToken(site,token,transport,undefined,acquire),{code:'request-paused'});
 assert.equal(calls,0);
});
