/* Aurora Extract — Facebook extractors (public pages, groups you belong to, Marketplace). Selectors are
   deliberately semantic (role/aria/href patterns) because Facebook's class names are obfuscated. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A) return;

  const RESERVED = /^(groups|marketplace|watch|events|pages|gaming|stories|reel|reels|friends|bookmarks|settings|help|login|profile\.php|photo|photos|share|hashtag|search|notifications|messages|ads|policies|privacy|about|public|story\.php|permalink\.php)$/i;
  const POST_HREF = /\/(posts|videos|reel|watch|photo|permalink)[/?]|story_fbid|\/photo\.php|\/groups\/[^/]+\/(posts|permalink)\//;

  function detect(u) {
    const p = u.pathname.replace(/\/+$/, '');
    const seg = p.split('/').filter(Boolean);
    if (/^\/marketplace\/item\/\d+/.test(p)) return { label: 'Marketplace listing', primary: 'marketplace_item', kinds: [{ id: 'marketplace_item', label: 'This listing' }, { id: 'marketplace_seller', label: 'Seller details' }] };
    if (/^\/marketplace/.test(p)) return { label: 'Marketplace results', primary: 'marketplace_list', kinds: [{ id: 'marketplace_list', label: 'All listings on screen' }] };
    if (/^\/groups\/[^/]+\/(members|people)/.test(p)) return { label: 'Group members', primary: 'group_members', kinds: [{ id: 'group_members', label: 'Group members' }] };
    if (/^\/groups\/[^/]+/.test(p)) return { label: 'Group feed', primary: 'posts', kinds: [{ id: 'posts', label: 'Group posts' }, { id: 'comments', label: 'Comments on an open post' }] };
    if (/\/(posts|videos|reel)\/|story_fbid|permalink/.test(p + u.search)) return { label: 'Post', primary: 'comments', kinds: [{ id: 'comments', label: 'Comments' }, { id: 'posts', label: 'This post' }] };
    if (seg.length && (!RESERVED.test(seg[0]) || seg[0] === 'profile.php')) {
      if (/about/.test(p + u.search)) return { label: 'Profile / page — About', primary: 'page_info', kinds: [{ id: 'page_info', label: 'Contact & About details' }] };
      return { label: 'Profile / page', primary: 'page_info', kinds: [{ id: 'page_info', label: 'Profile & contact details' }, { id: 'posts', label: 'Posts' }] };
    }
    return { label: 'Facebook', primary: null, kinds: [] };
  }

  /* ---------- helpers ---------- */
  function articleList() { return A.qa('[role="article"]').filter((a) => !a.parentElement.closest('[role="article"]') || a.querySelector('a[href*="comment_id"]') === null); }

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
    const numAfter = (re) => { const m = text2.match(re); return m ? A.parseCount(m[1]) : null; };
    const media = A.dedupeMedia([
      ...A.mediaFromImgs(art, 200),
      ...A.qa('video', art).filter((v) => /^https?:/.test(v.currentSrc || v.src || '')).map((v) => ({ type: 'video', url: v.currentSrc || v.src })),
    ]);
    const c = A.contacts(text);
    return {
      id: url || undefined, url,
      author: A.txt(authorEl), authorUrl: authorEl ? A.abs(authorEl.href.split('?')[0]) : '',
      text, postedAt: times[0] || '',
      reactions: reactions ? A.parseCount(reactions.getAttribute('aria-label')) || A.parseCount(A.txt(reactions)) : null,
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
    const seen = new Set();
    let pull = 0;
    const log = (...a) => ctx.log && ctx.log(...a);
    await A.scrollCollect(ctx, () => {
      let added = 0, empty = 0, dup = 0;
      const arts = articleList();
      const cards = arts.length < 3 ? permalinkCards() : [];
      for (const art of arts.concat(cards)) {
        const row = parsePost(art);
        const key = row.url || (row.author + row.text.slice(0, 60));
        if (!row.url && !row.text && !row.media.length) { empty++; continue; }
        if (seen.has(key)) { dup++; continue; }
        seen.add(key);
        added += ctx.emit(row);
      }
      pull++;
      if (pull <= 3 || pull % 5 === 0 || added === 0) log('info', `pull ${pull}: articles=${arts.length} permalinkCards=${cards.length} new=${added} empty=${empty} dup=${dup}`);
      ctx.progress(); return added;
    }, { patience: 7 });
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
      for (const a of A.qa('a[href*="/groups/"][href*="/user/"]')) {
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
      for (const a of A.qa('a[href*="/marketplace/item/"]')) {
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

  A.register('facebook', {
    name: 'Facebook', hosts: /(^|\.)facebook\.com$/, detect,
    kinds: ['page_info', 'posts', 'comments', 'group_members', 'marketplace_list', 'marketplace_item'],
    tasks: { page_info: pageInfo, posts, comments, group_members: groupMembers, marketplace_list: marketplaceList, marketplace_item: marketplaceItem, marketplace_seller: pageInfo },
    _test: { parsePost, parseListingCard, detect },
  });
})();
