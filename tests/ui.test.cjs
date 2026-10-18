// Offline UI test: dashboard + popup with a stubbed chrome.* API; saves screenshots to tests/out/.
const fs = require('node:fs'), path = require('node:path');
const { launch, read, check, done, ROOT } = require('./_pw.cjs');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

const ROWS = Array.from({ length: 130 }, (_, i) => ({ id: 'g' + i, name: 'Member ' + i, profileUrl: 'https://www.facebook.com/' + i, followers: 1000 + i, emails: i % 10 === 0 ? ['m' + i + '@x.com'] : undefined, platform: 'facebook', kind: 'group_members', media: [{ type: 'image', url: 'https://img.test/p' + i + '.jpg' }] }));
const RUNS = [
  { id: 'r1', platform: 'facebook', kind: 'group_members', label: 'Facebook · Group members', opts: { limit: 200 }, status: 'done', count: 130, startedAt: Date.now() - 3600e3 },
  { id: 'r2', platform: 'tiktok', kind: 'comments', label: 'TikTok · Comments', opts: { limit: 200 }, status: 'error', error: 'Reload the tab', count: 0, startedAt: Date.now() - 7200e3 },
  { id: 'r3', platform: 'tiktok', kind: 'videos', label: 'TikTok · Videos', opts: { limit: 5 }, status: 'done', count: 3, startedAt: Date.now() - 9000e3 },
];
const VROWS = [
  { id: 'v1', author: 'chef', platform: 'tiktok', url: 'https://www.tiktok.com/@chef/video/1', media: [{ type: 'video', url: 'https://v.test/ok.mp4' }, { type: 'image', url: 'https://img.test/c1.jpg' }] },
  { id: 'v2', author: 'chef', platform: 'tiktok', url: 'https://www.tiktok.com/@chef/video/2', media: [{ type: 'video', url: 'https://v.test/fake.mp4' }, { type: 'image', url: 'https://img.test/c2.jpg' }] },
  { id: 'v3', author: 'chef', platform: 'tiktok', url: 'https://www.tiktok.com/@chef/video/3', videoMissing: true, media: [{ type: 'video', url: 'https://v.test/gone.mp4' }] },
];
const Audit = require('../core/audit.js');
const NOW = Date.now(), DAY = 86400000;
const AREPORT = Audit.analyze({ platform: 'instagram', now: NOW, profile: { username: 'urbanstep', name: 'Urban Step Shoes', bio: 'Shoes for every day.', followers: 12000, website: 'https://urbanstep.example', category: 'Shoe store', business: true, avatar: 'x' }, posts: Array.from({ length: 18 }, (_, i) => ({ postedAt: new Date(NOW - i * 3.5 * DAY).toISOString(), caption: i % 4 ? 'New arrivals in store this week' : 'Which colour do you prefer? #shoes #style #sale #new #shop #fashion', likes: 60 + i, comments: i % 5 ? 1 : 4, type: 'photo' })) });
const AROWS = [{ ...Audit.toRow(AREPORT, { username: 'urbanstep', name: 'Urban Step Shoes', url: 'https://www.instagram.com/urbanstep/' }), platform: 'instagram', kind: 'audit' }];
const ARUN = { id: 'ra', platform: 'instagram', kind: 'audit', label: 'Instagram · Health check (Aurora Audit)', opts: { limit: 30 }, status: 'done', count: 1, startedAt: Date.now() - 1000e3 };
const stub = ([runs, rows, tabs, vrows, arows]) => {
  const store = { runs, 'rows:r1': rows, 'rows:r2': [], 'rows:r3': vrows, 'rows:ra': arows || [], debugLog: [{ t: Date.now(), l: 'warn', m: 'HTTP 429 /api/v1/friendships/<id>/followers/', r: 'r2', d: 'retry 1/2' }] };
  window.__clip = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip = t; } }, configurable: true });
  window.__sent = [];
  const page = { label: 'Group members', primary: 'group_members', kinds: [{ id: 'group_members', label: 'Group members' }, { id: 'posts', label: 'Posts' }, { id: 'audit', label: 'Health check' }] };
  window.chrome = {
    storage: { local: { get: async (k) => { const o = {}; [].concat(k || []).forEach((x) => { if (x in store) o[x] = store[x]; }); return o; }, set: async (o) => Object.assign(store, o), remove: async () => {} }, onChanged: { addListener() {} } },
    tabs: { query: async (q) => (q.active ? [{ id: 11, url: 'https://www.facebook.com/groups/9/members', title: 'Group' }] : tabs.filter((t) => q.url.some((m) => t.url.includes(m.split('*.')[1].split('/')[0])))), sendMessage: async () => ({ platform: 'facebook', name: 'Facebook', page }), create: async (o) => { window.__sent.push({ create: o.url }); }, reload() {}, onUpdated: { addListener() {} } },
    runtime: { getManifest: () => ({ name: 'Aurora Extract', version: '9.9.9' }), sendMessage: (m, cb) => { window.__sent.push(m); (cb || (() => {}))({ ok: true, runId: 'new' }); }, getURL: (x) => x },
  };
  window.close = () => {};
};
(async () => {
  const browser = await launch();
  const tabs = [{ id: 11, url: 'https://www.facebook.com/groups/9/members', title: 'My Group | Facebook', platform: 'facebook' }];
  const open = async (name, files, vp = { width: 1360, height: 900 }, dark = false, runs = RUNS) => {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true }); const pg = await ctx.newPage(); pg.setDefaultTimeout(15000);
    const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
    await pg.route('https://v.test/**', (r) => { const u = r.request().url(); if (/ok\.mp4/.test(u)) return r.fulfill({ contentType: 'video/mp4', body: Buffer.alloc(6000, 7) }); if (/fake\.mp4/.test(u)) return r.fulfill({ contentType: 'image/png', body: Buffer.alloc(3000, 1) }); return r.fulfill({ status: 403, contentType: 'text/html', body: 'blocked' }); });
    await pg.route('https://img.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: Buffer.concat([Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'), Buffer.alloc(400, 1)]) }));
    await pg.setContent(read(name).replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*stylesheet[^>]*>/, '<style>' + read('style.css') + '</style>'));
    await pg.evaluate(stub, [runs, ROWS, tabs, VROWS, AROWS]);
    for (const f of files) await pg.addScriptTag({ content: read(f) });
    await pg.waitForTimeout(500);
    return { pg, errs, ctx };
  };
  const libs = ['core/zip.js', 'core/export.js', 'catalog.js', 'report.js', 'dashboard.js'];

  let { pg, errs } = await open('dashboard.html', libs);
  check('dashboard loads with no script errors', errs.length === 0);
  check('all three platforms are offered', (await pg.$$('#platforms .plat')).length === 3);
  check('the tab the user is on is auto-selected with a detected-page badge', /Group members/.test(await pg.textContent('.tabrow')) && (await pg.getAttribute('.plat[data-p=facebook]', 'aria-pressed')) === 'true');
  await pg.screenshot({ path: path.join(OUT, '1-extract.png'), fullPage: true });
  check('step 3 offers kinds, limit, speed, media', (await pg.$$('#kinds .chip')).length === 2 && !!(await pg.$('#oLimit')) && (await pg.$$('#oSpeed button')).length === 3);
  await pg.click('#oSpeed [data-s=gentle]'); await pg.fill('#oLimit', '50'); await pg.dispatchEvent('#oLimit', 'change');
  await pg.click('#goBtn'); await pg.waitForTimeout(200);
  const start = await pg.evaluate(() => window.__sent.find((m) => m.type === 'startRun'));
  check('Start sends kind, limit, gentle pacing to the worker', start && start.kind === 'group_members' && start.opts.limit === 50 && start.opts.delayMs === 2200 && start.tabId === 11);
  await pg.click('.plat[data-p=tiktok]'); await pg.waitForTimeout(150);
  check('switching platform with no open tab shows quick-open guidance', /Open TikTok in a normal tab/.test(await pg.textContent('#tabsArea')));
  await pg.click('[data-open="0"]'); check('quick-open button opens the platform', (await pg.evaluate(() => window.__sent.find((m) => m.create))).create.includes('tiktok.com'));
  await pg.screenshot({ path: path.join(OUT, '2-empty-platform.png') });

  await pg.click('nav [data-view=results]'); await pg.waitForTimeout(300);
  check('results list shows both runs and a nav count', (await pg.$$('.run')).length === 3 && (await pg.textContent('#navCount')) === '3');
  check('table renders first 100 of 130 rows with thumbnails and no raw media column', (await pg.$$('tbody tr')).length === 100 && !!(await pg.$('td img')) && !/>media</.test(await pg.innerHTML('thead')));
  await pg.click('[data-x=more]'); check('"Show more" reveals the rest', (await pg.$$('tbody tr')).length === 130);
  await pg.fill('#q', 'Member 12'); await pg.waitForTimeout(450);
  check('search filters rows', (await pg.$$('tbody tr')).length === 11);
  await pg.screenshot({ path: path.join(OUT, '3-results.png') });
  await pg.fill('#q', ''); await pg.waitForTimeout(450);
  const grab = async (sel) => { const [d] = await Promise.all([pg.waitForEvent('download'), pg.click(sel)]); const f = path.join(OUT, d.suggestedFilename()); await d.saveAs(f); return f; };
  const csv = fs.readFileSync(await grab('[data-x=csv]'), 'utf8');
  check('CSV export has header, 130 rows and media URLs column', csv.split('\r\n').length === 131 && /mediaUrls/.test(csv.split('\r\n')[0]));
  const xl = await grab('[data-x=xlsx]'); check('Excel export is a valid zip', fs.readFileSync(xl).slice(0, 2).toString() === 'PK');
  const js = JSON.parse(fs.readFileSync(await grab('[data-x=json]'), 'utf8')); check('JSON export keeps full rows', js.length === 130 && js[0].media.length === 1);
  const zip = await grab('[data-x=media]'); await pg.waitForTimeout(100);
  const { execFileSync } = require('node:child_process');
  const listing = execFileSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(len(z.namelist()));print([n for n in z.namelist() if n.startswith("facebook")][:2])', zip]).toString();
  check('media ZIP bundles all 130 images + index.csv + report in tidy folders', /^132\n/.test(listing) && /facebook\/Member_0\/g0_1\.jpg/.test(listing));
  await pg.click('[data-x=hidestrip]'); check('upsell strip is dismissible', !(await pg.isVisible('#strip')));

  await pg.click('.run[data-r=r3]'); await pg.waitForTimeout(300);
  check('results table marks rows that hold a real video (▶ chip) and rows with no video file', (await pg.$$('.mchip.vid')).length === 3 && (await pg.$$('.mchip.warn')).length === 1);
  const vz = await grab('[data-x=media]'); await pg.waitForTimeout(300);
  const vlist = execFileSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(sorted(z.namelist()));print(z.read("download-report.txt").decode())', vz]).toString();
  check('TikTok ZIP: the real video is saved as .mp4 (not a picture)', /tiktok\/chef\/v1_1\.mp4/.test(vlist));
  check('TikTok ZIP: a "video" the server answers with an image is rejected, not saved as a video', !/v2_1\.(mp4|png|jpg)/.test(vlist) && /FAILED  video expected video, server sent image\/png/.test(vlist));
  check('TikTok ZIP: blocked links are listed as failed with the reason; report summarises the counts', /FAILED  video HTTP 403/.test(vlist) && /videos saved: 1  photos saved: 2  failed: 2/.test(vlist));
  await pg.click('.run[data-r=r2]'); await pg.waitForTimeout(200);
  await pg.click('#viewer [data-x=report]'); await pg.waitForTimeout(200);
  const rep = await pg.evaluate(() => window.__clip);
  check('debug report: version, run error, log lines; no row data', /Aurora Extract v9\.9\.9/.test(rep) && /ERROR: Reload the tab/.test(rep) && /HTTP 429/.test(rep) && !/Member 1/.test(rep));
  await pg.click('#reportBtn'); await pg.waitForTimeout(150);
  check('sidebar "Copy debug report" copies a report covering recent runs', /RUN r1/.test(await pg.evaluate(() => window.__clip)) && /RUN r2/.test(await pg.evaluate(() => window.__clip)));
  await pg.click('nav [data-view=studios]');
  check('studios tab advertises all three paid extensions with tracked links', (await pg.$$('.studio')).length === 3 && (await pg.getAttribute('.studio a', 'href')).includes('utm_source=extract'));
  await pg.screenshot({ path: path.join(OUT, '4-studios.png') });
  check('Telegram channel is linked from the sidebar and the Help page', (await pg.getAttribute('#tgBtn', 'href')).includes('t.me/+GqmNSvnMJxhhMzJh') && (await pg.$$('a[href*="t.me/+GqmNSvnMJxhhMzJh"]')).length >= 2);
  await pg.click('nav [data-view=help]'); check('help states the data never leaves the computer', /never leaves your computer/.test(await pg.textContent('#view-help')));

  // dark + mobile-ish width
  ({ pg, errs } = await open('dashboard.html', libs, { width: 760, height: 900 }, true));
  await pg.screenshot({ path: path.join(OUT, '5-dark-narrow.png'), fullPage: true });
  check('default theme is LIGHT even when the OS prefers dark', await pg.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(246, 245, 251)'));
  check('dark/narrow layout has no horizontal overflow', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // popup
  ({ pg, errs } = await open('popup.html', ['catalog.js', 'popup.js'], { width: 360, height: 400 }));
  check('popup detects the page and offers kinds', /Group members/.test(await pg.textContent('#box')) && (await pg.$$('#kind option')).length === 3 && errs.length === 0);
  await pg.screenshot({ path: path.join(OUT, '6-popup.png') });
  await pg.click('#start'); await pg.waitForTimeout(200);
  check('popup starts a run for the current tab', (await pg.evaluate(() => window.__sent.find((m) => m.type === 'startRun'))).tabId === 11);


  // ---- Aurora Audit
  ({ pg, errs } = await open('dashboard.html', libs, { width: 1360, height: 900 }, false, [ARUN, ...RUNS]));
  check('the Extract page stays uncluttered: no Health check chip among the options', !(await pg.$('#kinds [data-k=audit]')) && !(await pg.$('#modes')));
  await pg.click('nav [data-view=results]'); await pg.waitForTimeout(250); await pg.click('.run[data-r=ra]'); await pg.waitForTimeout(300);
  check('audit run opens a report, not a table', !!(await pg.$('.audit .agauge')) && !(await pg.$('tbody tr')));
  check('report shows the score, grade and verdict', (await pg.textContent('.agauge b')) === String(AREPORT.score) && (await pg.textContent('.agrade')) === AREPORT.grade && (await pg.textContent('.ahead p')).length > 5);
  check('report lists the top fixes and all five score sections with findings', (await pg.$$('.afixes li')).length >= 1 && (await pg.$$('.asec')).length === 5 && (await pg.$$('.asec li')).length >= 10);
  await pg.screenshot({ path: path.join(OUT, '9-audit.png'), fullPage: true });
  await pg.click('[data-x=copyaudit]'); await pg.waitForTimeout(150);
  const clip = await pg.evaluate(() => window.__clip);
  check('Copy summary puts the score, sections and fixes on the clipboard', new RegExp('Score ' + AREPORT.score + '/100').test(clip) && /Top fixes:/.test(clip) && /Bio & profile:/.test(clip));
  const acsv = fs.readFileSync(await (async () => { const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-x=csv]')]); const f = path.join(OUT, d.suggestedFilename()); await d.saveAs(f); return f; })(), 'utf8');
  const hdr = acsv.split('\r\n')[0].split(',');
  check('audit CSV is one tidy row: score, grade, section scores, top fixes — and no raw JSON blob', acsv.split('\r\n').length === 2 && hdr.includes('score') && hdr.includes('grade') && hdr.includes('profileScore') && hdr.includes('topFixes') && !hdr.includes('audit'));
  check('dashboard with an audit has no script errors', errs.length === 0, errs.join(' | '));
  await pg.close();
  ({ pg, errs } = await open('dashboard.html', libs, { width: 1360, height: 900 }, true, [ARUN, ...RUNS]));
  await pg.click('nav [data-view=results]'); await pg.waitForTimeout(250); await pg.click('.run[data-r=ra]'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(OUT, '10-audit-dark.png'), fullPage: true });
  check('dark theme audit renders with no script errors', errs.length === 0 && !!(await pg.$('.audit .agauge')));

  ({ pg, errs } = await open('dashboard.html', libs));
  check('the left menu has a Health check item with a "new" tag', /Health check/.test(await pg.textContent('nav [data-view=audit]')) && /new/i.test(await pg.textContent('nav [data-view=audit]')));
  await pg.click('nav [data-view=audit]'); await pg.waitForTimeout(400);
  check('clicking Health check in the menu opens the Health check page', !(await pg.isHidden('#view-audit')) && (await pg.isHidden('#view-extract')) && /How healthy/.test(await pg.textContent('#view-audit h1')));
  check('the page explains the five things it checks', (await pg.$$('#view-audit .lcard')).length === 5);
  check('the page shows the platforms, the open tab and a Run button for a scoreable page', (await pg.$$('#auditPlats .plat')).length === 3 && !!(await pg.$('#auditTabs .tabrow')) && !!(await pg.$('#auditGo')));
  await pg.screenshot({ path: path.join(OUT, '11-health-check-page.png'), fullPage: true });
  check('the Health check page lets the user choose how many posts to read (Quick 10 · Standard 20 · Deep 30, Standard preselected)', (await pg.$$('#aCount button')).length === 3 && (await pg.getAttribute('#aCount .on', 'data-n')) === '20');
  await pg.click('#aCount [data-n="10"]'); await pg.click('#aSpeed [data-s=gentle]'); await pg.click('#auditGo'); await pg.waitForTimeout(250);
  const hs = await pg.evaluate(() => window.__sent.filter((m) => m.type === 'startRun').pop());
  check('Run health check starts the audit with the chosen number of posts and pacing', hs && hs.kind === 'audit' && hs.opts.limit === 10 && hs.opts.delayMs === 2200 && /Health check/.test(hs.label));
  check('Extract page shows no health-check progress card (it lives on the Health check page)', await pg.evaluate(() => document.querySelector('#liveCard').hidden));
  check('no script errors on the Health check page', errs.length === 0, errs.join(' | '));
  await pg.close();
  await browser.close(); done();
})().catch((e) => { console.error(e); process.exit(1); });
