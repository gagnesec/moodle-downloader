import test from 'node:test';
import assert from 'node:assert/strict';
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
  for(const route of ['/news.html','/unknown.php','/mod/resource/view.php?id=2','/mod/folder/view.php?id=3']) {
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
