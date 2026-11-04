import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'extension');
for(const name of ['core.js','background.js','app.js','detect.js','launcher.js','request-policy.js','course-cache.js']){
 const run=spawnSync(process.execPath,['--check',path.join(dir,name)],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const text=await fs.readFile(path.join(dir,name),'utf8');
 for(const pattern of [/\beval\s*\(/,/new Function\s*\(/,/\.innerHTML\s*=/,/document\.write\s*\(/])assert.ok(!pattern.test(text),`${name}: prohibited dynamic code/HTML`);
}
const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['storage','webRequest','activeTab','scripting']);
assert.ok(!manifest.host_permissions,'Production must request only optional site access');
assert.deepEqual(manifest.optional_host_permissions,['https://*/*']);
assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
for(const name of [manifest.background.service_worker,...Object.values(manifest.icons), 'app.html','app.css','app.js','core.js','request-policy.js','course-cache.js'])assert.ok((await fs.stat(path.join(dir,name))).isFile());
console.log('JavaScript syntax, manifest scope, bundled assets, and dynamic-code checks passed.');
