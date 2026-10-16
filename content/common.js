/* Aurora Extract — shared content-script toolkit (page detection registry, scrolling collector, helpers). */
(function (root) {
  'use strict';
  const A = (root.AuroraX = root.AuroraX || { platforms: {} });

  A.register = (id, def) => { A.platforms[id] = def; };
  A.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  A.jitter = (ms) => Math.round(ms * (0.75 + Math.random() * 0.5));
  A.txt = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  A.abs = (u) => { try { return u ? new URL(u, location.href).href : ''; } catch (_) { return ''; } };
  A.q = (sel, el = document) => el.querySelector(sel);
  A.qa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  A.meta = (name) => {
    const m = document.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
    return m ? m.getAttribute('content') || '' : '';
  };

  /** "1.2K" "3,4 M" "12 345" -> number (null if not a count). */
  A.parseCount = (s) => {
    if (s == null) return null;
    const m = String(s).replace(/ /g, ' ').trim().match(/^([\d.,\s]+)\s*([kKmMbB]|mil|tys)?\b/);
    if (!m) return null;
    let n = m[1].replace(/\s/g, '');
    const mult = { k: 1e3, m: 1e6, b: 1e9, mil: 1e3, tys: 1e3 }[(m[2] || '').toLowerCase()] || 1;
    if (mult > 1) n = n.replace(',', '.'); else n = n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
    const v = parseFloat(n);
    return isNaN(v) ? null : Math.round(v * mult);
  };

  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const PHONE = /(?:\+|\b00)?\d[\d\s().-]{7,}\d/g;
  /** Public contact details found in text (bios, About sections, listings). */
  A.contacts = (text) => {
    const t = String(text || '');
    const emails = Array.from(new Set((t.match(EMAIL) || []).map((e) => e.toLowerCase())));
    const phones = Array.from(new Set((t.match(PHONE) || []).map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 8 && p.replace(/\D/g, '').length <= 15)));
    return { emails, phones };
  };

  /**
   * Scroll the page (or a scrollable container) and call pull() after each step.
   * pull() returns the number of NEW rows it emitted. Stops at limit, when nothing new
   * arrives for `patience` rounds, or when ctx.stopped().
   */
  A.scrollCollect = async function (ctx, pull, { container, patience = 5 } = {}) {
    let idle = 0;
    while (!ctx.stopped()) {
      const added = pull();
      if (ctx.count() >= ctx.limit) break;
      idle = added > 0 ? 0 : idle + 1;
      if (idle >= patience) break;
      const el = container || document.scrollingElement || document.documentElement;
      el.scrollBy({ top: Math.max(400, (container ? container.clientHeight : innerHeight) * 0.85), behavior: 'instant' in window ? 'instant' : 'auto' });
      await ctx.pause();
    }
  };

  /** Click "See more"/"more" style buttons inside an element so truncated text is complete. */
  A.expandText = (el, labels = ['see more', 'more', 'ver más', 'voir plus', 'mehr anzeigen', 'ver mais']) => {
    for (const b of A.qa('[role="button"],button,span[tabindex]', el)) {
      const t = A.txt(b).toLowerCase();
      if (t.length < 14 && labels.includes(t)) { try { b.click(); } catch (_) {} }
    }
  };

  A.mediaFromImgs = (el, minSize = 120) => A.qa('img', el)
    .filter((i) => (i.naturalWidth || i.width || 0) >= minSize && /^https?:/.test(i.src) && !/emoji|static\.|rsrc\.php|profile_pic_blank/.test(i.src))
    .map((i) => ({ type: 'image', url: i.currentSrc || i.src }));

  A.dedupeMedia = (list) => {
    const seen = new Set();
    return list.filter((m) => m && m.url && !seen.has(m.url) && seen.add(m.url));
  };

  /** Fetch JSON with the page's own session (cookies) — same data the signed-in user can already see. */
  A.getJSON = async (url, headers = {}) => {
    const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json', ...headers } });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  };

  /** Pull the first JSON blob out of <script> tags whose id matches / text matches. */
  A.scriptJSON = (idOrTest) => {
    for (const s of A.qa('script')) {
      const ok = typeof idOrTest === 'string' ? s.id === idOrTest : idOrTest(s);
      if (!ok) continue;
      try { return JSON.parse(s.textContent); } catch (_) {}
    }
    return null;
  };
  A.ldJSON = () => A.qa('script[type="application/ld+json"]').map((s) => { try { return JSON.parse(s.textContent); } catch (_) { return null; } }).filter(Boolean);
})(typeof globalThis !== 'undefined' ? globalThis : window);
