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
  /** Chrome pauses hidden tabs: Facebook, Instagram and TikTok stop loading new content there. Wait until this tab is visible again. */
  A.waitVisible = async (ctx) => {
    if (!document.hidden) return false;
    A.log('warn', 'this tab is in the background — pausing (Chrome stops sites from loading more while a tab is hidden)');
    ctx.progress('Paused — bring this tab to the front so the site keeps loading');
    await new Promise((res) => {
      let t;
      const f = () => { if (!document.hidden || ctx.stopped()) { document.removeEventListener('visibilitychange', f); clearInterval(t); res(); } };
      document.addEventListener('visibilitychange', f); t = setInterval(f, 1000);
    });
    await A.sleep(1500);
    A.log('info', 'tab visible again — continuing');
    return true;
  };

  A.scrollCollect = async function (ctx, pull, { container, patience = 5, async: isAsync, process, nudge, slow } = {}) {
    let idle = 0, scroller = container || null, logged = 0;
    const de = () => document.scrollingElement || document.documentElement;
    const step = (el, dy) => { const before = el.scrollTop; el.scrollBy({ top: dy, behavior: 'auto' }); return el.scrollTop !== before; };
    /** The element that actually scrolls: the page itself, or (Facebook etc.) the biggest scrollable container. */
    const findScroller = () => {
      let best = null, area = 0;
      for (const d of document.querySelectorAll('div, main, section')) {
        if (d.scrollHeight <= d.clientHeight + 200 || d.clientHeight < 300) continue;
        if (!/(auto|scroll)/.test(getComputedStyle(d).overflowY)) continue;
        const a = d.clientHeight * d.clientWidth; if (a > area) { area = a; best = d; }
      }
      return best;
    };
    while (!ctx.stopped()) {
      await A.waitVisible(ctx);
      const added = isAsync ? await process(pull()) : pull();
      if (ctx.count() >= ctx.limit) break;
      idle = added > 0 ? 0 : idle + 1;
      if (idle >= patience) break;
      const el = scroller || de();
      // slow mode (Facebook): half a screen at a time, so each post has time to draw before we move on; if nothing new appeared, back up a little and come forward again
      const dy = slow ? Math.round((container ? container.clientHeight : innerHeight) * 0.5) : Math.max(500, (container ? container.clientHeight : innerHeight) * 0.9);
      if (slow && idle >= 1) {
        const up = Math.round(innerHeight * (idle >= 3 ? 1.6 : 0.8));
        const b0 = el.scrollTop; step(el, -up); const back = b0 - el.scrollTop; await A.sleep(900 + Math.random() * 400);
        if (back > 0) step(el, back); await A.sleep(700 + Math.random() * 300);
      }
      let moved = step(el, dy);
      if (slow) await A.sleep(1100 + Math.random() * 500);
      if (!moved && !container) {
        const alt = findScroller();
        if (alt && alt !== el) { scroller = alt; moved = step(alt, dy); }
        else if (el !== de()) { scroller = null; moved = step(de(), dy); }
      }
      try { if (nudge) nudge(); } catch (_) {}
      if (logged < 3 || (idle === 3)) { logged++; A.log('info', `scroll: hidden=${document.hidden} moved=${moved} scroller=${(scroller || de()).tagName.toLowerCase()} top=${Math.round((scroller || de()).scrollTop)}/${(scroller || de()).scrollHeight}`); }
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

  /** Run a "comments" task and emit ONE row per commenting user (comment count, likes received, first/last, sample). */
  A.commenters = async function (ctx, commentsTask) {
    const map = new Map();
    let total = 0;
    const proxy = Object.create(ctx);
    proxy.count = () => total;
    proxy.emit = (rows) => {
      for (const r of [].concat(rows)) {
        const k = r && (r.author || r.username); if (!k) continue;
        total++;
        const e = map.get(k) || { id: k, username: k, name: r.authorName || '', profileUrl: r.authorUrl || '', comments: 0, likesOnComments: 0, firstComment: r.postedAt || '', lastComment: '', sample: '' };
        e.comments++; e.likesOnComments += +r.likes || 0; e.lastComment = r.postedAt || e.lastComment; if (!e.sample) e.sample = String(r.text || '').slice(0, 160);
        if (!e.profileUrl && r.authorUrl) e.profileUrl = r.authorUrl;
        map.set(k, e);
      }
      return 1;
    };
    proxy.progress = (note) => ctx.progress(`${map.size} people from ${total} comments${note ? ' — ' + note : ''}`, map.size);
    await commentsTask(proxy);
    ctx.emit(Array.from(map.values()).sort((a, b) => b.comments - a.comments));
  };

  /** Wait until the tab is in front and the page has actually drawn what we need (or a timeout), then let it settle a moment. */
  A.settle = async function (ctx, ready, { timeout = 12000, quiet = 800 } = {}) {
    const t0 = Date.now();
    await A.waitVisible(ctx);
    let ok = false;
    while (!ctx.stopped() && Date.now() - t0 < timeout) {
      try { if (!ready || ready()) { ok = true; break; } } catch (_) {}
      await A.sleep(250);
    }
    if (ok) await A.sleep(quiet);
    A.log('info', ok ? `page ready after ${Date.now() - t0}ms` : `page not fully ready after ${Date.now() - t0}ms — continuing with what is there`);
    return ok;
  };

  /** Aurora Audit: read the profile and the latest posts with the platform's own tasks, then score them locally. */
  A.runAudit = async function (ctx, { platform, profile, posts, nPosts, media, ready, slow }) {
    const grab = (limit, mediaOn, slowOn) => {
      const rows = [], p = Object.create(ctx);
      p.limit = limit; p.opts = Object.assign({}, ctx.opts, { limit, media: mediaOn, slow: !!slowOn });
      p.count = () => rows.length;
      p.emit = (r) => { for (const x of [].concat(r)) if (x && rows.length < limit) rows.push(x); return 1; };
      p.progress = (note) => ctx.progress(note || '', Math.min(rows.length, limit));
      return { p, rows };
    };
    ctx.progress('Waiting for the page to finish loading…');
    if (ready) await A.settle(ctx, ready);
    ctx.progress('Reading the profile…');
    const a = grab(1, false);
    await profile(a.p);
    if (!a.rows.length) throw new Error('Could not read this profile. Open the profile page itself and try again.');
    const prof = a.rows[0];
    let list = [], postNote = '';
    if (!ctx.stopped() && posts) {
      ctx.progress('Reading the latest posts…');
      const b = grab(nPosts, media, slow);
      try { await posts(b.p); } catch (e) { postNote = 'Posts could not be read: ' + String((e && e.message) || e).slice(0, 140); ctx.log('warn', 'audit: ' + postNote); }
      list = b.rows;
    }
    const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
    ctx.log('info', 'audit: read ' + JSON.stringify({
      profile: { followers: num(prof.followers) != null, bio: String(prof.bio || '').length, link: !!(prof.website || (prof.websites && prof.websites.length)), contact: !!(prof.email || prof.phone || (prof.emails && prof.emails.length) || (prof.phones && prof.phones.length)), category: !!prof.category },
      posts: { n: list.length, withDate: list.filter((x) => x.postedAt).length, withLikes: list.filter((x) => num(x.likes) != null || num(x.reactions) != null).length, withComments: list.filter((x) => num(x.comments) != null).length },
    }));
    ctx.progress('Scoring…');
    const res = globalThis.AuroraAudit.analyze({ platform, profile: prof, posts: list, now: Date.now() });
    if (postNote) res.notes.unshift(postNote);
    ctx.emit(globalThis.AuroraAudit.toRow(res, prof));
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
        const body = await r.text();
        try { return JSON.parse(body.replace(/^for \(;;\);/, '')); }
        catch (e) { A.log('error', 'bad JSON from ' + shortUrl(url), `content-type=${r.headers.get('content-type')} redirected=${r.redirected} len=${body.length} starts="${body.slice(0, 70).replace(/\s+/g, ' ')}"`); throw new Error('Unexpected response (not JSON) — are you logged in?'); }
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
