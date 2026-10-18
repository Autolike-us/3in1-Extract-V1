// Chrome Web Store promo tiles (24-bit PNG, no alpha). node store/make-promo.cjs -> store/assets/promo-*.png
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path');
const OUT = path.join(__dirname, 'assets');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon128.png')).toString('base64');
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];

const spark = (s, c = '#fff') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path fill="${c}" d="M12 0c.9 6.7 4.3 11.1 12 12-7.7.9-11.1 5.3-12 12-.9-6.7-4.3-11.1-12-12C7.7 11.1 11.1 6.7 12 0z"/></svg>`;
const BASE = `*{box-sizing:border-box;margin:0}body{font-family:Inter,sans-serif;overflow:hidden;position:relative;
background:radial-gradient(900px 500px at 8% 0%,#d9f7ef 0,transparent 60%),radial-gradient(700px 500px at 100% 100%,#d4eefc 0,transparent 55%),#f4fbfa;color:#0f2a2e}
.g{background:linear-gradient(135deg,#047857,#0d9488 38%,#0891b2 70%,#22b8e8);-webkit-background-clip:text;color:transparent}
.abs{position:absolute}.chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-weight:700;background:#fff;box-shadow:0 2px 10px rgba(8,120,140,.14);color:#0b6b66}
.card{background:#fff;border-radius:22px;box-shadow:0 18px 40px rgba(8,100,120,.18),0 2px 6px rgba(8,100,120,.08)}
.dot{width:10px;height:10px;border-radius:50%}`;
const tile = (cls) => `<div class="ico ${cls}"><img src="${icon}"></div>`;

const SMALL = `<style>${BASE}
body{width:440px;height:280px}
.ico{position:absolute;left:26px;top:28px;width:68px;height:68px;border-radius:20px;background:#fff;box-shadow:0 8px 20px rgba(8,120,140,.25);display:grid;place-items:center}.ico img{width:52px}
h1{position:absolute;left:26px;top:112px;font-size:34px;font-weight:800;letter-spacing:-.8px;line-height:1}
p{position:absolute;left:26px;top:156px;font-size:15.5px;line-height:1.35;color:#3d5a5e;font-weight:500;width:268px}
.chips{position:absolute;left:26px;bottom:26px;display:flex;gap:7px}.chip{font-size:12px;padding:6px 11px}
.free{position:absolute;right:22px;top:22px;background:linear-gradient(135deg,#0d9488,#22b8e8);color:#fff;font-weight:800;font-size:13px;padding:7px 14px;border-radius:999px;box-shadow:0 6px 14px rgba(13,148,136,.35)}
.mini{position:absolute;right:-30px;top:66px;width:170px;padding:12px;transform:rotate(5deg);border-radius:16px}
.row{display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid #eaf3f3}.row:last-child{border:0}
.av{width:20px;height:20px;border-radius:50%}.ln{height:6px;border-radius:3px;background:#dbe9ea}
</style>
${tile('')}<div class="free">FREE</div><h1 class="g">Aurora Extract</h1>
<p>Public data from Facebook, Instagram &amp; TikTok, to a spreadsheet.</p>
<div class="chips"><span class="chip">CSV</span><span class="chip">Excel</span><span class="chip">JSON</span></div>
<div class="card mini">${[['#f9a8d4', 80], ['#7dd3fc', 62], ['#86efac', 72], ['#fde68a', 54]].map(([c, w]) => `<div class="row"><div class="av" style="background:${c}"></div><div class="ln" style="width:${w}px"></div></div>`).join('')}</div>
<div class="abs" style="right:180px;bottom:30px">${spark(26, '#22b8e8')}</div><div class="abs" style="right:150px;bottom:64px">${spark(14, '#0d9488')}</div>`;

const rows = [['#f9a8d4', 'Sunrise Bakery', 'hello@sunrise.example', '18.4K'], ['#7dd3fc', 'Harbor Coffee Co.', 'hello@harbor.example', '9.2K'], ['#86efac', 'Peak Fitness Studio', 'info@peakfit.example', '25.6K'], ['#fde68a', 'Willow & Oak Florist', 'hi@willowoak.example', '6.3K']];
const MARQ = `<style>${BASE}
body{width:1400px;height:560px}
.ico{position:absolute;left:96px;top:100px;width:104px;height:104px;border-radius:30px;background:#fff;box-shadow:0 14px 32px rgba(8,120,140,.28);display:grid;place-items:center}.ico img{width:80px}
.free{position:absolute;left:222px;top:130px;background:linear-gradient(135deg,#0d9488,#22b8e8);color:#fff;font-weight:800;font-size:20px;padding:10px 22px;border-radius:999px;box-shadow:0 8px 18px rgba(13,148,136,.35)}
h1{position:absolute;left:96px;top:222px;font-size:86px;font-weight:800;letter-spacing:-3px;line-height:1}
p{position:absolute;left:98px;top:326px;font-size:30px;line-height:1.35;color:#3d5a5e;font-weight:500;width:640px}
.chips{position:absolute;left:96px;top:454px;display:flex;gap:12px}.chip{font-size:20px;padding:10px 20px}
.plat{position:absolute;left:96px;top:44px;display:flex;gap:8px}
.big{position:absolute;left:800px;top:64px;width:520px;padding:22px 24px;transform:rotate(-2.5deg)}
.big h4{font-size:15px;color:#6b8588;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;display:flex;justify-content:space-between}
.r{display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid #eaf3f3}.r:last-child{border:0}
.av{width:38px;height:38px;border-radius:50%}.nm{font-weight:700;font-size:18px}.em{font-size:15px;color:#6b8588}.fl{margin-left:auto;font-weight:800;font-size:17px;color:#0b6b66}
.exp{position:absolute;left:880px;top:438px;display:flex;gap:12px;transform:rotate(1.5deg)}
.btn{background:linear-gradient(135deg,#047857,#0d9488 45%,#22b8e8);color:#fff;font-weight:800;font-size:19px;padding:14px 26px;border-radius:16px;box-shadow:0 10px 22px rgba(13,148,136,.35)}
.btn.w{background:#fff;color:#0b6b66;box-shadow:0 8px 20px rgba(8,100,120,.15)}
.badge{position:absolute;left:1200px;top:18px;transform:rotate(6deg);padding:12px 18px;font-weight:700;font-size:17px;border-radius:18px;display:flex;align-items:center;gap:8px}
</style>
<div class="plat"><span class="chip" style="font-size:15px;padding:7px 14px"><i class="dot" style="background:#1877f2"></i>Facebook</span><span class="chip" style="font-size:15px;padding:7px 14px"><i class="dot" style="background:#e1306c"></i>Instagram</span><span class="chip" style="font-size:15px;padding:7px 14px"><i class="dot" style="background:#111"></i>TikTok</span></div>
${tile('')}<div class="free">FREE</div><h1 class="g">Aurora Extract</h1>
<p>Collect public data from the pages you can already see. Export in one click.</p>
<div class="chips"><span class="chip">CSV</span><span class="chip">Excel</span><span class="chip">JSON</span><span class="chip">Photos &amp; videos ZIP</span></div>
<div class="card big"><h4><span>Results</span><span>4 of 200</span></h4>${rows.map(([c, n, e, f]) => `<div class="r"><div class="av" style="background:${c}"></div><div><div class="nm">${n}</div><div class="em">${e}</div></div><div class="fl">${f}</div></div>`).join('')}</div>
<div class="exp"><span class="btn">Export CSV</span><span class="btn w">Excel</span><span class="btn w">JSON</span></div>
<div class="card badge"><i class="dot" style="background:#10b981"></i>Done · 200 rows</div>
<div class="abs" style="left:740px;top:44px">${spark(40, '#22b8e8')}</div><div class="abs" style="left:1330px;top:470px">${spark(48, '#0d9488')}</div><div class="abs" style="left:1290px;top:520px">${spark(22, '#22b8e8')}</div><div class="abs" style="left:760px;top:490px">${spark(26, '#0d9488')}</div>`;

(async () => {
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  for (const [name, html, w, h] of [['promo-small-440x280', SMALL, 440, 280], ['promo-marquee-1400x560', MARQ, 1400, 560]]) {
    const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await pg.setContent('<!doctype html><meta charset=utf-8>' + html); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(OUT, name + '.png') }); await pg.close();
  }
  await b.close();
  require('node:child_process').execFileSync('python3', ['-I', '-c', `import glob;from PIL import Image\nfor f in glob.glob(r'${OUT}/promo-*.png'):\n  Image.open(f).convert('RGB').save(f,optimize=True)`]);
  console.log(fs.readdirSync(OUT).filter((f) => f.startsWith('promo')).join('\n'));
})();
