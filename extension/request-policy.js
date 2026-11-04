export class RequestPauseError extends Error {
  constructor(message, retryAt, status) {
    super(message);
    this.name = 'RequestPauseError';
    this.code = 'request-paused';
    this.retryAt = retryAt;
    this.status = status;
  }
}

const keyFor = origin => `moodle-request:${origin}`;
const pauseError = record => new RequestPauseError(
  record.status === 429
    ? 'This school is rate limiting requests. Requests are paused; try again later.'
    : record.status === 401 || record.status === 403
      ? 'Permission denied by this school. Requests are paused; check your access before trying again.'
      : "This school's server is unavailable. Requests are paused; try again later.",
  record.retryAt, record.status,
);

function retryTime(value, now, fallback) {
  const text = value?.trim() || '';
  const parsed = /^\d+$/.test(text) ? now + Number(text) * 1000
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[, ]/.test(text) ? Date.parse(text) : NaN;
  return Number.isSafeInteger(parsed) && parsed <= 8.64e15 && parsed > now ? parsed : now + fallback;
}

const unavailableError = () => new RequestPauseError(
  'Request safety controls are unavailable. No requests can start; reopen the extension and try again.',
  null, null,
);

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, Math.min(ms, 2_147_483_647));
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createRequestPolicy({ storage, locks, clock = Date.now, sleep = abortableSleep } = {}) {
  async function checkSiteCooldown(origin) {
    if (typeof storage?.get !== 'function' || typeof storage?.set !== 'function' || typeof locks?.request !== 'function') {
      throw unavailableError();
    }
    const record = (await storage.get(keyFor(origin)))[keyFor(origin)] || {};
    if (record.retryAt > clock()) throw pauseError(record);
    return record;
  }

  async function acquireRequest(origin, signal) {
    signal?.throwIfAborted();
    await checkSiteCooldown(origin);
    return new Promise((resolve, reject) => {
      locks.request(keyFor(origin), { mode: 'exclusive', signal }, async () => {
        const key = keyFor(origin);
        const record = await checkSiteCooldown(origin);
        signal?.throwIfAborted();
        let wait;
        while ((wait = (record.lastStart ?? -Infinity) + 2000 - clock()) > 0) {
          await sleep(wait, signal);
          signal?.throwIfAborted();
        }
        record.lastStart = clock();
        await storage.set({ [key]: record });
        signal?.throwIfAborted();
        let release;
        const held = new Promise(done => { release = done; });
        async function check(response) {
          const status = response.status;
          const permission = status === 401 || status === 403;
          if (status !== 429 && !permission && !(status >= 500 && status <= 599)) return;
          const now = clock();
          const minimum = status === 429 ? 0 : 60_000;
          record.retryAt = Math.max(now + minimum, retryTime(response.headers.get('Retry-After'), now, status === 429 ? 300_000 : 60_000));
          record.status = status;
          const error = pauseError(record);
          try { await storage.set({ [key]: record }); }
          catch {
            error.persistenceFailed = true;
            error.message += ` Chrome could not save this cooldown. Do not retry before ${new Date(record.retryAt).toLocaleString()}.`;
          }
          throw error;
        }
        resolve({ check, release });
        await held;
      }).catch(reject);
    });
  }
  return { acquireRequest, checkSiteCooldown };
}

function chromePolicy() {
  return createRequestPolicy({ storage: globalThis.chrome?.storage?.local, locks: globalThis.navigator?.locks });
}

export async function acquireRequest(origin, signal) {
  return chromePolicy().acquireRequest(origin, signal);
}

export async function checkSiteCooldown(origin) {
  return chromePolicy().checkSiteCooldown(origin);
}
