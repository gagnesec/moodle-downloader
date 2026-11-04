import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';

let module = {};
try { module = await import('../extension/request-policy.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

const ORIGIN = 'https://school.example';
const START = Date.UTC(2026, 0, 1);
function memoryStorage() {
  const data = {};
  return {
    data,
    async get(key) { return { [key]: structuredClone(data[key]) }; },
    async set(values) { Object.assign(data, structuredClone(values)); },
  };
}
function harness(storage = memoryStorage(), extra = {}) {
  let now = START;
  const policy = module.createRequestPolicy({
    storage,
    locks: navigator.locks,
    clock: () => now,
    sleep: async ms => { now += ms; },
    ...extra,
  });
  return { ...policy, storage, now: () => now, advance: ms => { now += ms; } };
}
async function settle() { await tick(); await tick(); }

test('request starts are spaced by persisted metadata after a factory reload', async () => {
  const storage = memoryStorage();
  const first = harness(storage);
  const one = await first.acquireRequest(ORIGIN);
  const starts = [first.now()];
  one.release();
  const reloaded = harness(storage);
  const two = await reloaded.acquireRequest(ORIGIN);
  starts.push(reloaded.now());
  two.release();
  assert.deepEqual(starts, [START, START + 2000]);
  const three = await reloaded.acquireRequest(ORIGIN);
  starts.push(reloaded.now());
  three.release();
  assert.deepEqual(starts, [START, START + 2000, START + 4000]);
});

test('429 persists a five-minute pause before throwing and blocks a reloaded policy', async () => {
  const first = harness();
  const lease = await first.acquireRequest(ORIGIN);
  let pause;
  try {
    await assert.rejects(lease.check(new Response(null, { status: 429 })), error => {
      pause = error;
      assert.ok(error instanceof module.RequestPauseError);
      assert.equal(error.code, 'request-paused');
      assert.equal(error.retryAt, START + 300_000);
      assert.equal(error.status, 429);
      assert.match(error.message, /rate limit/i);
      assert.equal(Object.values(first.storage.data)[0].retryAt, error.retryAt);
      return true;
    });
  } finally { lease.release(); }
  const reloaded = harness(first.storage, { sleep: () => assert.fail('A paused request must not wait/retry') });
  await assert.rejects(reloaded.checkSiteCooldown(ORIGIN), { retryAt: pause.retryAt, status: 429 });
  let operations = 0;
  await assert.rejects(reloaded.acquireRequest(ORIGIN).then(value => { operations++; value.release(); }), { code: 'request-paused' });
  assert.equal(operations, 0);
  reloaded.advance(300_000);
  await reloaded.checkSiteCooldown(ORIGIN);
  const resumed = await reloaded.acquireRequest(ORIGIN);
  resumed.release();
});

test('429 parses integer seconds and HTTP dates, falling back for invalid or past values', async () => {
  const cases = [
    ['10', 10_000], ['900', 900_000],
    [new Date(START + 900_000).toUTCString(), 900_000],
    [new Date(START + 10_000).toUTCString(), 10_000],
    [null, 300_000], ['', 300_000], ['nonsense', 300_000],
    ['0', 300_000], ['-1', 300_000], ['1.5', 300_000], ['1e3', 300_000],
    ['2027-01-01', 300_000], ['Infinity', 300_000],
    ['9'.repeat(400), 300_000],
    [new Date(START - 1000).toUTCString(), 300_000],
    [new Date(START).toUTCString(), 300_000],
  ];
  for (const [header, delay] of cases) {
    const policy = harness();
    const lease = await policy.acquireRequest(ORIGIN);
    try {
      const headers = header === null ? {} : { 'Retry-After': header };
      await assert.rejects(lease.check(new Response(null, { status: 429, headers })),
        { retryAt: START + delay, status: 429 }, `Retry-After ${JSON.stringify(header)}`);
    } finally { lease.release(); }
  }
});

test('all 5xx responses impose at least a minute and honor longer Retry-After', async () => {
  for (const [status, header, delay] of [
    [500, null, 60_000], [503, '5', 60_000], [503, '600', 600_000],
    [502, new Date(START + 180_000).toUTCString(), 180_000],
    [599, 'bad', 60_000],
  ]) {
    const policy = harness();
    const lease = await policy.acquireRequest(ORIGIN);
    try {
      await assert.rejects(lease.check(new Response(null, { status, headers: header ? { 'Retry-After': header } : {} })), error => {
        assert.ok(error instanceof module.RequestPauseError);
        assert.equal(error.retryAt, START + delay);
        assert.equal(error.status, status);
        assert.match(error.message, /server.*unavailable/i);
        return true;
      });
    } finally { lease.release(); }
    await assert.rejects(harness(policy.storage).checkSiteCooldown(ORIGIN), { retryAt: START + delay, status });
  }
});

test('401 and 403 stop with a safe permission error and sixty-second cooldown', async () => {
  for (const status of [401, 403]) {
    const policy = harness();
    const lease = await policy.acquireRequest(ORIGIN);
    try {
      const response = new Response('token=secret&private-content', { status });
      await assert.rejects(lease.check(response), error => {
        assert.equal(error.code, 'request-paused');
        assert.equal(error.retryAt, START + 60_000);
        assert.equal(error.status, status);
        assert.match(error.message, /permission/i);
        assert.doesNotMatch(error.message, /secret|private-content|reconnect/i);
        return true;
      });
      assert.equal(response.bodyUsed, false);
    } finally { lease.release(); }
    await assert.rejects(harness(policy.storage).acquireRequest(ORIGIN), { status });
  }
});

test('a permission response cannot shorten the school requested cooldown',async()=>{
 const policy=harness();const lease=await policy.acquireRequest(ORIGIN);
 try{await assert.rejects(lease.check(new Response(null,{status:403,headers:{'Retry-After':'900'}})),{status:403,retryAt:START+900000});}
 finally{lease.release();}
});

test('Chrome-backed exports are lazy and use the current Chrome storage on every call', async () => {
  assert.equal(typeof module.acquireRequest, 'function');
  assert.equal(typeof module.checkSiteCooldown, 'function');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const first = memoryStorage();
  const second = memoryStorage();
  try {
    globalThis.chrome = { storage: { local: first } };
    const lease = await module.acquireRequest(ORIGIN);
    try { await assert.rejects(lease.check(new Response(null, { status: 429 })), { status: 429 }); }
    finally { lease.release(); }
    await assert.rejects(module.checkSiteCooldown(ORIGIN), { status: 429 });
    globalThis.chrome = { storage: { local: second } };
    await module.checkSiteCooldown(ORIGIN);
    const fresh = await module.acquireRequest(ORIGIN);
    fresh.release();
    assert.equal(Object.keys(first.data).length, 1);
    assert.equal(Object.keys(second.data).length, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'chrome', original);
    else delete globalThis.chrome;
  }
});

test('missing storage or WebLocks fails closed with a safe UI error', async () => {
  for (const extra of [{ storage: null }, { locks: null }, { storage: {} }, { locks: {} }]) {
    const policy = harness(memoryStorage(), extra);
    for (const operation of [policy.acquireRequest, policy.checkSiteCooldown]) {
      await assert.rejects(operation(ORIGIN), error => {
        assert.ok(error instanceof module.RequestPauseError);
        assert.equal(error.code, 'request-paused');
        assert.match(error.message, /unavailable.*no request/i);
        assert.equal(error.status, null);
        return true;
      });
    }
  }
  await assert.rejects(module.acquireRequest(ORIGIN), { code: 'request-paused' });
});

test('aborting a queued lock starts no operation and leaves the active stream locked', async () => {
  const policy = harness();
  const active = await policy.acquireRequest(ORIGIN);
  const controller = new AbortController();
  let operations = 0;
  const queued = policy.acquireRequest(ORIGIN, controller.signal).then(lease => { operations++; lease.release(); });
  const rejected = assert.rejects(queued, { name: 'AbortError' });
  await settle();
  controller.abort();
  await rejected;
  assert.equal(operations, 0);
  let nextStarted = false;
  const next = policy.acquireRequest(ORIGIN).then(lease => { nextStarted = true; return lease; });
  await settle();
  assert.equal(nextStarted, false);
  active.release();
  (await next).release();
});

test('aborting a default spacing wait clears its timer and abort listener without a start', async () => {
  const policy = harness(memoryStorage(), { sleep: undefined });
  const first = await policy.acquireRequest(ORIGIN);
  first.release();
  const before = structuredClone(policy.storage.data);
  const controller = new AbortController();
  const { getEventListeners } = await import('node:events');
  const initialTimers = process.getActiveResourcesInfo().filter(name => name === 'Timeout').length;
  const pending = policy.acquireRequest(ORIGIN, controller.signal);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  for (let turn = 0; turn < 100 && !getEventListeners(controller.signal, 'abort').length; turn++) await tick();
  assert.ok(getEventListeners(controller.signal, 'abort').length > 0, 'Spacing wait should be abortable');
  controller.abort();
  await rejected;
  await settle();
  assert.deepEqual(policy.storage.data, before, 'An aborted wait must not record a start');
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(process.getActiveResourcesInfo().filter(name => name === 'Timeout').length, initialTimers);
  const next = harness(policy.storage);
  (await next.acquireRequest(ORIGIN)).release();
});

test('cancellation during granted-lock awaits never returns a lease', async () => {
  for (const stage of ['read', 'sleep', 'write']) {
    const controller = new AbortController();
    const storage = memoryStorage();
    const seed = harness(storage);
    (await seed.acquireRequest(ORIGIN)).release();
    const originalGet = storage.get;
    const originalSet = storage.set;
    let reads = 0;
    storage.get = async key => {
      if (++reads === 2 && stage === 'read') controller.abort();
      return originalGet(key);
    };
    storage.set = async values => {
      if (stage === 'write') controller.abort();
      await originalSet(values);
    };
    const policy = harness(storage, { sleep: async () => {
      if (stage === 'sleep') controller.abort();
      policy.advance(2000);
    } });
    let operations = 0;
    await assert.rejects(policy.acquireRequest(ORIGIN, controller.signal).then(lease => {
      operations++; lease.release();
    }), { name: 'AbortError' }, stage);
    assert.equal(operations, 0);
    (await harness(storage).acquireRequest(ORIGIN)).release();
  }
});

test('an early spacing wake does not admit a start before two seconds', async () => {
  const storage = memoryStorage();
  (await harness(storage).acquireRequest(ORIGIN)).release();
  const policy = harness(storage, { sleep: async ms => policy.advance(Math.min(500, ms)) });
  (await policy.acquireRequest(ORIGIN)).release();
  assert.equal(policy.now(), START + 2000);
});

test('a lease holds the school lock until release across policy instances', async () => {
  assert.equal(typeof module.createRequestPolicy, 'function', 'Request policy is not implemented');
  const storage = memoryStorage();
  const first = harness(storage);
  const second = harness(storage);
  const lease = await first.acquireRequest(ORIGIN);
  let started = false;
  const next = second.acquireRequest(ORIGIN).then(value => { started = true; return value; });
  await settle();
  assert.equal(started, false, 'A second stream must not start while the first lease is held');
  lease.release();
  lease.release(); // Cleanup is idempotent.
  const secondLease = await next;
  assert.equal(started, true);
  secondLease.release();
});
