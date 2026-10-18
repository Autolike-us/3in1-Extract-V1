// The service worker must not lose log lines, rows or run updates when many messages arrive at once.
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const store = {}; let listener;
const delay = () => new Promise((r) => setTimeout(r, Math.random() * 6)); // slow, jittery storage exposes races
const chrome = {
  runtime: { id: 'x', onMessage: { addListener: (f) => { listener = f; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, getURL: (u) => u },
  storage: { local: {
    get: async (k) => { await delay(); const o = {}; for (const key of [].concat(k)) if (key in store) o[key] = JSON.parse(JSON.stringify(store[key])); await delay(); return o; },
    set: async (o) => { await delay(); Object.assign(store, JSON.parse(JSON.stringify(o))); },
    remove: async (k) => { await delay(); for (const key of [].concat(k)) delete store[key]; },
  } },
  declarativeNetRequest: { updateSessionRules: async () => {} },
  tabs: { query: async () => [], create: async () => {}, update: async () => ({}), get: async () => ({}), sendMessage: async () => ({ ok: true }), onUpdated: { addListener() {}, removeListener() {} } },
  windows: { update: async () => {} },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), { chrome, setTimeout, clearTimeout, console, Date, Math, JSON, Promise, Array, Object, String });
const send = (m) => new Promise((r) => listener(m, {}, r));
(async () => {
  store.runs = [{ id: 'r1', status: 'running', count: 0, tabId: 1 }]; store['rows:r1'] = [];
  const jobs = [];
  for (let i = 0; i < 300; i++) jobs.push(send({ type: 'log', runId: 'r1', entry: { t: i, l: 'info', m: 'line ' + i } }));
  for (let i = 0; i < 60; i++) jobs.push(send({ type: 'rows', runId: 'r1', rows: [{ id: 'a' + i }, { id: 'b' + i }] }));
  for (let i = 0; i < 40; i++) jobs.push(send({ type: 'progress', runId: 'r1', count: i, note: 'n' + i }));
  await Promise.all(jobs);
  await send({ type: 'done', runId: 'r1', count: 120, stopped: false, error: null, warning: 'w' });
  await new Promise((r) => setTimeout(r, 1200));
  const lines = new Set((store.debugLog || []).map((e) => e.m));
  assert.equal(lines.size, 300, 'all 300 log lines kept, got ' + lines.size);
  assert.equal(store['rows:r1'].length, 120, 'all 120 rows kept, got ' + store['rows:r1'].length);
  assert.equal(store.runs[0].status, 'done'); assert.equal(store.runs[0].count, 120); assert.equal(store.runs[0].warning, 'w');
  console.log('PASS background keeps every log line, row and run update under concurrent messages');
})().catch((e) => { console.error(e); process.exit(1); });
