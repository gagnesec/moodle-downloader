export class UserError extends Error {
  constructor(code, message) { super(message); this.name = 'UserError'; this.code = code; }
}

export function normalizeSite(input) {
  let text = String(input ?? '').trim();
  if (!text || text.length > 2048 || /[\\\u0000-\u001f]/.test(text)) {
    throw new UserError('site', 'Paste your Moodle website address.');
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url;
  try { url = new URL(text); }
  catch { throw new UserError('site', 'That website address is not valid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || /%2f|%5c|%00/i.test(url.pathname)) {
    throw new UserError('site', 'Use an HTTPS Moodle address without a username or password.');
  }
  const knownPage = /\/(?:course\/view\.php|login\/index\.php|my(?:\/index\.php)?|admin\/tool\/mobile\/launch\.php|index\.php)(?:\/)?$/;
  const match = url.pathname.match(knownPage);
  if ((url.search && !match) || [...url.searchParams.keys()].some(key => /^(?:ws)?token$/i.test(key))) throw new UserError('site', 'Paste the Moodle home, dashboard, or course address - not a token link.');
  const pathname = (match ? url.pathname.slice(0, match.index) : url.pathname).replace(/\/+$/, '');
  if (pathname.split('/').some(part => !part && pathname && part !== pathname.split('/')[0])) {
    throw new UserError('site', 'Use the exact Moodle website address.');
  }
  return { base: url.origin + pathname, origin: url.origin, path: pathname };
}

// Moodle uses MD5 only to correlate its callback to the pending passport.
// This is not used for encryption, signatures, or password storage.
export function md5(text) {
  const input = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  padded.set(input); padded[input.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, input.length * 8, true);
  view.setUint32(padded.length - 4, Math.floor(input.length / 0x20000000), true);
  const shifts = [[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]];
  let h = [0x67452301,0xefcdab89,0x98badcfe,0x10325476];
  for (let offset = 0; offset < padded.length; offset += 64) {
    let [a,b,c,d] = h;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5*i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3*i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7*i) % 16; }
      const sum = (a + f + Math.floor(Math.abs(Math.sin(i+1)) * 0x100000000) + view.getUint32(offset + g*4, true)) | 0;
      const shift = shifts[Math.floor(i/16)][i%4];
      const rotated = (sum << shift) | (sum >>> (32-shift));
      [a,b,c,d] = [d,(b + rotated) | 0,b,c];
    }
    h = [(h[0]+a)|0,(h[1]+b)|0,(h[2]+c)|0,(h[3]+d)|0];
  }
  const bytes = new Uint8Array(16); const output = new DataView(bytes.buffer);
  h.forEach((word,i) => output.setUint32(i*4, word, true));
  return [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
}

export function parseCallback(location, pending, now = Date.now()) {
  const fail = () => { throw new UserError('callback', 'Moodle returned an invalid or expired connection response. Connect again.'); };
  if (!pending || now >= pending.expiresAt || typeof location !== 'string' || location.length > 4096) return fail();
  const match = location.match(/^[a-z][a-z0-9+.-]*:\/\/token=([a-z0-9+/=]+)$/i);
  if (!match) return fail();
  let fields;
  try { fields = atob(match[1]).split(':::'); } catch { return fail(); }
  if (![2,3].includes(fields.length) || fields[0] !== md5(pending.site.base + pending.passport) || !/^[a-f0-9]{32}$/i.test(fields[1])) return fail();
  return { token: fields[1] };
}


