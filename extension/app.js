import {normalizeSite,fetchContents,collectFiles,downloadFiles,UserError} from './core.js';
const $ = id => document.getElementById(id);
const state = {connection:null,files:[],selected:new Set(),busy:'',controller:null,timer:null,targetKey:''};
const friendly = error => error instanceof UserError ? error.message : 'Something prevented this operation. Check your connection and folder access, then try again.';
const bytes = value => value < 1024 ? `${value} B` : value < 1048576 ? `${(value/1024).toFixed(1)} KB` : value < 1073741824 ? `${(value/1048576).toFixed(1)} MB` : `${(value/1073741824).toFixed(1)} GB`;
function notice(text='') { $('notice').textContent=text; $('notice').hidden=!text; }
function showTarget(site,detected=false) {
  const key=site.base+':'+detected;
  if(state.targetKey===key)return;
  state.targetKey=key;$('site').value=site.base;
  $('detected-note').textContent=detected?'Moodle detected from your tab':'Your last Moodle site';
  $('detected-address').textContent=site.base;
  $('detected-target').hidden=false;$('open-moodle-hint').hidden=true;
}
function selectedCourses() { return [...document.querySelectorAll('#course-list input:checked')].map(input=>Number(input.value)); }
function updateCounts() {
  const count=selectedCourses().length;
  $('course-count').textContent=count?`${count} course${count===1?'':'s'} selected`:'Select at least one course.';
  $('scan').disabled=!!state.busy || !count;
  const selectedSize=state.files.reduce((total,file)=>total+(state.selected.has(file.key)?file.size:0),0);
  $('selected-count').textContent=`${state.selected.size} file${state.selected.size===1?'':'s'} selected · ${bytes(selectedSize)}`;
  $('download').disabled=!!state.busy || !state.selected.size;
}
function busy(mode='') {
  state.busy=mode;
  $('workspace').setAttribute('aria-busy',String(!!mode));
  for(const element of document.querySelectorAll('button,input')) element.disabled=!!mode;
  $('cancel').disabled=false;
  $('progress-section').hidden=!mode;
  if(mode){$('progress').removeAttribute('value');$('progress-detail').textContent='';}
  if(mode==='connection')$('progress-title').textContent='Finish signing in on your Moodle page…';
  updateCounts();
}
function resetFiles() { state.files=[];state.selected.clear();$('file-section').hidden=true;$('file-empty').hidden=false;$('result').hidden=true;updateCounts(); }
function renderCourses() {
  $('course-list').replaceChildren();
  for(const course of state.connection.courses){
    const label=document.createElement('label');
    const check=document.createElement('input');check.type='checkbox';check.value=course.id;
    const text=document.createElement('span');
    const title=document.createElement('span');title.className='course-title';title.textContent=course.fullname;
    const code=document.createElement('span');code.className='course-code';code.textContent=course.shortname;
    text.append(title,code);label.append(check,text);$('course-list').append(label);
  }
  if(!state.connection.courses.length)$('course-list').textContent='No enrolled courses were returned by Moodle.';
  updateCounts();
}
function renderFiles(warnings) {
  $('file-list').replaceChildren();
  for(const file of state.files){
    const label=document.createElement('label');
    const check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.key=file.key;check.dataset.fileName=file.name;check.dataset.size=file.size;
    const title=document.createElement('span');
    const name=document.createElement('strong');name.textContent=file.name;
    const location=document.createElement('small');location.className='course-code';location.textContent=file.segments.slice(0,-1).map(s=>s.replace(/ \[\d+\]$/,'')).join(' / ');
    title.append(name,location);
    const size=document.createElement('small');size.className='file-size';size.textContent=bytes(file.size);
    label.append(check,title,size);$('file-list').append(label);
  }
  $('file-summary').textContent=`${state.files.length} file${state.files.length===1?'':'s'} found · ${bytes(state.files.reduce((n,f)=>n+f.size,0))}`;
  if(!state.files.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No downloadable files found. Try other courses or review the notes below.';$('file-list').append(empty);}
  $('scan-warnings').replaceChildren();
  for(const warning of warnings){const li=document.createElement('li');li.textContent=warning;$('scan-warnings').append(li);}
  $('scan-warnings').hidden=!warnings.length;
  $('file-empty').hidden=true;$('file-options').open=true;$('file-section').hidden=false;updateCounts();
}
async function refreshConnection() {
  const saved=await chrome.storage.session.get(['connection','pending','phase','error','detectedSite']);
  if(saved.detectedSite?.site && !state.busy)showTarget(saved.detectedSite.site,true);
  clearTimeout(state.timer);
  if(saved.pending){state.timer=setTimeout(()=>{void chrome.runtime.sendMessage({type:'cancel',timeout:true});},Math.max(0,saved.pending.expiresAt-Date.now()));}
  if(saved.phase==='login'||saved.phase==='verifying'){
    busy('connection');
    $('progress-title').textContent=saved.phase==='verifying'?'Checking your Moodle account…':'Finish signing in on your Moodle page…';
  }else if(state.busy==='connection')busy();
  if(saved.error)notice(saved.error);
  const changed=saved.connection?.token!==state.connection?.token;
  state.connection=saved.connection??null;
  $('connect-section').hidden=!!state.connection;
  $('account').hidden=!state.connection;$('course-section').hidden=!state.connection;
  $('workspace').hidden=!state.connection;
  if(state.connection){
    $('account-name').textContent=state.connection.user.name;
    $('account-site').textContent=state.connection.site.base;
    if(changed){resetFiles();renderCourses();}
  }else if(changed){state.controller?.abort();resetFiles();$('course-list').replaceChildren();}
}
async function connect(useToken=false) {
  notice();
  try{
    const site=normalizeSite($('site').value);
    const token=$('token').value;
    if(useToken && !/^[a-f0-9]{32}$/i.test(token))throw new UserError('token','Paste a valid Moodle service token, without spaces.');
    const granted=await chrome.permissions.request({origins:[site.origin+'/*']});
    if(!granted)throw new UserError('permission','Allow access to your Moodle website to connect.');
    busy('connection');
    const result=await chrome.runtime.sendMessage({type:useToken?'token':'connect',site:site.base,...(useToken?{token}:{})});
    $('token').value='';
    if(!result?.ok)throw new UserError('connection',result?.error??'The connection could not start.');
    await refreshConnection();
  }catch(error){$('token').value='';busy();notice(friendly(error));}
}
$('connect-form').addEventListener('submit',event=>{event.preventDefault();void connect();});
$('connect').addEventListener('click',()=>{void connect();});
$('connect-token').addEventListener('click',()=>{void connect(true);});
$('disconnect').addEventListener('click',()=>{void chrome.runtime.sendMessage({type:'disconnect'}).then(()=>{notice();return refreshConnection();});});
$('course-list').addEventListener('change',()=>{resetFiles();});
for(const [id,checked] of [['courses-all',true],['courses-none',false]])$(id).addEventListener('click',()=>{for(const input of document.querySelectorAll('#course-list input'))input.checked=checked;resetFiles();});
$('scan').addEventListener('click',()=>{void (async()=>{
  const ids=selectedCourses();if(!ids.length||state.busy)return;
  notice();resetFiles();busy('scan');state.controller=new AbortController();
  const warnings=[];
  try{
    for(const [index,id] of ids.entries()){
      const course=state.connection.courses.find(c=>c.id===id);const sections=[];
      $('progress-title').textContent=`Finding files · course ${index+1} of ${ids.length}`;
      $('progress-detail').textContent=course.fullname;
      try{
        sections.push(...await fetchContents(state.connection,id,'resource',state.controller.signal));
        await new Promise(resolve=>setTimeout(resolve,150));
        sections.push(...await fetchContents(state.connection,id,'folder',state.controller.signal));
      }catch(error){if(state.controller.signal.aborted)throw error;warnings.push(`${course.fullname}: ${friendly(error)}`);}
      const found=collectFiles(state.connection.site,course,sections);state.files.push(...found.files);
      if(found.skipped.length)warnings.push(`${course.fullname}: ${found.skipped.length} restricted, external, or unsupported item(s) skipped.`);
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    state.selected=new Set(state.files.map(f=>f.key));renderFiles(warnings);
  }catch(error){resetFiles();if(!state.controller.signal.aborted)notice(friendly(error));else notice('Scan cancelled.');}
  finally{state.controller=null;busy();}
})();});
$('file-list').addEventListener('change',event=>{const input=event.target;if(!input.dataset.key)return;if(input.checked)state.selected.add(input.dataset.key);else state.selected.delete(input.dataset.key);updateCounts();});
for(const [id,predicate] of [['files-all',()=>true],['files-none',()=>false],['files-pdf',file=>/\.pdf$/i.test(file.name)],['files-slides',file=>/\.(pptx?|odp|key)$/i.test(file.name)]])$(id).addEventListener('click',()=>{state.selected=new Set(state.files.filter(predicate).map(f=>f.key));for(const input of document.querySelectorAll('#file-list input'))input.checked=state.selected.has(input.dataset.key);updateCounts();});
$('download').addEventListener('click',()=>{void (async()=>{
  const files=state.files.filter(f=>state.selected.has(f.key));if(!files.length||state.busy)return;
  notice();$('result').hidden=true;
  if(typeof showDirectoryPicker!=='function'){notice('This version needs desktop Chrome with folder access. Update Chrome and open the extension in its own tab.');return;}
  let root;
  try{
    const selection=showDirectoryPicker({mode:'readwrite',id:'course-files',startIn:'downloads'});
    busy('picker');$('progress-title').textContent='Choose a destination folder…';$('cancel').disabled=true;
    root=await selection;
  }
  catch(error){busy();if(error.name!=='AbortError')notice('Chrome could not open that folder. Choose a different folder.');return;}
  busy('download');state.controller=new AbortController();
  try{
    const result=await downloadFiles(state.connection,files,root,progress=>{
      $('progress-title').textContent=`Saved ${progress.completed} of ${progress.total} files${progress.failed?` · ${progress.failed} failed`:''}`;
      const fraction=progress.fileSize?Math.min(progress.bytes/progress.fileSize,0.99):0;
      $('progress').value=(progress.completed+progress.failed+fraction)/progress.total;
      $('progress-detail').textContent=progress.current?`${progress.current} · ${bytes(progress.bytes)}`:'';
    },state.controller.signal);
    $('result-summary').textContent=`${result.cancelled?'Stopped. ':''}Saved ${result.completed} of ${result.total} files${result.failed?` · ${result.failed} failed`:''}${result.notStarted?` · ${result.notStarted} not started`:''}`;
    $('result-root').textContent=result.directoryName;$('result-errors').replaceChildren();
    for(const item of result.files.filter(f=>f.status==='failed')){const li=document.createElement('li');li.textContent=`${item.name}: ${item.error}`;$('result-errors').append(li);}
    if(!result.reportWritten){const li=document.createElement('li');li.textContent='The download report could not be written.';$('result-errors').append(li);}
    $('result').hidden=false;
  }catch(error){if(!state.controller.signal.aborted)notice(friendly(error));else notice('Download cancelled.');}
  finally{state.controller=null;busy();}
})();});
$('cancel').addEventListener('click',()=>{if(state.controller)state.controller.abort();else void chrome.runtime.sendMessage({type:'cancel'});});
$('privacy-open').addEventListener('click',()=>$('privacy').showModal());
$('privacy-close').addEventListener('click',()=>$('privacy').close());
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session' && ['connection','phase','error','pending','detectedSite'].some(key=>key in changes))void refreshConnection();});
window.addEventListener('beforeunload',event=>{if(state.busy==='download'||state.busy==='scan'){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>state.controller?.abort());
void (async()=>{const saved=await chrome.storage.local.get('lastSite');if(saved.lastSite){try{showTarget(normalizeSite(saved.lastSite));}catch{}}await refreshConnection();})();
