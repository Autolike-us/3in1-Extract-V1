/* Aurora Extract — Facebook extractors (public pages, groups you belong to, Marketplace). Selectors are
   deliberately semantic (role/aria/href patterns) because Facebook's class names are obfuscated. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A) return;

  /* Video file addresses: captured from Facebook's own page data (fb-sniffer.js) and scanned from inline page JSON. */
  const VIDEOS = {};
  const RANK = { hd_src_no_ratelimit: 6, hd_src: 5, browser_native_hd_url: 5, playable_url_quality_hd: 4, sd_src_no_ratelimit: 3, browser_native_sd_url: 3, sd_src: 2, progressive_url: 2, playable_url: 1 };
  const addVideo = (id, url, q) => { if (id && url && (!VIDEOS[id] || VIDEOS[id].q < q)) VIDEOS[id] = { url, q }; };
  document.addEventListener('aurora-fb-media', (e) => { try { for (const v of JSON.parse(e.detail)) addVideo(v.id, v.url, v.q); } catch (_) {} });
  document.dispatchEvent(new CustomEvent('aurora-fb-replay'));
  const scanned = new WeakSet();
  function scanScripts() {
    const re = /"(browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url|hd_src_no_ratelimit|hd_src|sd_src_no_ratelimit|sd_src|progressive_url)":"((?:[^"\\]|\\.)+)"/g;
    for (const sc of document.scripts) {
      if (scanned.has(sc)) continue; scanned.add(sc);
      const t = sc.textContent || '';
      if (t.indexOf('playable_url') < 0 && t.indexOf('browser_native') < 0 && t.indexOf('_src') < 0 && t.indexOf('progressive_url') < 0) continue;
      let m; re.lastIndex = 0;
      while ((m = re.exec(t))) {
        const ids = Array.from(t.slice(Math.max(0, m.index - 900), m.index).matchAll(/"(?:id|video_id)":"(\d{6,})"/g));
        if (!ids.length) continue;
        let url; try { url = JSON.parse('"' + m[2] + '"'); } catch (_) { url = m[2].replace(/\\\//g, '/'); }
        addVideo(ids[ids.length - 1][1], url, RANK[m[1]]);
      }
    }
  }
  /** Video file address(es) inside a page's HTML/JSON: [{id,url,q}] in order of appearance, best quality per video id. */
  function videosInText(text) {
    const re = /"(browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url|hd_src_no_ratelimit|hd_src|sd_src_no_ratelimit|sd_src|progressive_url)":"((?:[^"\\]|\\.)+)"/g;
    const best = new Map(); let m;
    while ((m = re.exec(text))) {
      const ids = Array.from(text.slice(Math.max(0, m.index - 900), m.index).matchAll(/"(?:id|video_id)":"(\d{6,})"/g));
      const id = ids.length ? ids[ids.length - 1][1] : '?';
      let url; try { url = JSON.parse('"' + m[2] + '"'); } catch (_) { url = m[2].replace(/\\\//g, '/'); }
      const q = RANK[m[1]];
      if (!best.has(id) || best.get(id).q < q) best.set(id, { id, url, q });
    }
    return Array.from(best.values());
  }
  /** Find a post's video file by trying, in order: the post page, Facebook's embed player page, the watch page. Returns the
   *  first video file found plus a trail of what each step saw (for the debug log). */
  async function videoFromPermalink(row, log) {
    const want = row.videoIds || [];
    const origin = location.origin;
    const steps = [{ label: 'post page', url: row.url }];
    steps.push({ label: 'embed player', url: `${origin}/plugins/video.php?href=${encodeURIComponent(row.url.split('?')[0])}&show_text=false&width=560` });
    for (const id of want.slice(0, 1)) {
      steps.push({ label: 'watch page', url: `${origin}/watch/?v=${id}` });
      steps.push({ label: 'embed by video id', url: `${origin}/plugins/video.php?href=${encodeURIComponent(`${origin}/reel/${id}/`)}&show_text=false&width=560` });
    }
    const trail = [];
    for (const st of steps) {
      try {
        const r = await fetch(st.url, { credentials: 'include' });
        if (!r.ok) { trail.push(`${st.label}: HTTP ${r.status}`); continue; }
        const html = await r.text();
        const list = videosInText(html);
        for (const v of list) if (v.id !== '?') addVideo(v.id, v.url, v.q);
        trail.push(`${st.label}: ${html.length}b, ${list.length} file(s)${/login|checkpoint/i.test(html.slice(0, 3000)) && !list.length ? ', login/checkpoint page?' : ''}`);
        const hit = list.find((v) => want.includes(v.id)) || list[0];
        if (hit) return { url: hit.url, via: st.label, trail };
      } catch (e) { trail.push(`${st.label}: ${e.message}`); }
    }
    return { url: null, trail };
  }
  const videoIdsIn = (card) => {
    const ids = new Set();
    for (const a of A.qa('a[href]', card)) { const h = a.getAttribute('href') || ''; const m = h.match(/\/(?:videos|reel)\/(\d+)/) || h.match(/[?&](?:v|video_id)=(\d+)/); if (m) ids.add(m[1]); }
    return Array.from(ids);
  };

  const RESERVED = /^(groups|marketplace|watch|events|pages|gaming|stories|reel|reels|friends|bookmarks|settings|help|login|profile\.php|photo|photos|share|hashtag|search|notifications|messages|ads|policies|privacy|about|public|story\.php|permalink\.php)$/i;
  const POST_HREF = /\/(posts|videos|reel|watch|photo|permalink)[/?]|story_fbid|\/photo\.php|\/groups\/[^/]+\/(posts|permalink)\//;

  const FB = 'https://www.facebook.com';
  const TABS = /^(about|friends|friends_all|friends_mutual|photos|photos_by|videos|posts|mentions|reels|more|following|followers|reviews|groups|map|sports|music|movies|tv|books|likes|check_ins|events|photo|search|settings|saved|notifications)$/i;
  const K = (id, label, goto) => ({ id, label, ...(goto ? { goto } : {}) });

  function detect(u) {
    const p = u.pathname.replace(/\/+$/, '');
    const seg = p.split('/').filter(Boolean);
    const sk = u.searchParams.get('sk') || '';
    if (/^\/marketplace\/item\/\d+/.test(p)) return { label: 'Marketplace listing', primary: 'marketplace_item', kinds: [K('marketplace_item', 'This listing (all photos)'), K('marketplace_seller', 'Seller details')] };
    if (/^\/marketplace/.test(p)) return { label: 'Marketplace results', primary: 'marketplace_list', kinds: [K('marketplace_list', 'All listings on screen')] };
    const g = p.match(/^\/groups\/([^/]+)/);
    if (g) {
      const base = `${FB}/groups/${g[1]}`;
      if (/^\/groups\/[^/]+\/(members|people)/.test(p)) return { label: 'Group members', primary: 'group_members', kinds: [K('group_members', 'Group members'), K('group_info', 'Group info'), K('posts', 'Group posts', base + '/')] };
      return { label: 'Group', primary: 'posts', kinds: [K('posts', 'Group posts'), K('group_members', 'Group members', base + '/members'), K('group_info', 'Group info'), K('comments', 'Comments (open a post first)')] };
    }
    if (/\/(posts|videos|reel)\/|story_fbid|permalink/.test(p + u.search)) return { label: 'Post', primary: 'comments', kinds: [K('comments', 'All comments'), K('commenters', 'People who commented'), K('reactors', 'People who reacted'), K('posts', 'This post (text + media)')] };
    if (seg.length && (!RESERVED.test(seg[0]) || seg[0] === 'profile.php')) {
      const isId = seg[0] === 'profile.php';
      const handle = isId ? '' : seg[0];
      const tab = isId ? sk : (seg[1] || '');
      const go = (t) => (isId ? `${FB}/profile.php?id=${u.searchParams.get('id')}&sk=${t}` : `${FB}/${handle}/${t}`);
      if (/^(friends|friends_all|friends_mutual|followers|following)$/i.test(tab)) return { label: `People · ${tab.replace('_all', '')}`, primary: 'people', kinds: [K('people', `List of ${tab.replace('_all', '')} (names + profile links)`), K('page_info', 'Profile / page details', isId ? `${FB}/profile.php?id=${u.searchParams.get('id')}` : `${FB}/${handle}`)] };
      if (/about/.test(tab)) return { label: 'Profile / page — About', primary: 'page_info', kinds: [K('page_info', 'Contact & About details')] };
      return { label: 'Profile / page', primary: 'page_info', kinds: [K('page_info', 'Profile & contact details'), K('posts', 'Posts'), K('people_friends', 'Friends list', go('friends')), K('people_followers', 'Followers list', go('followers')), K('people_following', 'Following list', go('following')), K('audit', '✦ Health check (Aurora Audit)')] };
    }
    return { label: 'Facebook', primary: null, kinds: [] };
  }

  /* ---------- helpers ---------- */
  function articleList() { return A.qa('[role="article"]').filter((a) => !a.closest('[role="complementary"], [role="navigation"], [role="banner"]') && ( !a.parentElement.closest('[role="article"]') || a.querySelector('a[href*="comment_id"]') === null)); }

  function parsePost(art) {
    A.expandText(art);
    const link = A.qa('a[href]', art).find((a) => POST_HREF.test(a.getAttribute('href')));
    const url = link ? A.abs(link.href.split('&__cft__')[0].split('?__cft__')[0]) : '';
    const authorEl = A.q('h2 a, h3 a, h4 a, strong a', art) || A.q('a[role="link"][href*="facebook.com/"]', art);
    const msgEl = A.q('[data-ad-preview="message"], [data-ad-comet-preview="message"]', art);
    let text = A.txt(msgEl);
    if (!text) text = A.qa('div[dir="auto"]', art).map(A.txt).sort((a, b) => b.length - a.length)[0] || '';
    const times = A.qa('a[href] , a[aria-label], a[role="link"] span', art).filter((e) => e.tagName !== 'A' || POST_HREF.test(e.getAttribute('href') || '') || e.hasAttribute('aria-label')).map((e) => e.getAttribute('aria-label') || A.txt(e)).filter((t) => /^(\d+\s?[smhdwy]|just now|yesterday|\w+ \d{1,2}(, \d{4})?|\d+ (sec|min|hour|day|week|month|year))/i.test(t));
    const reactions = A.q('[aria-label*="reaction" i], [aria-label*="like" i]', art);
    const text2 = A.txt(art);
    /* newer layouts show the count as its own line ("All reactions:" / "1.2K") just before "34 comments" */
    const lines = (art.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const reactLine = (() => {
      const k = lines.findIndex((l) => /^all reactions:?$/i.test(l)); if (k >= 0 && /^[\d.,]+\s?[KkMm]?$/.test(lines[k + 1] || '')) return lines[k + 1];
      const ci = lines.findIndex((l) => /^[\d.,]+\s?[KkMm]?\s+comments?$/i.test(l));
      for (let i = ci - 1; ci > 0 && i >= Math.max(0, ci - 3); i--) if (/^[\d.,]+\s?[KkMm]?$/.test(lines[i])) return lines[i];
      return '';
    })();
    const numAfter = (re) => { const m = text2.match(re); return m ? A.parseCount(m[1]) : null; };
    const media = A.dedupeMedia([
      ...A.mediaFromImgs(art, 200),
      ...A.qa('video', art).filter((v) => /^https?:/.test(v.currentSrc || v.src || '')).map((v) => ({ type: 'video', url: v.currentSrc || v.src })),
    ]);
    const c = A.contacts(text);
    const vids = videoIdsIn(art), hasVideoEl = !!A.q('video', art);
    let videoMissing = false;
    for (const id of vids) { if (VIDEOS[id]) media.unshift({ type: 'video', url: VIDEOS[id].url }); else videoMissing = true; }
    if (hasVideoEl && !vids.length) videoMissing = true;
    const diag = hasVideoEl || vids.length ? { hasVideoEl, ids: vids.length, known: vids.filter((i) => VIDEOS[i]).length, links: A.qa('a[href]', art).map((a) => a.getAttribute('href') || '').filter((h) => /video|reel|watch/i.test(h)).slice(0, 3).map((h) => h.replace(/\d{6,}/g, '<id>').replace(/pfbid\w+/g, 'pfbid').slice(0, 60)) } : null;
    return {
      _diag: diag, id: url || undefined, url, ...(vids.length ? { videoIds: vids } : {}), ...(videoMissing ? { videoMissing: true } : {}),
      author: A.txt(authorEl), authorUrl: authorEl ? A.abs(authorEl.href.split('?')[0]) : '',
      text, postedAt: times[0] || '',
      reactions: reactions ? A.parseCount(reactions.getAttribute('aria-label')) || A.parseCount(A.txt(reactions)) || (reactLine ? A.parseCount(reactLine) : null) : (reactLine ? A.parseCount(reactLine) : null),
      comments: numAfter(/([\d.,KkMm]+)\s+comments?/i), shares: numAfter(/([\d.,KkMm]+)\s+shares?/i),
      emailsInText: c.emails, phonesInText: c.phones, media,
    };
  }

  /** Fallback when a page doesn't mark posts with role="article": one card per distinct post permalink. */
  function permalinkCards() {
    const byId = new Map();
    for (const a of A.qa('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (!POST_HREF.test(h) || /comment_id|reply_comment/.test(h)) continue;
      const id = (h.match(/\/(?:posts|videos|reel|permalink)\/([\w.-]+)/) || h.match(/(?:story_fbid|fbid|v)=([\w.-]+)/) || [])[1] || h.split('?')[0];
      if (!byId.has(id)) byId.set(id, a);
    }
    const anchors = Array.from(byId.values()), cards = [];
    for (const a of anchors) {
      let el = a;
      while (el.parentElement && el.parentElement !== document.body && !el.parentElement.matches('[role="main"],[role="feed"]')) {
        const p = el.parentElement;
        if (anchors.some((b) => b !== a && p.contains(b))) break;
        el = p;
      }
      cards.push(el);
    }
    return cards;
  }

  async function posts(ctx) {
    const seen = new Set(), retry = {};
    let pull = 0, missing = 0, fails = 0;
    const log = (...a) => ctx.log && ctx.log(...a);
    const wantMedia = ctx.opts.media !== false;
    const slow = !!ctx.opts.slow;
    const lastArticle = () => { const l = articleList(); return l[l.length - 1]; };
    scanScripts();
    log('info', `video addresses known at start: ${Object.keys(VIDEOS).length}`);
    await A.scrollCollect(ctx, () => {
      scanScripts();
      let empty = 0, dup = 0, late = 0;
      const fresh = [];
      const arts = articleList();
      const cards = arts.length < 3 ? permalinkCards() : [];
      for (const art of arts.concat(cards)) {
        const row = parsePost(art);
        const key = row.url || (row.author + row.text.slice(0, 60));
        if (!row.url && !row.text && !row.media.length) { empty++; continue; }
        if (seen.has(key)) { dup++; continue; }
        // slow mode: a post that has not drawn its numbers yet gets two more looks before we accept it as it is
        if (slow && row.reactions == null && row.comments == null && (retry[key] = (retry[key] || 0) + 1) <= 2) { late++; continue; }
        seen.add(key);
        fresh.push(row);
      }
      pull++;
      if (pull <= 3 || pull % 5 === 0 || !fresh.length) log('info', `pull ${pull}: hidden=${document.hidden} articles=${arts.length} permalinkCards=${cards.length} new=${fresh.length} empty=${empty} dup=${dup}${slow ? ' late=' + late : ''}`);
      return fresh;
    }, { async: true, process: async (fresh) => {
      let added = 0;
      for (const row of fresh) {
        if (ctx.stopped() || ctx.count() >= ctx.limit) break;
        if (row._diag) log('info', 'video post', JSON.stringify(row._diag));
        if (wantMedia && row.videoMissing && row.url && fails < 3) {
          try {
            const v = await videoFromPermalink(row, log);
            if (v.url) { row.media.unshift({ type: 'video', url: v.url }); delete row.videoMissing; log('info', 'video file found via ' + v.via, v.trail.join(' | ')); fails = 0; }
            else log('warn', 'no video file found', v.trail.join(' | '));
          } catch (e) { fails++; log('warn', 'could not open post page: ' + e.message, fails >= 3 ? 'giving up on page lookups for this run' : ''); }
          await ctx.pause();
        }
        delete row._diag;
        if (row.videoMissing) missing++;
        added += ctx.emit(row);
      }
      ctx.progress(); return added;
    }, patience: slow ? 6 : 8, slow, nudge: slow ? null : () => { const l = lastArticle(); if (l) l.scrollIntoView({ block: 'end' }); } });
    if (ctx.setWarning && missing) ctx.setWarning(`${missing} video post${missing > 1 ? 's' : ''} saved without the video file — Facebook didn't expose it. Reload the page, scroll down once so the videos load, then run again.`);
  }

  async function comments(ctx) {
    const scope = A.q('[role="dialog"] [role="article"]')?.closest('[role="dialog"]') || document;
    const clickMore = () => {
      for (const b of A.qa('[role="button"], span[dir="auto"]', scope)) {
        const t = A.txt(b).toLowerCase();
        if (/^(view|see) (more|\d+ more|all)\b.*(comments|replies)|^view \d+ repl|^(more|previous) comments/.test(t)) { try { b.click(); } catch (_) {} }
      }
    };
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      clickMore();
      let added = 0;
      for (const el of A.qa('[role="article"][aria-label*="omment" i], [role="article"] [role="article"]', scope)) {
        const authorEl = A.q('a[role="link"]', el);
        const body = A.qa('div[dir="auto"]', el).map(A.txt).filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
        const author = A.txt(authorEl);
        if (!author || !body) continue;
        const permalink = A.qa('a[href*="comment_id"]', el)[0];
        const key = permalink ? permalink.href : author + body;
        if (seen.has(key)) continue; seen.add(key);
        const t = A.qa('a[href*="comment_id"] ,li a, a[aria-label]', el).map((a) => a.getAttribute('aria-label') || A.txt(a)).find((x) => /\d/.test(x) && x.length < 24) || '';
        added += ctx.emit({ id: key, author, authorUrl: authorEl ? A.abs(authorEl.href.split('?')[0]) : '', text: body, postedAt: t, url: permalink ? A.abs(permalink.href) : '' });
      }
      ctx.progress(); return added;
    }, { patience: 6 });
  }

  async function groupMembers(ctx) {
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      let added = 0;
      for (const a of A.qa('a[href*="/groups/"][href*="/user/"]', A.q('[role="main"]') || document)) {
        const m = a.href.match(/\/user\/(\d+)/);
        const name = A.txt(a);
        if (!m || !name || seen.has(m[1])) continue;
        const card = a.closest('[role="listitem"], [role="list"] > div, div[data-visualcompletion]') || a.parentElement;
        const lines = A.txt(card).replace(name, '').trim();
        seen.add(m[1]);
        added += ctx.emit({ id: m[1], name, profileUrl: 'https://www.facebook.com/' + m[1], about: lines.slice(0, 200), avatar: (A.q('img', card) || {}).src || '' });
      }
      ctx.progress(); return added;
    });
  }

  function lines(el) { return (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean); }

  function parseListingCard(a) {
    const id = (a.href.match(/\/marketplace\/item\/(\d+)/) || [])[1];
    const L = lines(a);
    const price = L.find((x) => /(?:[$€£¥₹₦₱]|\b(?:USD|EUR|GBP|CAD|AUD)\b)\s?[\d.,]+|[\d.,]+\s?(?:[$€£]|USD|EUR)|^free$/i.test(x)) || '';
    const rest = L.filter((x) => x !== price);
    const img = A.q('img', a);
    return { id, url: `https://www.facebook.com/marketplace/item/${id}/`, title: rest[0] || '', price, location: rest[1] || '', image: img ? img.src : '', media: img ? [{ type: 'image', url: img.src }] : [] };
  }

  async function marketplaceList(ctx) {
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      let added = 0;
      for (const a of A.qa('a[href*="/marketplace/item/"]', A.q('[role="main"]') || document)) {
        const id = (a.href.match(/\/marketplace\/item\/(\d+)/) || [])[1];
        if (!id || seen.has(id)) continue; seen.add(id);
        added += ctx.emit(parseListingCard(a));
      }
      ctx.progress(); return added;
    });
  }

  async function marketplaceItem(ctx) {
    A.expandText(document);
    const ld = A.ldJSON().find((j) => /Product|Offer|Vehicle/i.test(j['@type'] || '')) || {};
    const id = (location.pathname.match(/item\/(\d+)/) || [])[1];
    const h1 = A.txt(A.q('h1'));
    const body = A.txt(A.q('[role="main"]') || document.body);
    const seller = A.q('a[href*="/marketplace/profile/"]') || A.q('a[href*="/marketplace/seller/"]');
    const price = (ld.offers && ld.offers.price && `${ld.offers.priceCurrency || ''} ${ld.offers.price}`.trim()) || (body.match(/(?:[$€£¥₹]|\b[A-Z]{3}\b)\s?[\d.,]+/) || [''])[0];
    const desc = ld.description || A.qa('div[dir="auto"], span[dir="auto"]').map(A.txt).sort((a, b) => b.length - a.length)[0] || '';
    const c = A.contacts(desc);
    const imgs = A.dedupeMedia(A.mediaFromImgs(document, 250));
    ctx.emit({
      id, url: location.href.split('?')[0], title: ld.name || h1, price, description: desc,
      location: (body.match(/Listed .*? in ([^·\n]+)/i) || [])[1] || '', seller: A.txt(seller), sellerUrl: seller ? A.abs(seller.href.split('?')[0]) : '',
      emailsInText: c.emails, phonesInText: c.phones, media: imgs,
    });
  }

  async function pageInfo(ctx) {
    A.expandText(document);
    const name = A.txt(A.q('h1')) || A.meta('og:title');
    const main = A.q('[role="main"]') || document.body;
    const full = main.innerText || '';
    const c = A.contacts(full);
    const links = A.qa('a[href]', main).map((a) => a.href);
    const ext = links.filter((h) => /l\.facebook\.com\/l\.php/.test(h)).map((h) => { try { return new URL(h).searchParams.get('u'); } catch (_) { return null; } }).filter(Boolean);
    const mails = A.qa('a[href^="mailto:"]', main).map((a) => a.getAttribute('href').slice(7).split('?')[0]);
    const tels = A.qa('a[href^="tel:"]', main).map((a) => a.getAttribute('href').slice(4));
    const followers = (full.match(/([\d.,]+[KkMm]?)\s+(followers|people follow this)/i) || [])[1];
    const likes = (full.match(/([\d.,]+[KkMm]?)\s+(likes|people like this)/i) || [])[1];
    const cover = A.q('img[data-imgperflogname="profileCoverPhoto"]');
    const avatar = A.q('svg[role="img"] image, a[aria-label*="profile" i] img');
    const address = A.txt(A.q('a[href*="google.com/maps"], a[href*="maps.google"]'));
    const cat = (full.match(/Page\s*·\s*([^\n]+)/) || [])[1] || '';
    ctx.emit({
      id: location.pathname + location.search, name, url: location.href.split('?')[0],
      category: cat.trim(), followers: A.parseCount(followers), likes: A.parseCount(likes),
      emails: Array.from(new Set([...mails, ...c.emails])), phones: Array.from(new Set([...tels, ...c.phones])),
      websites: Array.from(new Set(ext)), address,
      bio: (A.meta('og:description') || '').slice(0, 500),
      media: A.dedupeMedia([cover && { type: 'image', url: cover.src }, avatar && { type: 'image', url: avatar.getAttribute('href') || avatar.src }].filter(Boolean)),
    });
    ctx.progress('Tip: open the "About" tab for more contact details.');
  }

  /* ---------- people (friends / followers / following / reactors / commenters) ---------- */
  function profileOf(href) {
    let u; try { u = new URL(href, location.href); } catch (_) { return null; }
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] === 'profile.php' && u.searchParams.get('id')) return { key: u.searchParams.get('id'), url: `${FB}/profile.php?id=${u.searchParams.get('id')}` };
    if (seg[0] === 'groups' && seg[2] === 'user' && seg[3]) return { key: seg[3], url: `${FB}/${seg[3]}` };
    if (seg.length === 1 && !RESERVED.test(seg[0]) && !TABS.test(seg[0])) return { key: seg[0], url: `${FB}/${seg[0]}` };
    return null;
  }
  function readPeople(root, seen, ctx, extra = {}) {
    let added = 0;
    for (const a of A.qa('a[href]', root)) {
      const pr = profileOf(a.href);
      const name = A.txt(a);
      if (!pr || !name || name.length > 80 || seen.has(pr.key)) continue;
      if (/^(see all|view|message|add friend|follow|following|friends|more)$/i.test(name)) continue;
      seen.add(pr.key);
      const card = a.closest('[role="listitem"], [role="article"]') || a.parentElement.parentElement || a;
      const lines = (card.innerText || '').split('\n').map((x) => x.trim()).filter((x) => x && x !== name && !/^(add friend|message|follow|following|friends|remove|confirm|delete)$/i.test(x));
      const img = A.q('img', card);
      added += ctx.emit({ id: pr.key, name, profileUrl: pr.url, about: lines.slice(0, 2).join(' · ').slice(0, 160), avatar: img ? img.src : '', ...extra });
    }
    return added;
  }

  async function people(ctx) {
    const seen = new Set();
    const list = (location.pathname + location.search).match(/friends_mutual|friends|followers|following/i);
    await A.scrollCollect(ctx, () => { const n = readPeople(A.q('[role="main"]') || document, seen, ctx, { list: list ? list[0].toLowerCase() : '' }); ctx.progress(); return n; }, { patience: 7 });
    if (ctx.count() === 0 && ctx.setWarning) ctx.setWarning('No people were found. Facebook only shows these lists when the profile owner allows it — check the list is visible to you.');
  }

  /** Open a dialog by clicking a control, wait for it, and return it. */
  async function openDialog(find, ctx, what) {
    const before = A.qa('[role="dialog"]').length;
    const btn = find();
    ctx.log('info', `${what}: control ${btn ? 'found' : 'NOT found'}`);
    if (btn) { btn.click(); for (let i = 0; i < 20; i++) { await A.sleep(300); const d = A.qa('[role="dialog"]'); if (d.length > before || (before && d.length)) return d[d.length - 1]; } }
    return A.qa('[role="dialog"]').pop() || null;
  }

  async function reactors(ctx) {
    const scope = A.q('[role="dialog"] [role="article"]') ? A.q('[role="dialog"]') : (A.q('[role="main"]') || document);
    const dlg = await openDialog(() => A.qa('[role="button"], a, span[role="button"]', scope).find((e) => /(see who reacted|people reacted|all reactions|reactions?:|^\d[\d.,KkMm]* (reactions?|likes?))/i.test(e.getAttribute('aria-label') || '')) || A.qa('[role="button"]', scope).find((e) => /^\d[\d.,KkMm]*$/.test(A.txt(e)) && e.querySelector('img,i,svg')), ctx, 'reactions');
    if (!dlg) throw new Error('Couldn\'t open the list of people who reacted. Click the reaction count under the post so the list pops up, then press Start again.');
    const box = A.qa('div', dlg).find((d) => d.scrollHeight > d.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(d).overflowY)) || undefined;
    const seen = new Set();
    await A.scrollCollect(ctx, () => { const n = readPeople(A.qa('[role="dialog"]').pop() || dlg, seen, ctx, { list: 'reactions', post: location.href.split('?')[0] }); ctx.progress(); return n; }, { container: box, patience: 6 });
  }

  async function commenters(ctx) { await A.commenters(ctx, comments); }

  async function groupInfo(ctx) {
    const main = A.q('[role="main"]') || document.body;
    const txt = main.innerText || '';
    const name = A.txt(A.q('h1')) || A.meta('og:title');
    const members = (txt.match(/([\d.,]+[KkMm]?)\s+(?:total\s+)?members?/i) || [])[1];
    const privacy = (txt.match(/\b(Public|Private|Visible|Hidden)\s+group/i) || [])[0] || '';
    const posts = (txt.match(/([\d.,]+[KkMm]?)\s+(?:new\s+)?posts?\s+(?:today|this week|in the last)/i) || [])[0] || '';
    ctx.emit({ id: location.pathname.split('/')[2], name, url: location.href.split('?')[0], members: A.parseCount(members), privacy, activity: posts, about: (A.meta('og:description') || '').slice(0, 600), media: A.meta('og:image') ? [{ type: 'image', url: A.meta('og:image') }] : [] });
  }

  async function audit(ctx) { await A.runAudit(ctx, { platform: 'facebook', profile: pageInfo, posts, nPosts: 20, media: false, slow: true, ready: () => { const m = A.q('[role="main"]') || document.body, t = m.innerText || ''; return !!A.q('h1') && t.length > 250 && /follower|like|people follow this|About|Posts/i.test(t); } }); }

  A.register('facebook', {
    name: 'Facebook', hosts: /(^|\.)facebook\.com$/, detect,
    kinds: ['page_info', 'posts', 'comments', 'commenters', 'reactors', 'people', 'people_friends', 'people_followers', 'people_following', 'group_info', 'group_members', 'marketplace_list', 'marketplace_item', 'audit'],
    tasks: { audit, page_info: pageInfo, posts, comments, commenters, reactors, people, people_friends: people, people_followers: people, people_following: people, group_info: groupInfo, group_members: groupMembers, marketplace_list: marketplaceList, marketplace_item: marketplaceItem, marketplace_seller: pageInfo },
    _test: { parsePost, parseListingCard, detect },
  });
})();
