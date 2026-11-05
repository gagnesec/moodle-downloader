import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
let detection={};try{detection=await import('../extension/detect.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}

test('Moodle site detection reads its canonical configuration without asking for a pasted URL',()=>{
 assert.equal(typeof detection.siteFromPage,'function','Active-tab Moodle detection is not implemented');
 const result=detection.siteFromPage('https://moodle.concordia.ca/moodle/course/view.php?id=191022',{root:'https://moodle.concordia.ca/moodle',moodle:true});
 assert.equal(result.base,'https://moodle.concordia.ca/moodle');
});
test('a page cannot advertise another origin as its Moodle connection',()=>{
 assert.equal(typeof detection.siteFromPage,'function','Active-tab Moodle detection is not implemented');
 assert.equal(detection.siteFromPage('https://school.example/course',{root:'https://other.example/moodle',moodle:true}),null);
 assert.equal(detection.siteFromPage('chrome://extensions/',{root:'https://school.example/moodle',moodle:true}),null);
 assert.equal(detection.siteFromPage('https://unrelated.example/',{root:null,moodle:false}),null);
});
test('metadata-only detection infers roots only from recognized Moodle routes',()=>{
 const signals={root:null,moodle:true};
 for(const prefix of ['', '/moodle', '/nested/moodle']) {
  const base='https://school.example'+prefix;
  for(const route of ['/index.php','/course/view.php?id=2','/my/','/my/index.php','/login/index.php','/admin/tool/mobile/launch.php']) {
   assert.equal(detection.siteFromPage(base+route,signals)?.base,base,route);
  }
  for(const route of ['/news.html','/unknown.php','/mod/quiz/view.php?id=2','/mod/unknown/view.php']) {
   assert.equal(detection.siteFromPage(base+route,signals),null,route);
  }
 }
 assert.equal(detection.siteFromPage('https://school.example/',signals)?.base,'https://school.example');
});
test('homepage detection keeps canonical roots authoritative and rejects unsafe links',()=>{
 const root='https://school.example/moodle';
 assert.equal(detection.siteFromPage(root+'/unknown.php',{root,moodle:true})?.base,root);
 assert.equal(detection.siteFromPage(root+'/mod/resource/view.php?id=2',{root,moodle:true})?.base,root);
 for(const [url,signals] of [
  [root+'/index.php?token=secret',{root:null,moodle:true}],
  [root+'/index.php?wstoken=secret',{root:null,moodle:true}],
  [root+'?token=secret',{root:null,moodle:true}],
  ['http://school.example/moodle/index.php',{root:null,moodle:true}],
  ['https://user:pass@school.example/moodle/index.php',{root:null,moodle:true}],
  [root+'/index.php',{root:'https://other.example/moodle',moodle:true}],
  [root+'-other/index.php',{root,moodle:true}],
  [root+'/index.php',{root:root+'?token=secret',moodle:true}],
  [root+'/index.php',{root:null,moodle:false}]
 ]) assert.equal(detection.siteFromPage(url,signals),null,url);
});
test('detection tolerates unavailable scripting and only falls back for known Moodle page routes',async()=>{
 assert.equal(typeof detection.detectSite,'function','Active-tab Moodle detection is not implemented');
 const unavailable={executeScript:async()=>{throw new Error('Unavailable on this document');}};
 assert.equal((await detection.detectSite({id:1,url:'https://school.example/moodle/course/view.php?id=2'},unavailable)).base,'https://school.example/moodle');
 assert.equal(await detection.detectSite({id:1,url:'https://unrelated.example/news'},unavailable),null);
});

test('detection waits briefly for a still-loading Moodle configuration',async()=>{
 const root='https://school.example/learning/moodle.v4';let waits=0;
 const scripting={executeScript:async({func})=>{
  const environment={document:{readyState:'loading',querySelector:()=>null}};
  environment.setTimeout=callback=>{waits++;environment.M={cfg:{wwwroot:root}};queueMicrotask(callback);};
  return [{result:await vm.runInNewContext(`(${func.toString()})()`,environment)}];
 }};
 assert.equal((await detection.detectSite({id:1,url:root+'/'},scripting))?.base,root);
 assert.equal(waits,1);
});
test('configuration readiness survives a loading-to-interactive transition',async()=>{
 const root='https://school.example/learning/moodle4.5';let waits=0;
 const scripting={executeScript:async({func})=>{
  const environment={document:{readyState:'loading',querySelector:()=>null}};
  environment.setTimeout=callback=>{
   waits++;environment.document.readyState='interactive';
   if(waits===2)environment.M={cfg:{wwwroot:root}};
   queueMicrotask(callback);
  };
  return [{result:await vm.runInNewContext(`(${func.toString()})()`,environment)}];
 }};
 assert.equal((await detection.detectSite({id:1,url:root+'/'},scripting))?.base,root);
 assert.equal(waits,2);
});

test('Moodle configuration readiness waiting is bounded and skips already-ready sites',async()=>{
 let waits=0;const root='https://school.example/moodle';
 async function inject(initial){
  const environment={...initial,document:{readyState:'loading',querySelector:()=>null},setTimeout:callback=>{waits++;queueMicrotask(callback);}};
  return detection.detectSite({id:1,url:root+'/course/view.php?id=2'},{executeScript:async({func})=>[{result:await vm.runInNewContext(`(${func.toString()})()`,environment)}]});
 }
 assert.equal((await inject({M:{cfg:{wwwroot:root}}}))?.base,root);assert.equal(waits,0);
 assert.equal((await inject({}))?.base,root);assert.ok(waits>0&&waits<=10);
});

test('recognized Moodle activity routes infer the installation root without M.cfg',async()=>{
 const url='https://moodle.concordia.ca/moodle/mod/lti/view.php?id=4589012';
 assert.equal(detection.siteFromPage(url)?.base,'https://moodle.concordia.ca/moodle');
 let injections=0;
 const scripting={executeScript:async()=>{injections++;return [{result:{root:null,moodle:false}}];}};
 assert.equal((await detection.detectSite({id:1,url},scripting))?.base,'https://moodle.concordia.ca/moodle');
 assert.equal(injections,1);
 for(const prefix of ['', '/moodle', '/nested/moodle']) for(const module of ['resource','folder','lti','page','book']) {
  const base='https://school.example'+prefix;
  for(const suffix of ['', '/', '?id=2']) for(const signals of [{}, {root:null,moodle:true}]) {
   assert.equal(detection.siteFromPage(base+'/mod/'+module+'/view.php'+suffix,signals)?.base,base);
  }
 }
});
test('activity index pages are recognized without treating their module directory as the site',()=>{
 const root='https://school.example/learning/moodle4.5';
 for(const activity of ['resource','folder','lti','page','book']){
  assert.equal(detection.siteFromPage(root+'/mod/'+activity+'/index.php?id=2')?.base,root);
 }
});

test('activity fallback preserves exact namespaces and security boundaries',()=>{
 const base='https://school.example/moodle';
 for(const route of ['/mod/quiz/view.php?id=2','/mod/unknown/view.php','/notmod/lti/view.php?id=2','/mod/lti-extra/view.php?id=2','/mod/lti/view.php-extra','/mod/lti/view.php/extra','/mod/lti/view.php?token=secret','/mod/lti/view.php?%77stoken=secret','/mod/lti/view.php?ToKeN=secret','/mod%2flti/view.php?id=2','//mod/lti/view.php?id=2','/news.html','/unknown.php']) {
  for(const signals of [{}, {root:null,moodle:true}]) assert.equal(detection.siteFromPage(base+route,signals),null,route);
 }
 for(const root of ['https://other.example/moodle',base+'-other']) {
  assert.equal(detection.siteFromPage(base+'/mod/lti/view.php?id=2',{root,moodle:true}),null);
 }
 assert.equal(detection.siteFromPage('http://school.example/moodle/mod/lti/view.php?id=2'),null);
 assert.equal(detection.siteFromPage('https://user:pass@school.example/moodle/mod/lti/view.php?id=2'),null);
 assert.equal(detection.siteFromPage(base+'/nested/mod/lti/view.php?id=2',{root:base,moodle:true})?.base,base);
});