export function safeName(value, limit = 64) {
  let name = [...String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')].slice(0, limit).join('').replace(/[ .]+$/g, '').trim();
  if (!name || name === '.' || name === '..') name = 'untitled';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return name;
}

export function validateFileUrl(site, module, content) {
  const fail = () => { throw new UserError('file-url', 'This item is not a supported native Moodle file.'); };
  if (!['resource','folder'].includes(module.modname) || module.uservisible !== true || !Number.isSafeInteger(module.contextid) || module.contextid <= 0 || content.type !== 'file' || content.isexternalfile !== false) return fail();
  if (typeof content.filename !== 'string' || !content.filename || /[\/\\\u0000-\u001f]/.test(content.filename)) return fail();
  const dirs = String(content.filepath ?? '/').split('/').filter(Boolean);
  if (dirs.some(s => s === '.' || s === '..' || /[\\\u0000-\u001f]/.test(s))) return fail();
  let url;
  try { url = new URL(String(content.fileurl).replace(/&amp;forcedownload=/g, '&forcedownload=')); } catch { return fail(); }
  const endpoint = site.path + '/webservice/pluginfile.php';
  if (url.protocol !== 'https:' || url.origin !== site.origin || url.username || url.password || url.hash || (url.pathname !== endpoint && !url.pathname.startsWith(endpoint + '/'))) return fail();
  const allowed = new Set(['file','forcedownload','token','wstoken']);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return fail();
  if (url.searchParams.has('forcedownload') && url.searchParams.get('forcedownload') !== '1') return fail();
  let relative;
  if (url.pathname === endpoint) {
    if (!url.searchParams.has('file')) return fail();
    relative = url.searchParams.get('file');
  } else {
    if (url.searchParams.has('file')) return fail();
    try { relative = url.pathname.slice(endpoint.length).split('/').map(decodeURIComponent).join('/'); } catch { return fail(); }
  }
  const pieces = relative.split('/').slice(1);
  if (!relative.startsWith('/') || pieces.some(s => !s || s === '.' || s === '..' || /[\\\u0000-\u001f]/.test(s))) return fail();
  if (pieces[0] !== String(module.contextid) || pieces[1] !== 'mod_' + module.modname || pieces[2] !== 'content' || !/^\d+$/.test(pieces[3] ?? '') || pieces.slice(4).join('/') !== [...dirs,content.filename].join('/')) return fail();
  url.searchParams.delete('token'); url.searchParams.delete('wstoken');
  return url.href;
}

export function collectFiles(site, course, sections) {
  const files = [], skipped = [], seen = new Set(), destinations = new Set(), directories = new Map();
  for (const section of sections) for (const module of section.modules ?? []) {
    if (!['resource','folder'].includes(module.modname)) continue;
    if (module.uservisible !== true) { skipped.push({name:module.name,reason:'Restricted activity'}); continue; }
    for (const content of module.contents ?? []) {
      if (content.type !== 'file') continue;
      let url;
      try { url = validateFileUrl(site,module,content); }
      catch { skipped.push({name:content.filename ?? module.name,reason:'External or unsupported file'}); continue; }
      const key = JSON.stringify([site.base,course.id,module.id,content.filepath,content.filename]);
      if (seen.has(key)) continue;
      seen.add(key);
      const rawDirectories = [course.shortname || course.fullname,section.name || 'Course files',`${module.name} [${module.id}]`,...String(content.filepath ?? '/').split('/').filter(Boolean)];
      const segments = [safeName(course.shortname || course.fullname,40) + ` [${course.id}]`,safeName(section.name || 'Course files',32),safeName(module.name,32) + ` [${module.id}]`,...rawDirectories.slice(3).map(s => safeName(s,32)),safeName(content.filename,110)];
      for (let index = 0; index < segments.length; index++) {
        const isDirectory = index < segments.length-1;
        const directoryKey = JSON.stringify(rawDirectories.slice(0,index+1));
        if (isDirectory && directories.has(directoryKey)) {
          segments[index] = directories.get(directoryKey);
          continue;
        }
        const original = segments[index];
        let suffix = 1;
        while (destinations.has(segments.slice(0,index+1).join('/').toLocaleLowerCase('en-US'))) {
          suffix++;
          const dot = isDirectory ? -1 : original.lastIndexOf('.');
          segments[index] = dot > 0 ? `${original.slice(0,dot)} (${suffix})${original.slice(dot)}` : `${original} (${suffix})`;
        }
        destinations.add(segments.slice(0,index+1).join('/').toLocaleLowerCase('en-US'));
        if (isDirectory) directories.set(directoryKey,segments[index]);
      }
      files.push({key,name:content.filename,segments,size:Number(content.filesize)||0,mimetype:content.mimetype||'',module:{id:module.id,contextid:module.contextid,modname:module.modname,uservisible:true},content:{...content,fileurl:url},courseId:course.id});
    }
  }
  return {files,skipped};
}


const READ_FUNCTIONS = new Set(['core_webservice_get_site_info','core_enrol_get_users_courses','core_course_get_contents']);
async function callMoodle(site, token, name, params, signal, transport = fetch) {
  if (!READ_FUNCTIONS.has(name) || !/^[a-f0-9]{32}$/i.test(token)) throw new UserError('connection','Connect to Moodle again.');
  const canonical = normalizeSite(site.base);
  const body = new URLSearchParams({...params,wstoken:token,wsfunction:name,moodlewsrestformat:'json'});
  let response;
  try {
    response = await transport(canonical.base + '/webservice/rest/server.php',{method:'POST',body,credentials:'omit',redirect:'error',cache:'no-store',signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000)});
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw new UserError('network','Could not reach Moodle. Check the address and connection, then try again.');
  }
  if (!response.ok) throw new UserError('network',`Moodle returned HTTP ${response.status}. Try again later.`);
  let data;
  try { data = await response.json(); } catch { throw new UserError('response','Moodle did not return the expected API response. Check the website address.'); }
  if (data && !Array.isArray(data) && (data.exception || data.errorcode)) {
    if (['invalidtoken','accessexception','requireloginerror'].includes(data.errorcode)) throw new UserError('connection','Your Moodle connection expired or was rejected. Connect again.');
    throw new UserError('access','Moodle did not allow this request. Your school may restrict mobile/API access.');
  }
  return data;
}

