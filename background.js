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

const waitLoaded = async (tabId) => {
  const t0 = await chrome.tabs.get(tabId);
  if (t0.status !== 'complete') await new Promise((res) => {
    const done = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(); };
    const l = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, 25000);
    chrome.tabs.onUpdated.addListener(l);
  });
  await sleep(2500); // let the single-page app render its first screen
};

/** Tell the tab the user started from (it keeps the progress card in its bottom-right corner). */
const hud = async (run, payload) => { if (run && run.originTabId != null) { try { await chrome.tabs.sendMessage(run.originTabId, { aurora: true, type: 'hud', runId: run.id, label: run.label, ...payload }); } catch (_) {} } };

/** The work happens in a small window of its own: the user's tab stays exactly where it is, and Chrome keeps a visible window loading. */
async function openWorker(url, originTabId) {
  const origin = await chrome.tabs.get(originTabId);
  let left, top;
  try { const from = await chrome.windows.get(origin.windowId); left = Math.max(0, (from.left || 0) + 80); top = Math.max(0, (from.top || 0) + 80); } catch (_) {}
  const w = await chrome.windows.create({ url, type: 'popup', focused: false, width: 820, height: 720, left, top });
  const tabId = w.tabs && w.tabs[0] && w.tabs[0].id;
  if (tabId == null) throw new Error('no tab in the new window');
  try { await chrome.windows.update(origin.windowId, { focused: true }); } catch (_) {}
  await waitLoaded(tabId);
  return { tabId, windowId: w.id };
}
const closeWorker = async (run) => { if (run && run.windowId != null) { try { await chrome.windows.remove(run.windowId); } catch (_) {} } };
chrome.windows.onRemoved.addListener((windowId) => {
  lock(async () => {
    const runs = await get('runs', []);
    const r = runs.find((x) => x.windowId === windowId && ['running', 'paused'].includes(x.status));
    if (!r) return;
    r.status = 'error'; r.error = 'The Aurora window was closed before the run finished. Start it again and leave that window open.'; r.finishedAt = Date.now(); r.note = '';
    await chrome.storage.local.set({ runs });
    hud(r, { state: 'done', msg: 'Stopped', count: r.count || 0 });
  });
});

async function startRun({ tabId, kind, opts, label, platform, goto }) {
  const run = { id: uid(), platform, kind, label: label || kind, opts, tabId, originTabId: tabId, windowId: null, status: 'running', count: 0, note: '', startedAt: Date.now(), finishedAt: null, error: null };
  await lock(async () => { const runs = await get('runs', []); runs.unshift(run); await chrome.storage.local.set({ runs, ['rows:' + run.id]: [] }); });
  let res, workTab = tabId;
  try {
    const origin = await chrome.tabs.get(tabId);
    const url = goto || origin.url;
    await updateRun(run.id, { note: 'Opening a small window for the run…' });
    const w = await openWorker(url, tabId);
    workTab = w.tabId; run.tabId = w.tabId; run.windowId = w.windowId;
    await updateRun(run.id, { tabId: w.tabId, windowId: w.windowId, note: 'Running in its own small window, which closes by itself. Your tab stays as it is.' });
    await logBg('info', 'run opened in its own window', 'window ' + w.windowId);
  } catch (e) {
    await logBg('warn', 'could not open a separate window — using your tab instead', String(e));
    if (goto) { await logBg('info', 'navigating tab to start ' + kind, goto.replace(/\d{6,}/g, '<id>')); await updateRun(run.id, { note: 'Opening the right page…' }); try { await navigate(tabId, goto); } catch (e2) { await logBg('error', 'navigation failed', String(e2)); } }
    run.originTabId = null; await updateRun(run.id, { originTabId: null });
  }
  try { for (let i = 0; ; i++) { try { res = await chrome.tabs.sendMessage(workTab, { aurora: true, type: 'start', runId: run.id, kind, opts }); break; } catch (e) { if (i >= 8) throw e; await sleep(1000); } } }
  catch (e) { await logBg('error', 'cannot reach tab ' + workTab, String(e)); res = { ok: false, error: 'Could not reach the page. Reload the Facebook / Instagram / TikTok tab and try again.' }; }
  if (!res || !res.ok) { await closeWorker(run); await updateRun(run.id, { status: 'error', error: (res && res.error) || 'Failed to start', finishedAt: Date.now() }); return { ok: false, error: res && res.error }; }
  hud(run, { state: 'start' });
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
      case 'progress': { const r = await updateRun(msg.runId, { count: msg.count, note: msg.note || '' }); hud(r, { state: 'progress', count: msg.count, note: msg.note || '' }); return send({}); }
      case 'done': {
        await flush();
        const r = await updateRun(msg.runId, { count: msg.count, status: msg.error ? 'error' : msg.stopped ? 'stopped' : 'done', error: msg.error, finishedAt: Date.now(), note: '', snapshot: msg.snapshot || null, warning: msg.warning || '' });
        hud(r, { state: 'done', msg: msg.error ? 'Stopped — ' + String(msg.error).slice(0, 80) : msg.stopped ? 'Stopped' : 'Done', count: msg.count });
        send({});
        if (r && r.windowId != null) setTimeout(() => closeWorker(r), 1500);
        return;
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

/* CDN hosts check Referer (and sometimes Origin) on media. Give requests made by the extension's own pages the headers a normal page on
   that site would send, so photo / video downloads work. These rules never touch normal browsing (extension-initiated requests only). */
const MEDIA_HOSTS = [
  ['tiktok.com', 'https://www.tiktok.com/'], ['tiktokcdn.com', 'https://www.tiktok.com/'], ['tiktokcdn-us.com', 'https://www.tiktok.com/'], ['tiktokcdn-eu.com', 'https://www.tiktok.com/'],
  ['tiktokv.com', 'https://www.tiktok.com/'], ['tiktokv.us', 'https://www.tiktok.com/'], ['byteoversea.com', 'https://www.tiktok.com/'], ['ibytedtos.com', 'https://www.tiktok.com/'], ['muscdn.com', 'https://www.tiktok.com/'],
  ['cdninstagram.com', 'https://www.instagram.com/'], ['instagram.com', 'https://www.instagram.com/'],
  ['fbcdn.net', 'https://www.facebook.com/'],
];
async function installRules() {
  const mk = ([domain, referer], i) => ({ id: i + 1, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: referer }, { header: 'origin', operation: 'remove' }] },
    condition: { requestDomains: [domain], resourceTypes: ['xmlhttprequest', 'media', 'image', 'other'], initiatorDomains: [chrome.runtime.id] } });
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: Array.from({ length: 40 }, (_, i) => i + 1), addRules: MEDIA_HOSTS.map(mk) });
  } catch (e) { logBg('error', 'could not install download header rules', String(e)); }
}
chrome.runtime.onInstalled.addListener((d) => { installRules(); if (d.reason === 'install') openDashboard('#welcome'); });
chrome.runtime.onStartup.addListener(installRules);
installRules();
