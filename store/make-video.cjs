// 10-second demo video of the dashboard flow, recorded from the real UI with FICTIONAL sample data.
//   node store/make-video.cjs -> store/assets/aurora-extract-demo-10s.mp4
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const src = fs.readFileSync(path.join(__dirname, 'make-assets.cjs'), 'utf8').split('(async () => {')[0].replace(/require\('\.\.\/\.\.[^']*'\)/g, 'null');
const D = new Function('require', '__dirname', src + ';return {RUNS,BIZ,VID,COMMENTERS,TABS,DESC,stub,read,exe}')(require, __dirname);
const OUT = path.join(__dirname, 'assets'), TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vid-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ executablePath: D.exe, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: TMP, size: { width: 1280, height: 800 } } });
  const t0 = Date.now(), pg = await ctx.newPage();
  await pg.setContent(D.read('dashboard.html').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*stylesheet[^>]*>/, '<style>' + D.read('style.css') + '</style>'));
  await pg.evaluate(D.stub, [D.RUNS, { a: D.BIZ, b: D.VID, c: D.COMMENTERS }, D.TABS, D.DESC]);
  for (const f of ['core/zip.js', 'core/export.js', 'catalog.js', 'report.js', 'dashboard.js']) await pg.addScriptTag({ content: D.read(f) });
  await pg.addStyleTag({ content: `
    #cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;background:rgba(10,40,44,.92);color:#fff;font:700 26px Inter,sans-serif;padding:14px 28px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .25s;white-space:nowrap}
    #cap b{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;margin-right:12px;background:linear-gradient(135deg,#0d9488,#22b8e8)}
    #sample{position:fixed;right:18px;top:14px;z-index:99999;background:rgba(10,40,44,.85);color:#cfeee9;font:600 14px Inter,sans-serif;padding:6px 12px;border-radius:999px}
    #cur{position:fixed;z-index:100000;width:26px;height:26px;pointer-events:none;transition:left .55s ease,top .55s ease;left:640px;top:420px}
    #end{position:fixed;inset:0;z-index:100001;display:grid;place-items:center;background:linear-gradient(135deg,#047857,#0d9488 40%,#0891b2 72%,#22b8e8);color:#fff;font-family:Inter,sans-serif;text-align:center;opacity:0;transition:opacity .5s;pointer-events:none}
    #end h1{font-size:72px;letter-spacing:-2px;margin-bottom:12px}#end p{font-size:28px;opacity:.95}` });
  await pg.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="sample">Demo with fictional sample data</div><div id="cap"></div><div id="cur"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#0f2a2e" stroke-width="1.6" stroke-linejoin="round"/></svg></div><div id="end"><div><h1>Aurora Extract</h1><p>Free · Facebook, Instagram &amp; TikTok → CSV, Excel, JSON</p><p style="margin-top:14px;font-size:22px">getaurorastudios.com/extract</p></div></div>');
    window.cap = (n, t) => { const c = document.getElementById('cap'); c.style.opacity = 1; c.innerHTML = '<b>' + n + '</b>' + t; };
    window.go = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); const c = document.getElementById('cur'); c.style.left = r.left + r.width / 2 - 6 + 'px'; c.style.top = r.top + r.height / 2 - 4 + 'px'; };
  });
  await pg.waitForTimeout(600);
  const start = (Date.now() - t0) / 1000;
  // ---- scenes (10 s)
  await pg.evaluate(() => cap(1, 'Open a public page · Aurora Extract recognises it'));
  await sleep(1400);
  await pg.evaluate(() => { document.querySelector('#goBtn').scrollIntoView({ block: 'center' }); }); await sleep(150);
  await pg.evaluate(() => go('#goBtn')); await sleep(750);
  await pg.click('#goBtn'); await sleep(900);                       // toast "Extraction started"
  await pg.evaluate(() => cap(2, 'Results appear as a clean table'));
  await pg.evaluate(() => go('nav [data-view=results]')); await sleep(700);
  await pg.click('nav [data-view=results]'); await sleep(250);
  await pg.click('.run[data-r=a]'); await sleep(1700);
  await pg.evaluate(() => cap(3, 'Export CSV, Excel, JSON or a media ZIP'));
  await pg.evaluate(() => go('[data-x=csv]')); await sleep(900);
  await pg.click('[data-x=csv]'); await sleep(1000);
  await pg.evaluate(() => { document.getElementById('cap').style.opacity = 0; document.getElementById('end').style.opacity = 1; });
  await sleep(4500);
  await pg.close(); await ctx.close(); await b.close();
  const webm = fs.readdirSync(TMP).find((f) => f.endsWith('.webm'));
  // find scenario start (dark caption pill) and end-card start; retime that span to exactly 10 s
  const probe = path.join(TMP, 'p.py');
  fs.writeFileSync(probe, "import subprocess,sys,io\nfrom PIL import Image\nst=end=None\nfor i in range(0,400):\n  t=i/10\n  b=subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',sys.argv[1],'-frames:v','1','-f','image2pipe','-vcodec','png','-'],capture_output=True).stdout\n  if not b: break\n  im=Image.open(io.BytesIO(b)).convert('RGB')\n  if st is None and sum(im.getpixel((300,735)))<260: st=t\n  p=im.getpixel((20,20))\n  if st is not None and end is None and p[0]<30 and p[1]>100 and p[2]<130: end=t\nprint(st,end)\n");
  const [st, en] = cp.execFileSync('python3', ['-I', probe, path.join(TMP, webm)]).toString().trim().split(' ').map(Number);
  const ss = Math.max(0, st - 0.05), span = en + 1.2 - ss, out = path.join(OUT, 'aurora-extract-demo-10s.mp4');
  console.log('start', st, 'end', en, 'webm', cp.execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', path.join(TMP, webm)]).toString().trim());
  cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(ss), '-t', String(span), '-i', path.join(TMP, webm), '-vf', `setpts=PTS*${(10 / span).toFixed(4)}`, '-t', '10', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-an', out]);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(out, cp.execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim() + 's');
})();
