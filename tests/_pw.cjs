// Shared Playwright launcher for offline tests (uses the pre-installed Chromium; never downloads).
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
exports.ROOT = ROOT;
exports.read = (n) => fs.readFileSync(path.join(ROOT, n), 'utf8');
exports.launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-crashpad-for-testing'] });
let passed = 0;
exports.check = (name, v) => { if (!v) { console.error('FAIL ' + name); process.exitCode = 1; throw new Error('FAIL ' + name); } passed++; console.log('PASS ' + name); };
exports.done = () => console.log(`\n${passed} checks passed`);