export async function connectWithToken(site, token, transport = fetch) {
  if (!/^[a-f0-9]{32}$/i.test(token)) throw new UserError('token','Use a valid Moodle service token.');
  const info = await callMoodle(site,token,'core_webservice_get_site_info',{},undefined,transport);
  if (!info.siteurl || normalizeSite(info.siteurl).base !== site.base || !Number.isSafeInteger(info.userid)) throw new UserError('site','The account response did not match this Moodle address. Use the exact Moodle home address.');
  const functions = new Set((info.functions ?? []).map(f => f.name));
  if (info.downloadfiles !== 1 || [...READ_FUNCTIONS].some(f => !functions.has(f))) throw new UserError('unsupported','This Moodle service does not allow the course-file access this extension needs.');
  const rows = await callMoodle(site,token,'core_enrol_get_users_courses',{userid:info.userid,returnusercount:'0'},undefined,transport);
  if (!Array.isArray(rows)) throw new UserError('response','Moodle did not return a course list.');
  const courses = rows.filter(c => Number.isSafeInteger(c.id) && c.id > 0).map(c => ({id:c.id,shortname:String(c.shortname ?? ''),fullname:String(c.fullname ?? c.shortname ?? 'Course')}));
  return {site,token,user:{id:info.userid,name:String(info.fullname ?? 'Connected account')},courses};
}

export async function fetchContents(connection, courseId, modname, signal, transport = fetch) {
  if (!connection.courses.some(c => c.id === courseId) || !['resource','folder'].includes(modname)) throw new UserError('selection','Choose one of your listed courses.');
  const data = await callMoodle(connection.site,connection.token,'core_course_get_contents',{
    courseid:courseId,'options[0][name]':'modname','options[0][value]':modname,
    'options[1][name]':'excludecontents','options[1][value]':'0',
    'options[2][name]':'includestealthmodules','options[2][value]':'0'
  },signal,transport);
  if (!Array.isArray(data)) throw new UserError('response','Moodle did not return course file information.');
  return data;
}


async function writeJson(directory, name, data) {
  const handle = await directory.getFileHandle(name,{create:true});
  const writer = await handle.createWritable();
  try { await writer.write(JSON.stringify(data,null,2)); await writer.close(); }
  catch (error) { await writer.abort().catch(()=>{}); throw error; }
}

