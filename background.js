/* Aurora Extract — service worker: run bookkeeping + local storage. Nothing is ever sent to a server. */
'use strict';

const FLUSH_MS = 500;
const buffers = new Map(); // runId -> rows[] not yet persisted
const logBuf = [];         // log entries not yet persisted
let flushTimer = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const get = async (k, d) => { const o = await chrome.storage.local.get(k); return o[k] === undefined ? d : o[k]; };

/** Every storage change is a read-modify-write, so they must never overlap (concurrent messages used to overwrite each other
 *  and silently dropped log lines and rows). All writers go through this single queue. Never call lock() from inside lock(). */
let chain = Promise.resolve();
const lock = (fn) => { const r = chain.then(fn); chain = r.catch(() => {}); return r; };

const logBg = (level, m, d) => { logBuf.push({ t: Date.now(), l: level, m, d: d || '' }); scheduleFlush(); };

const updateRun = (runId, patch) => lock(async () => {
  const runs = await get('runs', []);
  const r = runs.find((x) => x.id === runId);
  if (!r) return null;
  Object.assign(r, patch);
  await chrome.storage.local.set({ runs });
  return r;
});

/** Persist buffered rows + log lines (one queued job; safe to call any time). */
const flush = () => lock(async () => {
  flushTimer = null;
  const out = {};
  if (logBuf.length) { const dl = await get('debugLog', []); out.debugLog = dl.concat(logBuf.splice(0)).slice(-800); }
  for (const [runId, rows] of Array.from(buffers)) {
    buffers.delete(runId);
    const key = 'rows:' + runId;
    const cur = key in out ? out[key] : await get(key, []);
    out[key] = cur.concat(rows);
  }
  if (Object.keys(out).length) await chrome.storage.local.set(out);
});
const scheduleFlush = () => { if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function navigate(tabId, url) {
  const tab = await chrome.tabs.get(tabId);
  if ((tab.url || '').split('#')[0] === url.split('#')[0]) return;
  await new Promise((res) => {
    const done = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(); };
    const l = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, 25000);
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.update(tabId, { url });
  });
  await sleep(2500); // let the single-page app render its first screen
}

async function startRun({ tabId, kind, opts, label, platform, goto }) {
  const run = { id: uid(), platform, kind, label: label || kind, opts, tabId, status: 'running', count: 0, note: '', startedAt: Date.now(), finishedAt: null, error: null };
  await lock(async () => { const runs = await get('runs', []); runs.unshift(run); await chrome.storage.local.set({ runs, ['rows:' + run.id]: [] }); });
  let res;
  if (goto) { await logBg('info', 'navigating tab to start ' + kind, goto.replace(/\d{6,}/g, '<id>')); await updateRun(run.id, { note: 'Opening the right page…' }); try { await navigate(tabId, goto); } catch (e) { await logBg('error', 'navigation failed', String(e)); } }
  try { for (let i = 0; ; i++) { try { res = await chrome.tabs.sendMessage(tabId, { aurora: true, type: 'start', runId: run.id, kind, opts }); break; } catch (e) { if (i >= 8) throw e; await sleep(1000); } } }
  catch (e) { await logBg('error', 'cannot reach tab ' + tabId, String(e)); res = { ok: false, error: 'Could not reach the page. Reload the Facebook / Instagram / TikTok tab and try again.' }; }
  if (res && res.ok) { try { const t = await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); await updateRun(run.id, { note: 'Your page tab was brought to the front — keep it visible while Aurora works (Chrome pauses hidden tabs).' }); } catch (_) {} }
  if (!res || !res.ok) { await updateRun(run.id, { status: 'error', error: (res && res.error) || 'Failed to start', finishedAt: Date.now() }); return { ok: false, error: res && res.error }; }
  return { ok: true, runId: run.id };
}

const deleteRun = (runId) => lock(async () => {
  buffers.delete(runId);
  const runs = (await get('runs', [])).filter((r) => r.id !== runId);
  await chrome.storage.local.set({ runs });
  await chrome.storage.local.remove('rows:' + runId);
});

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  (async () => {
    switch (msg && msg.type) {
      case 'rows': { const b = buffers.get(msg.runId) || []; b.push(...msg.rows); buffers.set(msg.runId, b); scheduleFlush(); return send({}); }
      case 'log': { logBuf.push({ ...msg.entry, r: msg.runId }); scheduleFlush(); return send({}); }
      case 'progress': await updateRun(msg.runId, { count: msg.count, note: msg.note || '' }); return send({});
      case 'done': {
        await flush();
        await updateRun(msg.runId, { count: msg.count, status: msg.error ? 'error' : msg.stopped ? 'stopped' : 'done', error: msg.error, finishedAt: Date.now(), note: '', snapshot: msg.snapshot || null, warning: msg.warning || '' });
        return send({});
      }
      case 'startRun': return send(await startRun(msg));
      case 'stopRun': { const r = (await get('runs', [])).find((x) => x.id === msg.runId); if (r) { try { await chrome.tabs.sendMessage(r.tabId, { aurora: true, type: 'stop' }); } catch (_) {} } return send({ ok: true }); }
      case 'pauseRun': { const r = (await get('runs', [])).find((x) => x.id === msg.runId); if (r) { try { await chrome.tabs.sendMessage(r.tabId, { aurora: true, type: 'pause', on: msg.on }); } catch (_) {} await updateRun(msg.runId, { status: msg.on ? 'paused' : 'running' }); } return send({ ok: true }); }
      case 'deleteRun': await deleteRun(msg.runId); return send({ ok: true });
      case 'openDashboard': await openDashboard(msg.hash); return send({ ok: true });
      default: return send({});
    }
  })();
  return true;
});

async function openDashboard(hash = '') {
  const url = chrome.runtime.getURL('dashboard.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true, url: url + hash }); await chrome.windows.update(tabs[0].windowId, { focused: true }); }
  else await chrome.tabs.create({ url: url + hash });
}

/* CDN hosts check Referer on media; give the extension pages a matching one so downloads work. */
async function installRules() {
  const mk = (id, domain, referer) => ({ id, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: referer }] },
    condition: { requestDomains: [domain], resourceTypes: ['xmlhttprequest', 'media', 'image', 'other'], initiatorDomains: [chrome.runtime.id] } });
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1, 2, 3, 4, 5],
      addRules: [mk(1, 'tiktokcdn.com', 'https://www.tiktok.com/'), mk(2, 'tiktokcdn-us.com', 'https://www.tiktok.com/'), mk(3, 'tiktokv.com', 'https://www.tiktok.com/'),
        mk(4, 'cdninstagram.com', 'https://www.instagram.com/'), mk(5, 'fbcdn.net', 'https://www.facebook.com/')],
    });
  } catch (_) {}
}
chrome.runtime.onInstalled.addListener((d) => { installRules(); if (d.reason === 'install') openDashboard('#welcome'); });
chrome.runtime.onStartup.addListener(installRules);
installRules();
