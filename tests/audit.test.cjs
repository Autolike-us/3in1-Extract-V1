// Aurora Audit: scoring engine (pure) + end-to-end runs of the audit task against offline fixtures.
const { launch, read, check, done } = require('./_pw.cjs');
const Audit = require('../core/audit.js');
const NOW = Date.parse('2026-10-17T12:00:00Z'), DAY = 86400000;
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

(async () => {
  // ---- dates
  const W = (v) => Audit.parseWhen(v, NOW);
  check('parseWhen reads ISO, relative and short dates', W('2026-10-10T00:00:00Z') === Date.parse('2026-10-10T00:00:00Z') && W('5h') === NOW - 5 * 3600000 && W('2 d') === NOW - 2 * DAY && W('3w') === NOW - 21 * DAY && W('Yesterday at 9:00 AM') === NOW - DAY && W('nonsense') === null && W('') === null);
  const mar = W('March 3');
  check('parseWhen: a month/day without a year is never in the future', mar != null && mar <= NOW + DAY);

  // ---- a healthy account
  const goodPosts = Array.from({ length: 24 }, (_, i) => ({
    postedAt: iso(i * 1.2 + 0.5), caption: `Fresh batch today — which flavour would you pick? Tell us below! ${'#coffee #latteart #localcafe #brunch #barista'.split(' ').slice(0, 4 + (i % 3)).join(' ')} ${'x'.repeat(40 + i)}`,
    likes: 280 + (i % 5) * 20, comments: 16 + (i % 4), type: i % 3 === 0 ? 'reel' : 'photo', media: [],
  }));
  const good = Audit.analyze({
    platform: 'instagram', now: NOW, posts: goodPosts,
    profile: { username: 'acme', name: 'Acme Café', bio: 'Specialty coffee & fresh bakes in Austin ☕ Order ahead or DM us — book a table below 👇', category: 'Coffee shop', business: true, website: 'https://acme.example', email: 'hi@acme.example', phone: '+1 555 0100', followers: 10000, avatar: 'x' },
  });
  check('a healthy Instagram account scores 80+ (grade A/B)', good.score >= 80 && /^[AB]$/.test(good.grade), `score ${good.score}`);
  check('sections add up to the score and none exceed their maximum', good.sections.every((s) => s.score <= s.max) && Math.abs(good.sections.reduce((a, s) => a + (s.score || 0), 0) - good.score) <= 1, JSON.stringify(good.sections.map((s) => s.score)));
  check('stats are filled in from the posts', good.stats.postsAnalysed === 24 && good.stats.postsPerWeek > 4 && good.stats.daysSinceLastPost < 2 && good.stats.engagementRate > 2);

  // ---- a neglected account
  const bad = Audit.analyze({
    platform: 'instagram', now: NOW,
    profile: { username: 'oldshop', name: 'Old Shop', bio: '', followers: 5000 },
    posts: [{ postedAt: iso(80), caption: 'sale', likes: 10, comments: 0 }, { postedAt: iso(140), caption: '', likes: 8, comments: 0 }, { postedAt: iso(200), caption: 'new', likes: 12, comments: 1 }],
  });
  check('a neglected account scores below 40 and says why', bad.score < 40 && bad.grade === 'F', `score ${bad.score}`);
  check('top fixes name the biggest gaps (bio, link, posting)', bad.topFixes.length >= 3 && bad.topFixes.some((f) => /bio/i.test(f.label)) && bad.topFixes.some((f) => /website|link/i.test(f.label)) && bad.topFixes.every((f) => f.tip));
  check('findings carry a level, a detail and a tip when not good', bad.sections.every((s) => s.findings.every((f) => ['good', 'warn', 'bad'].includes(f.level) && f.detail && (f.level === 'good' || f.tip))));
  check('higher quality scores higher: healthy > neglected', good.score > bad.score + 40);

  // ---- missing information is left out, never punished or invented
  const noDates = Audit.analyze({ platform: 'facebook', now: NOW, profile: { name: 'P', bio: 'We sell shoes. Visit us today!', followers: 900, websites: ['https://p.example'], emails: ['a@p.example'], category: 'Shoe store' }, posts: [{ text: 'a', reactions: 5 }, { text: 'b', reactions: 7 }, { text: 'c', reactions: 2 }] });
  const rh = noDates.sections.find((s) => s.id === 'rhythm');
  check('no readable dates: rhythm is "not scored", a note explains, and the score still computes', rh.score == null && noDates.notes.some((n) => /dates/i.test(n)) && noDates.score > 0 && noDates.score <= 100);
  const profileOnly = Audit.analyze({ platform: 'tiktok', now: NOW, profile: { username: 'x', name: 'X', bio: 'hello' }, posts: [] });
  check('profile only (no posts read): scores the profile and tells the user how to get the rest', profileOnly.sections.filter((s) => s.score != null).map((s) => s.id).join() === 'profile,contact' && profileOnly.notes.length === 1);
  const empty = Audit.analyze({ platform: 'instagram', now: NOW, profile: null, posts: null });
  check('an empty profile does not crash', typeof empty.score === 'number' && empty.score >= 0 && empty.score <= 100);

  // ---- platform differences
  const ttPosts = Array.from({ length: 12 }, (_, i) => ({ postedAt: iso(i * 1.5), description: 'quick pasta tip #food #pasta #recipe', hashtags: ['#food', '#pasta', '#recipe'], plays: 20000, likes: 1500, comments: 60, shares: 90 }));
  const tt = Audit.analyze({ platform: 'tiktok', now: NOW, profile: { username: 'chef', name: 'Chef', bio: 'Pasta in 60s — new video daily. Recipes ↓', followers: 50000, website: 'https://chef.example' }, posts: ttPosts });
  check('TikTok engagement uses views as the base ((likes+comments+shares) ÷ views)', Math.abs(tt.stats.engagementRate - 8.25) < 0.01, String(tt.stats.engagementRate));
  const fb = Audit.analyze({ platform: 'facebook', now: NOW, profile: { name: 'P', bio: 'b', followers: 1000 }, posts: Array.from({ length: 5 }, (_, i) => ({ postedAt: iso(i), text: 'hello', reactions: 5 })) });
  check('Facebook does not score hashtags', !fb.sections.find((s) => s.id === 'content').findings.some((f) => f.id === 'tags'));

  // ---- export row
  const row = Audit.toRow(good, { username: 'acme', name: 'Acme Café', url: 'https://www.instagram.com/acme/' });
  check('export row is flat for spreadsheets and keeps the full report for the dashboard', row.score === good.score && row.grade === good.grade && /\//.test(row.profileScore) && typeof row.topFixes === 'string' && row.audit && row.audit.sections.length === 5 && Object.entries(row).every(([k, v]) => k === 'audit' || v == null || typeof v !== 'object'));

  // ---- end to end: Instagram (site API mocked) and Facebook (DOM fixture), through the real extractor code
  const browser = await launch();
  const pg = await (await browser.newContext()).newPage(); pg.on('pageerror', (e) => { throw e; });
  const stub = () => { window.chrome = { runtime: { sendMessage: () => {}, onMessage: { addListener() {} } } }; };
  const mk = `(()=>{const rows=[];const logs=[];const ctx={opts:{},limit:30,stopped:()=>false,count:()=>rows.length,pause:()=>new Promise(r=>setTimeout(r,2)),log:(l,m)=>logs.push(l+': '+m),setWarning(){},progress(){},emit(r){for(const x of [].concat(r))rows.push(x);return 1}};return {ctx,rows,logs}})()`;
  const igUser = { id: '1', username: 'acme', full_name: 'Acme Café', biography: 'Fresh coffee ☕ DM us to order', is_business_account: true, category_name: 'Coffee shop', external_url: 'https://acme.example', public_email: 'hi@acme.example', edge_followed_by: { count: 8000 }, edge_follow: { count: 90 }, edge_owner_to_timeline_media: { count: 200 }, profile_pic_url: 'https://x/y.jpg' };
  const feed = Array.from({ length: 12 }, (_, i) => ({ pk: '9' + i, code: 'C' + i, taken_at: Math.floor((NOW - i * 2 * DAY) / 1000), caption: { text: 'Latte art Friday — which one is yours? #latteart #coffee #austin' }, like_count: 200 + i, comment_count: 12, media_type: 1, user: { username: 'acme' } }));
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('web_profile_info')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { user: igUser } }) });
    if (u.includes('/feed/user/')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: feed, more_available: false }) });
    return r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>t</title><meta property="og:description" content="8,000 Followers, 90 Following, 200 Posts"><body><header><section><h2>acme</h2><ul><li>200 posts</li><li>8,000 followers</li></ul></section></header></body>' });
  });
  await pg.goto('https://www.instagram.com/acme/'); await pg.evaluate(stub);
  for (const f of ['content/common.js', 'core/audit.js', 'content/instagram.js']) await pg.addScriptTag({ content: read(f) });
  const ig = await pg.evaluate(async (m) => { const { ctx, rows, logs } = eval(m); await AuroraX.platforms.instagram.tasks.audit(ctx); return { rows, logs }; }, mk);
  const igRow = ig.rows[0];
  check('Instagram audit: one report row built from the profile and the latest posts', ig.rows.length === 1 && igRow.username === 'acme' && igRow.audit.stats.postsAnalysed === 12 && igRow.audit.stats.followers === 8000 && igRow.score > 60, JSON.stringify({ n: ig.rows.length, score: igRow && igRow.score }));
  // Instagram refuses the site API (429 / login page) -> the audit still works from what Instagram's own page loaded
  const nodes = Array.from({ length: 10 }, (_, i) => ({ code: 'D' + i, pk: '5' + i, taken_at: Math.floor((NOW - i * 2 * DAY) / 1000), like_count: 150 + i, comment_count: 9, caption: { text: 'New roast in! Which one is yours? #coffee #roast #austin' }, media_type: 1, user: { username: 'acme' } }));
  const gql = { data: { user: { ...igUser, username: 'acme', biography: 'Fresh coffee ☕ DM us to order', follower_count: 8000, following_count: 90, media_count: 200, category: 'Coffee shop', external_url: 'https://acme.example' }, xdt_api__v1__feed__user_timeline_graphql_connection: { edges: nodes.map((n) => ({ node: n })) } } };
  await pg.unroute('**/*');
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('web_profile_info')) return r.fulfill({ status: 429, contentType: 'application/json', body: '{"message":"rate limited"}' });
    if (u.includes('/feed/user/')) return r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Login</title>' });
    if (u.includes('/graphql/query')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(gql) });
    return r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>t</title><meta property="og:description" content="8,000 Followers, 90 Following, 200 Posts"><body><header><section><h2>acme</h2><ul><li>200 posts</li><li>8,000 followers</li></ul></section></header></body>' });
  });
  await pg.goto('https://www.instagram.com/acme/'); await pg.evaluate(stub);
  for (const f of ['content/ig-sniffer.js', 'content/common.js', 'core/audit.js', 'content/instagram.js']) await pg.addScriptTag({ content: read(f) });
  await pg.evaluate(() => fetch('https://www.instagram.com/graphql/query', { method: 'POST' })); await pg.waitForTimeout(300);
  const ig2 = await pg.evaluate(async (m) => { const { ctx, rows, logs } = eval(m); await AuroraX.platforms.instagram.tasks.audit(ctx); return { rows, logs }; }, mk);
  const r2 = ig2.rows[0];
  check('Instagram audit works from the page\'s own data when the site API says 429 / login (no extra requests needed)', ig2.rows.length === 1 && r2.audit.stats.postsAnalysed === 10 && r2.audit.stats.engagementRate > 1 && r2.audit.stats.postsPerWeek > 2 && r2.audit.stats.followers === 8000 && r2.audit.sections.find((s) => s.id === 'rhythm').score != null, JSON.stringify(r2 && r2.audit.stats));
  check('the debug log says what was read (profile fields and post numbers)', ig2.logs.some((l) => /audit: read/.test(l) && /"withLikes":10/.test(l) && /"withDate":10/.test(l)));
  check('Instagram audit offers itself on profile pages', await pg.evaluate(() => AuroraX.platforms.instagram.detect(new URL('https://www.instagram.com/acme/')).kinds.some((k) => k.id === 'audit')));

  await pg.unroute('**/*');
  await pg.route('**/*', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><title>t</title><body><div role="main"><h1>Acme Café</h1><div>Acme Café is a neighbourhood coffee shop in Austin serving specialty coffee, fresh pastries and light lunches every day of the week. About · Posts · Photos · Videos · Reviews</div><a href="https://l.facebook.com/l.php?u=${encodeURIComponent('https://acme.example')}">acme.example</a><a href="mailto:hi@acme.example">mail</a><div>Page · Coffee shop</div><div>4.2K followers</div></div>
    <div role="feed"><div role="article"><h3><a href="https://www.facebook.com/acme.cafe">Acme Café</a></h3><a href="https://www.facebook.com/acme.cafe/posts/111"><span>2h</span></a><div data-ad-preview="message"><div dir="auto">Fresh croissants today — who wants one?</div></div><div aria-label="Like: 40 people">40</div><span>5 comments</span></div>
    <div role="article"><h3><a href="https://www.facebook.com/acme.cafe">Acme Café</a></h3><a href="https://www.facebook.com/acme.cafe/posts/112"><span>2d</span></a><div dir="auto">Closed Monday.</div><div aria-label="Like: 12 people">12</div></div>
    <div role="article"><h3><a href="https://www.facebook.com/acme.cafe">Acme Café</a></h3><a href="https://www.facebook.com/acme.cafe/posts/113"><span>5d</span></a><div dir="auto">New menu is out! Visit us.</div><div aria-label="Like: 25 people">25</div><span>2 comments</span></div></div></body>` }));
  await pg.goto('https://www.facebook.com/acme.cafe'); await pg.evaluate(stub);
  for (const f of ['content/common.js', 'core/audit.js', 'content/facebook.js']) await pg.addScriptTag({ content: read(f) });
  const fbr = await pg.evaluate(async (m) => { const { ctx, rows } = eval(m); ctx.limit = 20; await AuroraX.platforms.facebook.tasks.audit(ctx); return rows; }, mk);
  check('Facebook audit: report built from the page details and the posts on screen', fbr.length === 1 && fbr[0].name === 'Acme Café' && fbr[0].audit.stats.postsAnalysed >= 2 && fbr[0].audit.sections.find((s) => s.id === 'contact').score > 10, JSON.stringify(fbr[0] && fbr[0].audit && fbr[0].audit.stats));
  check('Facebook audit offers itself on page/profile pages', await pg.evaluate(() => AuroraX.platforms.facebook.detect(new URL('https://www.facebook.com/acme.cafe')).kinds.some((k) => k.id === 'audit')));
  // Facebook: counts shown as their own lines ("All reactions:" / "1.2K" / "34 comments")
  await pg.unroute('**/*');
  await pg.route('**/*', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>t</title><body><div role="article"><h3><a href="https://www.facebook.com/acme.cafe">Acme</a></h3><a href="https://www.facebook.com/acme.cafe/posts/301"><span>3d</span></a><div dir="auto">Big news today</div><div>All reactions:</div><div>1.2K</div><div>34 comments</div><div>5 shares</div></div><div role="article"><a href="https://www.facebook.com/acme.cafe/posts/302"><span>4d</span></a><div dir="auto">Another one</div><div>87</div><div>12 comments</div></div></body>' }));
  await pg.goto('https://www.facebook.com/acme.cafe'); await pg.evaluate(stub);
  for (const f of ['content/common.js', 'core/audit.js', 'content/facebook.js']) await pg.addScriptTag({ content: read(f) });
  const fbn = await pg.evaluate(() => Array.from(document.querySelectorAll('[role=article]')).map((a) => { const r = AuroraX.platforms.facebook._test.parsePost(a); return { reactions: r.reactions, comments: r.comments, shares: r.shares }; }));
  check('Facebook post counts are read when shown as separate lines (1.2K reactions, 34 comments, 5 shares)', fbn[0].reactions === 1200 && fbn[0].comments === 34 && fbn[0].shares === 5 && fbn[1].reactions === 87 && fbn[1].comments === 12, JSON.stringify(fbn));
  // slow scrolling: half a screen at a time and a back-up when nothing new draws — never a jump to the bottom
  const sc = await pg.evaluate(async () => {
    document.body.innerHTML = '<div style="height:12000px"></div>'; window.scrollTo(0, 0);
    const ys = []; const ctx = { stopped: () => false, count: () => 0, limit: 99, pause: () => new Promise((r) => setTimeout(r, 5)), log() {} };
    let n = 0; const t0 = Date.now();
    await AuroraX.scrollCollect(ctx, () => { ys.push(Math.round(scrollY)); return n++ < 0 ? 1 : 0; }, { patience: 4, slow: true });
    return { ys, secs: (Date.now() - t0) / 1000, vh: innerHeight };
  });
  const maxJump = Math.max.apply(null, sc.ys.slice(1).map((y, i) => Math.abs(y - sc.ys[i])));
  console.log('scroll positions', JSON.stringify(sc));
  check('slow scrolling never jumps more than a screen at a time and takes its time', sc.ys.length >= 4 && maxJump <= sc.vh && sc.secs >= 3);
  const st = await pg.evaluate(async (m) => { const { ctx } = eval(m); const t0 = Date.now(); const no = await AuroraX.settle(ctx, () => false, { timeout: 500, quiet: 10 }); const waited = Date.now() - t0; const yes = await AuroraX.settle(ctx, () => true, { timeout: 500, quiet: 10 }); return { no, yes, waited }; }, mk);
  check('settle waits for the page, then gives up politely (never hangs) and returns at once when ready', st.no === false && st.waited >= 480 && st.waited < 2000 && st.yes === true);
  await browser.close();
  done();
})();
