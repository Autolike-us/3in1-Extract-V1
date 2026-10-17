// Offline UI test: dashboard + popup with a stubbed chrome.* API; saves screenshots to tests/out/.
const fs = require('node:fs'), path = require('node:path');
const { launch, read, check, done, ROOT } = require('./_pw.cjs');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

const ROWS = Array.from({ length: 130 }, (_, i) => ({ id: 'g' + i, name: 'Member ' + i, profileUrl: 'https://www.facebook.com/' + i, followers: 1000 + i, emails: i % 10 === 0 ? ['m' + i + '@x.com'] : undefined, platform: 'facebook', kind: 'group_members', media: [{ type: 'image', url: 'https://img.test/p' + i + '.jpg' }] }));
const RUNS = [
  { id: 'r1', platform: 'facebook', kind: 'group_members', label: 'Facebook · Group members', opts: { limit: 200 }, status: 'done', count: 130, startedAt: Date.now() - 3600e3 },
  { id: 'r2', platform: 'tiktok', kind: 'comments', label: 'TikTok · Comments', opts: { limit: 200 }, status: 'error', error: 'Reload the tab', count: 0, startedAt: Date.now() - 7200e3 },
];
const stub = ([runs, rows, tabs]) => {
  const store = { runs, 'rows:r1': rows, 'rows:r2': [], debugLog: [{ t: Date.now(), l: 'warn', m: 'HTTP 429 /api/v1/friendships/<id>/followers/', r: 'r2', d: 'retry 1/2' }] };
  window.__clip = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip = t; } }, configurable: true });
  window.__sent = [];
  const page = { label: 'Group members', primary: 'group_members', kinds: [{ id: 'group_members', label: 'Group members' }, { id: 'posts', label: 'Posts' }] };
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
  const open = async (name, files, vp = { width: 1360, height: 900 }, dark = false) => {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true }); const pg = await ctx.newPage(); pg.setDefaultTimeout(15000);
    const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
    await pg.route('https://img.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64') }));
    await pg.setContent(read(name).replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*stylesheet[^>]*>/, '<style>' + read('style.css') + '</style>'));
    await pg.evaluate(stub, [RUNS, ROWS, tabs]);
    for (const f of files) await pg.addScriptTag({ content: read(f) });
    await pg.waitForTimeout(500);
    return { pg, errs, ctx };
  };
  const libs = ['core/zip.js', 'core/export.js', 'catalog.js', 'report.js', 'dashboard.js'];

  let { pg, errs } = await open('dashboard.html', libs);
  check('dashboard loads with no script errors', errs.length === 0);
  check('all three platforms are offered', (await pg.$$('.plat')).length === 3);
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
  check('results list shows both runs and a nav count', (await pg.$$('.run')).length === 2 && (await pg.textContent('#navCount')) === '2');
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
  check('media ZIP bundles all 130 images + index.csv in tidy folders', /^131\n/.test(listing) && /facebook\/Member_0\/g0_1\.jpg/.test(listing));
  await pg.click('[data-x=hidestrip]'); check('upsell strip is dismissible', !(await pg.isVisible('#strip')));

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
  check('popup detects the page and offers kinds', /Group members/.test(await pg.textContent('#box')) && (await pg.$$('#kind option')).length === 2 && errs.length === 0);
  await pg.screenshot({ path: path.join(OUT, '6-popup.png') });
  await pg.click('#start'); await pg.waitForTimeout(200);
  check('popup starts a run for the current tab', (await pg.evaluate(() => window.__sent.find((m) => m.type === 'startRun'))).tabId === 11);

  await browser.close(); done();
})().catch((e) => { console.error(e); process.exit(1); });
