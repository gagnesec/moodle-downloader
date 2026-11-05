import {normalizeSite} from './core.js';

export function siteFromPage(tabUrl, signals = {}) {
  let page;
  try { page = new URL(tabUrl); } catch { return null; }
  if (page.protocol !== 'https:' || page.username || page.password) return null;
  try {
    if (typeof signals.root === 'string' && signals.root.length <= 2048) {
      const site = normalizeSite(signals.root);
      if (site.origin !== page.origin || (site.path && page.pathname !== site.path && !page.pathname.startsWith(site.path+'/'))) return null;
      return site;
    }
    // A generator tag identifies Moodle, but not an arbitrary document's install root.
    if (signals.moodle && (page.pathname === '/' || /\/index\.php\/?$/.test(page.pathname))) return normalizeSite(page.href);
    // Common Moodle routes are a useful fallback when the document cannot be inspected.
    if (/\/(?:course\/view\.php|mod\/(?:resource|folder|lti|page|book)\/(?:view|index)\.php|my(?:\/index\.php)?|login\/index\.php|admin\/tool\/mobile\/launch\.php)\/?$/.test(page.pathname)) return normalizeSite(page.href);
  } catch { return null; }
  return null;
}

export async function detectSite(tab, scripting = chrome.scripting) {
  if (!Number.isInteger(tab?.id) || typeof tab.url !== 'string' || !tab.url.startsWith('https://')) return null;
  let signals = {};
  try {
    const [injection] = await scripting.executeScript({
      target:{tabId:tab.id},world:'MAIN',
      func:async() => {
        const read = () => {
          const root = globalThis.M?.cfg?.wwwroot;
          const generator = document.querySelector('meta[name="generator"]')?.content ?? '';
          return {root:typeof root === 'string' && root.trim() ? root : null,moodle:typeof root === 'string' && !!root.trim() || /^moodle\b/i.test(generator)};
        };
        let signals = read();
        const waitForConfiguration = document.readyState === 'loading' || signals.moodle;
        for (let attempt = 0; !signals.root && waitForConfiguration && attempt < 10; attempt++) {
          await new Promise(resolve=>setTimeout(resolve,100));
          signals = read();
        }
        return signals;
      }
    });
    signals = injection?.result ?? {};
  } catch { /* Restricted documents can still be recognized by their ordinary Moodle route. */ }
  return siteFromPage(tab.url,signals);
}
