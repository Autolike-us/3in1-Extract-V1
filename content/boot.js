/* Aurora Extract — message bridge between the extension UI and the platform extractors. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A || A.booted) return;
  A.booted = true;
  const platformId = () => Object.keys(A.platforms).find((p) => A.platforms[p].hosts.test(location.hostname));

  let run = null; // { runId, stop:boolean, paused:boolean }

  /** Small progress badge on the page itself, so you can watch (and stop) from the tab that has to stay in front. */
  function badge(state, label) {
    const host = document.createElement('div');
    host.id = 'aurora-extract-badge';
    host.style.cssText = 'all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .b{display:flex;align-items:center;gap:12px;font:600 13px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;color:#17152a;background:#fff;border:1px solid rgba(30,24,70,.12);border-radius:16px;padding:12px 14px;box-shadow:0 18px 40px -16px rgba(10,70,66,.55);max-width:340px}
      .i{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#047857,#0d9488 50%,#22b8e8);flex:none;display:grid;place-items:center;color:#fff;font-size:16px}
      .t{display:grid;gap:1px;min-width:0}.t small{font-weight:500;color:#6f6b85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}
      button{font:inherit;cursor:pointer;border:1px solid rgba(30,24,70,.14);background:#fff;border-radius:10px;padding:6px 11px;color:#17152a}
      button.p{background:linear-gradient(120deg,#047857,#0d9488 55%,#0891b2);color:#fff;border:0}
    </style><div class="b"><span class="i">✦</span><div class="t"><span id="a">Aurora Extract</span><small id="m">Starting…</small></div><button id="x" class="p">Stop</button></div>`;
    document.documentElement.appendChild(host);
    const $ = (s) => root.querySelector(s);
    const api = {
      set(count, note) { $('#a').textContent = `${count} collected`; $('#m').textContent = note || label; },
      done(msg, count) { $('#a').textContent = msg; $('#m').textContent = `${count} items saved`; const b = $('#x'); b.textContent = 'View results'; b.onclick = () => { chrome.runtime.sendMessage({ type: 'openDashboard', hash: '#results' }); host.remove(); }; const c = document.createElement('button'); c.textContent = '✕'; c.onclick = () => host.remove(); b.after(c); },
    };
    $('#x').onclick = () => { state.stop = true; $('#x').disabled = true; $('#m').textContent = 'Stopping…'; };
    return api;
  }

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
    document.getElementById('aurora-extract-badge')?.remove();
    const ui = badge(state, def.name + ' · ' + kind.replace(/_/g, ' '));
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
      progress: (note, n) => { const c = n == null ? state.n : n; ui.set(c, note); chrome.runtime.sendMessage({ type: 'progress', runId, count: c, note: note || '' }); },
    };
    (async () => {
      let error = null;
      log('info', `start ${id}/${kind}`, `limit=${ctx.limit} delay=${delay}ms path=${A.snapshot().path}`);
      try { await task(ctx); } catch (e) { error = String((e && e.message) || e); log('error', 'task failed: ' + error, e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : ''); }
      state.done = true;
      const snapshot = state.n < 3 || error ? A.snapshot() : null;
      log(error ? 'error' : 'info', `finished: ${state.n} rows${state.stop ? ' (stopped)' : ''}`, error || '');
      A.log = () => {};
      ui.done(error ? 'Stopped — ' + error.slice(0, 80) : state.stop ? 'Stopped' : 'Done', state.n);
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
