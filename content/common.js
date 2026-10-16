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
  A.scrollCollect = async function (ctx, pull, { container, patience = 5, async: isAsync, process } = {}) {
    let idle = 0;
    while (!ctx.stopped()) {
      const added = isAsync ? await process(pull()) : pull();
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

  /** Debug log hook — boot.js replaces this while a run is active. */
  A.log = () => {};
  const shortUrl = (u) => { try { const x = new URL(u, location.href); return x.pathname; } catch (_) { return String(u).slice(0, 80); } };

  /** Fetch JSON with the page's own session (cookies) — same data the signed-in user can already see.
   *  Retries rate limits (429/5xx) with back-off, logs every non-OK status, and throws an Error with .status. */
  A.getJSON = async (url, headers = {}, { retries = 2, wait = 15000 } = {}) => {
    for (let attempt = 0; ; attempt++) {
      let r;
      try { r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json', ...headers } }); }
      catch (e) { A.log('error', 'network error ' + shortUrl(url), String(e)); throw e; }
      if (r.ok) {
        try { return await r.json(); } catch (e) { A.log('error', 'bad JSON from ' + shortUrl(url), 'content-type=' + r.headers.get('content-type')); throw new Error('Unexpected response (not JSON) — are you logged in?'); }
      }
      const ra = Number(r.headers.get('retry-after')) * 1000;
      A.log('warn', `HTTP ${r.status} ${shortUrl(url)}`, attempt < retries && (r.status === 429 || r.status >= 500) ? `retry ${attempt + 1}/${retries}` : '');
      if ((r.status === 429 || r.status >= 500) && attempt < retries) { await A.sleep(ra > 0 ? Math.min(ra, 60000) : wait * (attempt + 1)); continue; }
      const e = new Error(r.status === 429 ? 'Rate limited by the site (HTTP 429)' : 'HTTP ' + r.status); e.status = r.status; throw e;
    }
  };

  /** Structure-only probe of the current page (no text, names or personal data) for debug reports. */
  A.snapshot = () => {
    const names = (sel, attr) => Array.from(new Set(A.qa(sel).map((e) => e.getAttribute(attr)))).slice(0, 40);
    const count = (sel) => { try { return document.querySelectorAll(sel).length; } catch (_) { return -1; } };
    return {
      path: location.pathname.replace(/\d{6,}/g, '<id>').replace(/@[^/]+/, '@<user>').replace(/(\/(?:p|reel|tv)\/)[^/]+/, '$1<code>'),
      title: document.title.slice(0, 60).replace(/\S+@\S+/g, '<email>'),
      counts: {
        'role=article': count('[role="article"]'), 'role=dialog': count('[role="dialog"]'), 'role=feed': count('[role="feed"]'), 'role=listitem': count('[role="listitem"]'),
        'a[/p/]': count('a[href*="/p/"]'), 'a[/reel/]': count('a[href*="/reel/"]'), 'a[/video/]': count('a[href*="/video/"]'),
        'a[marketplace/item]': count('a[href*="/marketplace/item/"]'), 'a[groups/user]': count('a[href*="/groups/"][href*="/user/"]'),
        'img': count('img'), 'video': count('video'), 'h1': count('h1'), 'ld+json': count('script[type="application/ld+json"]'),
      },
      scriptIds: names('script[id]', 'id'), dataE2E: names('[data-e2e]', 'data-e2e'),
      loggedOutHint: /log in|sign up|iniciar sesión|connexion/i.test((document.body.innerText || '').slice(0, 600)) && count('input[type="password"]') > 0,
      scrollable: document.scrollingElement ? document.scrollingElement.scrollHeight : 0,
    };
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
