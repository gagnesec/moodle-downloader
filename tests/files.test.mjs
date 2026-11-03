import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../extension/core.js';
const site = core.normalizeSite('https://school.example/moodle');
const module = {id:7,contextid:42,modname:'resource',name:'Week 1',uservisible:true};
const file = (name='lecture.pdf', extra={}) => ({type:'file',filename:name,filepath:'/',filesize:9,isexternalfile:false,mimetype:'application/pdf',fileurl:`${site.base}/webservice/pluginfile.php/42/mod_resource/content/2/${encodeURIComponent(name)}`,...extra});

test('file discovery includes native files, nested folders, and deterministic collision-safe names', () => {
 assert.equal(typeof core.collectFiles,'function','Native file discovery is not implemented');
 const a=file('a:b.pdf'); const b=file('a?b.pdf');
 const folder={...module,id:8,modname:'folder',name:'Readings',contents:[file('notes.txt',{filepath:'/chapter/',fileurl:`${site.base}/webservice/pluginfile.php/42/mod_folder/content/0/chapter/notes.txt`})]};
 const result=core.collectFiles(site,{id:5,shortname:'BIO / 202'},[{name:'Week <1>',modules:[{...module,contents:[a,b,a]},folder]}]);
 assert.equal(result.files.length,3);
 assert.equal(new Set(result.files.map(f=>f.segments.join('/').toLowerCase())).size,3);
 assert.ok(result.files.some(f=>f.segments.includes('chapter')));
 for(const f of result.files) assert.ok(f.segments.every(s=>s && !/[<>:"/\\|?*]/.test(s) && s!=='.' && s!=='..'));
});

test('discovery keeps files distinct from directory prefixes in either encounter order', () => {
 const nested=(name,dir)=>file(name,{filepath:`/${dir}/`,fileurl:`${site.base}/webservice/pluginfile.php/42/mod_resource/content/2/${encodeURIComponent(dir)}/${encodeURIComponent(name)}`});
 for(const [rootName,dir] of [['report','REPORT'],['a:b','a?b']]) for(const reverse of [false,true]) {
  const contents=[file(rootName),nested('notes.txt',dir),nested('more.txt',dir)];
  if(reverse)contents.reverse();
  const result=core.collectFiles(site,{id:5,shortname:'BIO'},[{name:'Week',modules:[{...module,contents}]}]);
  assert.equal(result.files.length,3);
  const root=result.files.find(f=>f.name===rootName);
  const children=result.files.filter(f=>f.name!==rootName);
  const path=root.segments.join('/').toLowerCase();
  for(const child of children) assert.notEqual(child.segments.slice(0,-1).join('/').toLowerCase(),path,'A directory cannot occupy a file destination');
  assert.deepEqual(children[0].segments.slice(0,-1),children[1].segments.slice(0,-1),'One original directory must stay together');
  assert.deepEqual(core.collectFiles(site,{id:5,shortname:'BIO'},[{name:'Week',modules:[{...module,contents}]}]),result);
 }
});

test('discovery keeps colliding original directories separate and their descendants stable', () => {
 const nested=(dir,name)=>file(name,{filepath:`/${dir}/`,fileurl:`${site.base}/webservice/pluginfile.php/42/mod_resource/content/2/${dir.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(name)}`});
 for(const [first,second] of [['REPORT','report'],['a:b','a?b']]) {
  const contents=[nested(first,'one.txt'),nested(second,'two.txt'),nested(first+'/child','three.txt'),nested(second+'/child','four.txt'),nested(first,'five.txt'),nested(second,'six.txt')];
  const {files}=core.collectFiles(site,{id:5,shortname:'BIO'},[{name:'Week',modules:[{...module,contents}]}]);
  assert.equal(files.length,6);
  assert.notEqual(files[0].segments[3].toLowerCase(),files[1].segments[3].toLowerCase(),'Distinct original directories must not merge');
  assert.equal(files[0].segments[3],files[2].segments[3]);
  assert.equal(files[0].segments[3],files[4].segments[3]);
  assert.equal(files[1].segments[3],files[3].segments[3]);
  assert.equal(files[1].segments[3],files[5].segments[3]);
 }
});

test('discovery does not turn other modules, inaccessible resources, or repository aliases into downloads', () => {
 assert.equal(typeof core.collectFiles,'function','Native file discovery is not implemented');
 const sections=[{name:'Week',modules:[{...module,uservisible:false,contents:[file()]},{...module,modname:'quiz',contents:[file()]},{...module,contents:[file('external.pdf',{isexternalfile:true}),file('link',{type:'url'})]}]}];
 assert.equal(core.collectFiles(site,{id:5,shortname:'BIO'},sections).files.length,0);
});

test('file URL validation rejects foreign hosts, wrong contexts, path traversal, and unknown or duplicate query parameters', () => {
 assert.equal(typeof core.validateFileUrl,'function','File URL validation is not implemented');
 const bad=[file('x.pdf',{fileurl:'https://other.example/x.pdf'}),file('x.pdf',{fileurl:`${site.base}/webservice/pluginfile.php/43/mod_resource/content/2/x.pdf`}),file('x.pdf',{filepath:'/../',fileurl:`${site.base}/webservice/pluginfile.php/42/mod_resource/content/2/x.pdf`}),file('x.pdf',{fileurl:`${site.base}/webservice/pluginfile.php/42/mod_resource/content/2/x.pdf?offline=1`}),file('x.pdf',{fileurl:`${site.base}/webservice/pluginfile.php/42/mod_resource/content/2/x.pdf?forcedownload=1&forcedownload=1`})];
 for(const content of bad) assert.throws(()=>core.validateFileUrl(site,module,content));
 const withToken=file('x.pdf',{fileurl:`${site.base}/webservice/pluginfile.php/42/mod_resource/content/2/x.pdf?token=${'b'.repeat(32)}&amp;forcedownload=1`});
 const clean=core.validateFileUrl(site,module,withToken);
 assert.ok(!clean.includes('token=')); assert.ok(clean.endsWith('?forcedownload=1'));
 const query=file('x.pdf',{fileurl:`${site.base}/webservice/pluginfile.php?file=${encodeURIComponent('/42/mod_resource/content/2/x.pdf')}`});
 assert.ok(core.validateFileUrl(site,module,query).includes('?file='));
});
