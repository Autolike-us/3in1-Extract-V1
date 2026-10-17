/* Aurora Extract — plain-text debug report people can copy and send. Contains: version, browser, recent runs,
   the activity log and a structure-only page probe. No cookies, tokens, passwords, names or page text. */
globalThis.AuroraReport = {
  stamp: (t) => new Date(t).toISOString().replace('T', ' ').slice(5, 19),
  async build({ runId, max = 200 } = {}) {
    const m = chrome.runtime.getManifest();
    const { runs = [], debugLog = [] } = await chrome.storage.local.get(['runs', 'debugLog']);
    const pick = runId ? runs.filter((r) => r.id === runId) : runs.slice(0, 6);
    const head = ['Aurora Extract debug report (post it in Telegram: Aurora Studios Report, or email support@getaurorastudios.com)', `${m.name} v${m.version}`, `Generated: ${new Date().toISOString()}`, `Browser: ${navigator.userAgent}`, ''];
    const sect = pick.map((r) => [
      `RUN ${r.id}: ${r.label} — ${r.status}, ${r.count || 0} rows${r.error ? ', ERROR: ' + r.error : ''}`,
      `  kind=${r.kind} limit=${r.opts && r.opts.limit} delay=${r.opts && r.opts.delayMs}ms started=${new Date(r.startedAt).toISOString()}`,
      r.snapshot ? '  page probe: ' + JSON.stringify(r.snapshot) : '',
    ].filter(Boolean).join('\n'));
    const ids = new Set(pick.map((r) => r.id));
    const lines = debugLog.filter((e) => !runId || e.r === runId || !e.r).slice(-max).map((e) => `${this.stamp(e.t)} ${String(e.l || 'info').toUpperCase().padEnd(5)} ${e.r && !runId ? '[' + e.r.slice(-4) + '] ' : ''}${e.m}${e.d ? '\n      ' + String(e.d).replace(/\n/g, '\n      ') : ''}`);
    return head.concat(sect.length ? sect : ['(no runs yet)'], ['', `--- last ${lines.length} log events ---`], lines.length ? lines : ['(no events yet)']).join('\n');
  },
  async copy(opts) { const t = await this.build(opts); try { await navigator.clipboard.writeText(t); return true; } catch (_) { return false; } },
  async save(opts) {
    const url = URL.createObjectURL(new Blob([await this.build({ max: 800, ...opts })], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'aurora-extract-debug-report.txt' });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
