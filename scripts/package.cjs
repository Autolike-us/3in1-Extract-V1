// Builds dist/aurora-extract-<version>.zip containing only what the extension needs (store-ready).
const fs = require('node:fs'), path = require('node:path');
const { makeZip } = require('../core/zip.js');
const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const include = ['manifest.json', 'report.js', 'background.js', 'dashboard.html', 'dashboard.js', 'popup.html', 'popup.js', 'style.css', 'catalog.js'];
const walk = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => !f.startsWith('.')).map((f) => d + '/' + f);
const files = [...include, ...walk('core'), ...walk('content'), ...walk('icons')];
const zip = makeZip(files.map((f) => ({ name: f, data: fs.readFileSync(path.join(ROOT, f)) })));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', `aurora-extract-${manifest.version}.zip`);
fs.writeFileSync(out, zip);
console.log('wrote', out, (zip.length / 1024).toFixed(0) + ' KB,', files.length, 'files');
