import {normalizeSite,parseCallback,connectWithToken,UserError} from './core.js';
import {detectSite} from './detect.js';
import {openDownloader} from './launcher.js';
import {checkSiteCooldown,RequestPauseError} from './request-policy.js';
const store = chrome.storage.session;
const controllers = new Map();
let handling = '';
const safeMessage = error => error instanceof UserError || error instanceof RequestPauseError ? error.message : 'The connection could not finish. Try again or use an existing Moodle token.';
let stateChanges = Promise.resolve();
function serialize(task) {
  const result = stateChanges.then(task);
  stateChanges = result.catch(()=>{});
  return result;
}

function cancelConnection(error = '', keepOrigin = '', attempt) {
  return serialize(()=>clearConnection(error,keepOrigin,attempt));
}
async function clearConnection(error,keepOrigin,attempt) {
  const {pending,connection,activeSite,attempt:currentAttempt} = await store.get(['pending','connection','activeSite','attempt']);
  if (attempt !== undefined && currentAttempt !== attempt) return;
  controllers.get(currentAttempt)?.abort();
  controllers.delete(currentAttempt);
  await store.remove(['pending','connection','attempt','activeSite']);
  await store.set({phase:'idle',error});
  if (pending?.tabId) await chrome.tabs.remove(pending.tabId).catch(()=>{});
  const origin = connection?.site?.origin ?? pending?.site?.origin ?? activeSite;
  if (origin && origin !== keepOrigin) await chrome.permissions.remove({origins:[origin+'/*']}).catch(()=>{});
}
async function verify(site,token,attempt) {
  const controller = await serialize(async()=>{
    if ((await store.get('attempt')).attempt !== attempt) return null;
    const current = new AbortController();controllers.set(attempt,current);return current;
  });
  if (!controller) return;
  try {
  const connection = await connectWithToken(site,token,fetch,controller.signal);
  await serialize(async()=>{
    if ((await store.get('attempt')).attempt !== attempt) return;
    await store.set({connection,phase:'ready',error:''});
    await chrome.storage.local.set({lastSite:site.base});
    await store.remove(['pending','attempt']);
  });
  } finally { controllers.delete(attempt); }
}
async function start(message,passport) {
  const site = normalizeSite(message.site);
  await checkSiteCooldown(site.origin);
  await serialize(async()=>{
    if (!await chrome.permissions.contains({origins:[site.origin+'/*']})) throw new UserError('permission','Allow access to this Moodle website first.');
    await clearConnection('',site.origin);
    await store.set({attempt:passport,activeSite:site.origin,error:'',phase:message.type === 'token' ? 'verifying' : 'login'});
    if (message.type === 'token') return;
    const tab = await chrome.tabs.create({url:'about:blank',active:true});
    await store.set({pending:{site,passport,tabId:tab.id,expiresAt:Date.now()+300000}});
    const launch = new URL(site.base+'/admin/tool/mobile/launch.php');
    launch.search = new URLSearchParams({service:'moodle_mobile_app',passport,urlscheme:'coursefiles-'+chrome.runtime.id}).toString();
    await chrome.tabs.update(tab.id,{url:launch.href});
  });
  if (message.type === 'token') await verify(site,message.token,passport);
}
async function capture(details) {
  const {pending} = await store.get('pending');
  if (!pending || handling === pending.passport || details.tabId !== pending.tabId) return;
  const url = new URL(details.url);
  if (url.origin !== pending.site.origin || url.pathname !== pending.site.path+'/admin/tool/mobile/launch.php' || url.searchParams.get('passport') !== pending.passport || url.searchParams.get('service') !== 'moodle_mobile_app') return;
  const location = details.responseHeaders?.find(h=>h.name.toLowerCase()==='location')?.value;
  if (!location || !/^[a-z][a-z0-9+.-]*:\/\/token=/i.test(location)) return;
  try {
    const token = await serialize(async()=>{
      const current = await store.get(['pending','attempt']);
      if (current.attempt !== pending.passport || current.pending?.passport !== pending.passport || handling === pending.passport) return;
      handling = pending.passport;
      const {token} = parseCallback(location,pending);
      await store.remove('pending');
      await store.set({phase:'verifying'});
      await chrome.tabs.remove(pending.tabId).catch(()=>{});
      return token;
    });
    if (!token) return;
    await verify(pending.site,token,pending.passport);
  } catch (error) { await cancelConnection(safeMessage(error),'',pending.passport); }
  finally { if (handling === pending.passport) handling = ''; }
}
chrome.webRequest.onHeadersReceived.addListener(details=>{void capture(details).catch(()=>{});},{urls:['https://*/*'],types:['main_frame']},['responseHeaders']);
chrome.tabs.onRemoved.addListener(tabId=>{void (async()=>{
  const {pending}=await store.get('pending');
  if (pending?.tabId===tabId) await cancelConnection('The sign-in tab was closed. Connect again.','',pending.passport);
})().catch(()=>{});});
chrome.action.onClicked.addListener(tab=>{
  // Opening the utility must not depend on page inspection succeeding.
  void openDownloader(tab).then(()=>chrome.action.setBadgeText({text:''})).catch(()=>{
    void chrome.action.setBadgeText({text:'!'});
    void chrome.action.setTitle({title:'Course Files could not open. Click to try again.'});
  });
  void detectSite(tab).then(site=>site?store.set({detectedSite:{site,detectedAt:Date.now()}}):undefined).catch(()=>{});
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || !sender.url || new URL(sender.url).pathname!=='/app.html') return false;
  if(!['connect','token','disconnect','cancel'].includes(message.type))return false;
  const attempt = ['connect','token'].includes(message.type) ? [...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('') : undefined;
  void (async()=>{
    if(['disconnect','cancel'].includes(message.type))await cancelConnection(message.timeout?'Connection timed out. Connect again.':'');
    else await start(message,attempt);
    respond({ok:true});
  })().catch(async error=>{if(attempt !== undefined)await cancelConnection(safeMessage(error),'',attempt);respond({ok:false,error:safeMessage(error)});});
  return true;
});
void store.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
