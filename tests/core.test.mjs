import test from 'node:test';
import assert from 'node:assert/strict';
let core = {};
try { core = await import('../extension/core.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

test('normalizeSite accepts HTTPS and resolves ordinary Moodle course/dashboard addresses', () => {
  assert.equal(typeof core.normalizeSite, 'function', 'Site normalization is not implemented');
  assert.deepEqual(core.normalizeSite('https://school.example/moodle/course/view.php?id=4'), {base:'https://school.example/moodle',origin:'https://school.example',path:'/moodle'});
  assert.equal(core.normalizeSite('school.example/moodle/my/').base, 'https://school.example/moodle');
  assert.equal(core.normalizeSite('https://school.example/').base, 'https://school.example');
  for (const bad of ['http://school.example','https://user:pass@school.example/moodle','javascript:alert(1)','https://school.example/a%2Fb','https://school.example/moodle?token=secret']) {
    assert.throws(() => core.normalizeSite(bad));
  }
});

test('normalizeSite resolves ordinary index.php homepages to their parent', () => {
  for (const path of ['/index.php', '/moodle/index.php', '/nested/moodle/index.php/']) {
    const parent = path.replace(/\/index\.php\/?$/, '');
    assert.equal(core.normalizeSite('https://school.example' + path).base, 'https://school.example' + parent);
  }
  assert.equal(core.normalizeSite('https://school.example/moodle/login/index.php').base, 'https://school.example/moodle');
  for (const path of ['/index.php?token=secret', '/moodle/index.php?wstoken=secret']) {
    assert.throws(() => core.normalizeSite('https://school.example' + path));
  }
});

test('only a fresh matching Moodle callback yields the ordinary token', async () => {
  assert.equal(typeof core.parseCallback, 'function', 'Callback validation is not implemented');
  assert.equal(typeof core.md5, 'function', 'Callback correlation digest is not implemented');
  const { createHash } = await import('node:crypto');
  for (const value of ['', 'abc', 'https://school.example/moodle123', 'école/心理']) {
    assert.equal(core.md5(value), createHash('md5').update(value).digest('hex'));
  }
  const site = core.normalizeSite('https://school.example/moodle');
  const pending = {site, passport:'unique-passport', expiresAt:2000};
  const token = 'a'.repeat(32);
  const encode = value => 'coursefiles://token=' + Buffer.from(value).toString('base64');
  const digest = core.md5(site.base + pending.passport);
  assert.deepEqual(core.parseCallback(encode(`${digest}:::${token}:::private-value-must-not-be-kept`), pending, 1000), {token});
  for (const [callback, time] of [[encode(`${digest}:::${token}`),2001], [encode(`${'0'.repeat(32)}:::${token}`),1000], ['https://other.example/?token=x',1000], [encode(`${digest}:::invalid`),1000], [encode(`${digest}:::${token}:::x:::y`),1000]]) {
    assert.throws(() => core.parseCallback(callback,pending,time));
  }
});