export async function downloadFiles(connection, files, root, onProgress = () => {}, signal) {
  if (!files.length) throw new UserError('selection','Select files to download.');
  signal?.throwIfAborted();
  for (const file of files) {
    validateFileUrl(connection.site,file.module,file.content);
    if (!file.segments?.length || file.segments.some(s => s !== safeName(s,200))) throw new UserError('path','An unsafe file path was rejected. Rescan your course.');
  }
  const stamp = new Date().toISOString().slice(0,19).replaceAll(':','-');
  const directoryName = 'Moodle ' + stamp + ' ' + crypto.randomUUID().slice(0,8);
  const directory = await root.getDirectoryHandle(directoryName,{create:true});
  const report = {site:connection.site.base,createdAt:new Date().toISOString(),directoryName,total:files.length,completed:0,failed:0,cancelled:false,files:files.map(f=>({name:f.name,path:f.segments.join('/'),status:'not-started',bytes:0}))};
  for (let index = 0; index < files.length; index++) {
    if (signal?.aborted) { report.cancelled = true; break; }
    const file = files[index], item = report.files[index];
    let parent, writer, reader, created = false;
    const progress = () => onProgress({total:report.total,completed:report.completed,failed:report.failed,current:file.name,bytes:item.bytes,fileSize:file.size,index});
    progress();
    try {
      const url = validateFileUrl(connection.site,file.module,file.content);
      let response;
      try { response = await fetch(url,{method:'POST',body:new URLSearchParams({token:connection.token}),credentials:'omit',redirect:'error',cache:'no-store',signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000)}); }
      catch { signal?.throwIfAborted(); throw new UserError('download','The file request failed or redirected. It was not saved.'); }
      if (!response.ok || !response.body) throw new UserError('download','Moodle did not permit this file download. Reconnect or rescan the course.');
      const actualType = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
      const expectedType = file.mimetype.toLowerCase();
      if ((actualType === 'text/html' && expectedType !== 'text/html') || (actualType === 'application/json' && expectedType !== 'application/json')) {
        await response.body.cancel();
        throw new UserError('download','Moodle returned a login or error page instead of this file. Reconnect and rescan.');
      }
      parent = directory;
      for (const part of file.segments.slice(0,-1)) parent = await parent.getDirectoryHandle(part,{create:true});
      const name = file.segments.at(-1);
      try { await parent.getFileHandle(name); throw new UserError('exists','A file already exists at this destination; it was not overwritten.'); }
      catch (error) { if (error.name !== 'NotFoundError') throw error; }
      const handle = await parent.getFileHandle(name,{create:true}); created = true;
      writer = await handle.createWritable(); reader = response.body.getReader();
      let lastProgress = 0;
      while (true) {
        signal?.throwIfAborted();
        const {done,value} = await reader.read();
        if (done) break;
        await writer.write(value); item.bytes += value.byteLength;
        if (Date.now()-lastProgress > 150) { progress(); lastProgress = Date.now(); }
      }
      signal?.throwIfAborted();
      if (file.size > 0 && item.bytes !== file.size) throw new UserError('changed','The file size changed since the scan. Rescan before downloading it again.');
      await writer.close(); writer = null;
      item.status = 'saved'; report.completed++;
    } catch (error) {
      await reader?.cancel().catch(()=>{});
      await writer?.abort().catch(()=>{});
      if (created) await parent.removeEntry(file.segments.at(-1)).catch(()=>{});
      if (signal?.aborted || error.name === 'AbortError') { item.status = 'cancelled'; report.cancelled = true; break; }
      item.status = 'failed'; report.failed++;
      item.error = error instanceof UserError ? error.message : 'This file could not be saved. Check folder access and available disk space.';
      if (['NotAllowedError','QuotaExceededError'].includes(error.name)) break;
    }
    progress();
  }
  report.notStarted = report.files.filter(f => f.status === 'not-started').length;
  report.reportWritten = true;
  try { await writeJson(directory,'_download-report.json',report); }
  catch { report.reportWritten = false; }
  onProgress({total:report.total,completed:report.completed,failed:report.failed,current:'',bytes:0,finished:true});
  return report;
}
