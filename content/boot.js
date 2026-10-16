/* Aurora Extract — message bridge between the extension UI and the platform extractors. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A || A.booted) return;
  A.booted = true;
  const platformId = () => Object.keys(A.platforms).find((p) => A.platforms[p].hosts.test(location.hostname));

  let run = null; // { runId, stop:boolean, paused:boolean }

  function describe() {
    const id = platformId();
    if (!id) return { platform: null };
    const def = A.platforms[id];
    const page = def.detect(new URL(location.href));
    return { platform: id, name: def.name, url: location.href, page, kinds: def.kinds };
  }

  async function start({ runId, kind, opts }) {
    const id = platformId();
    if (!id) return { ok: false, error: 'This tab is not Facebook, Instagram or TikTok.' };
    const def = A.platforms[id];
    const task = def.tasks[kind];
    if (!task) return { ok: false, error: 'This page does not support "' + kind + '".' };
    if (run && !run.done) return { ok: false, error: 'An extraction is already running in this tab.' };
    const state = (run = { runId, stop: false, paused: false, done: false, n: 0 });
    const seen = new Set();
    const delay = Math.max(250, Number(opts.delayMs) || 1200);
    const send = (m) => { try { chrome.runtime.sendMessage(m); } catch (_) {} };
    const log = (level, msg, data) => send({ type: 'log', runId, entry: { t: Date.now(), l: level, m: String(msg).slice(0, 300), d: data == null ? '' : String(data).slice(0, 600) } });
    A.log = log;
    const ctx = {
      log, setWarning: (w) => { state.warning = w; }, opts, limit: Math.max(1, Number(opts.limit) || 200),
      stopped: () => state.stop,
      count: () => state.n,
      pause: async () => { await A.sleep(A.jitter(delay)); while (state.paused && !state.stop) await A.sleep(300); },
      emit(rows) {
        const fresh = [];
        for (const r of [].concat(rows)) {
          if (!r || state.n >= ctx.limit) continue;
          const key = r.id || r.url || JSON.stringify(r);
          if (seen.has(key)) continue;
          seen.add(key); r.platform = id; r.kind = kind; r.sourceUrl = r.sourceUrl || location.href; r.collectedAt = new Date().toISOString();
          fresh.push(r); state.n++;
        }
        if (fresh.length) chrome.runtime.sendMessage({ type: 'rows', runId, rows: fresh });
        return fresh.length;
      },
      progress: (note) => chrome.runtime.sendMessage({ type: 'progress', runId, count: state.n, note: note || '' }),
    };
    (async () => {
      let error = null;
      log('info', `start ${id}/${kind}`, `limit=${ctx.limit} delay=${delay}ms path=${A.snapshot().path}`);
      try { await task(ctx); } catch (e) { error = String((e && e.message) || e); log('error', 'task failed: ' + error, e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : ''); }
      state.done = true;
      const snapshot = state.n < 3 || error ? A.snapshot() : null;
      log(error ? 'error' : 'info', `finished: ${state.n} rows${state.stop ? ' (stopped)' : ''}`, error || '');
      A.log = () => {};
      send({ type: 'done', runId, count: state.n, stopped: state.stop, error, snapshot, warning: state.warning || '' });
    })();
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (!msg || !msg.aurora) return;
    if (msg.type === 'describe') send(describe());
    else if (msg.type === 'start') start(msg).then(send);
    else if (msg.type === 'stop') { if (run) run.stop = true; send({ ok: true }); }
    else if (msg.type === 'pause') { if (run) run.paused = !!msg.on; send({ ok: true }); }
    return true;
  });
})();
