const assert = require('assert');
const zlib = require('zlib');
const { makeZip, crc32 } = require('../core/zip.js');
const E = require('../core/export.js');

// CRC32 known vector
assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926);

// zip round-trips through a real unzip implementation (python)
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zt-'));
fs.writeFileSync(path.join(dir, 'a.zip'), makeZip([{ name: 'hi.txt', data: 'héllo' }, { name: 'hi.txt', data: 'dup' }, { name: 'd/x.bin', data: new Uint8Array([1, 2, 3]) }]));
const out = execFileSync('python3', ['-I', '-c', `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(sorted(z.namelist()));print(z.read('hi.txt').decode())`, path.join(dir, 'a.zip')]).toString();
assert(out.includes("['d/x.bin', 'hi (2).txt', 'hi.txt']"), out);
assert(out.includes('héllo'));

// csv
const rows = [{ name: 'A, "B"', note: '=HYPERLINK("x")', n: 5, tags: ['a', 'b'] }, { name: 'ünï', extra: 1 }];
const csv = E.toCSV(rows, ['name']);
assert(csv.startsWith('﻿name,note,n,tags,extra'));
assert(csv.includes('"A, ""B"""'));
assert(csv.includes("'=HYPERLINK"));
assert(csv.includes('a; b'));

// xlsx opens in a real reader
fs.writeFileSync(path.join(dir, 'a.xlsx'), E.toXLSX(rows, ['name']));
const x = execFileSync('python3', ['-I', '-c', `import zipfile,sys,xml.dom.minidom as m;z=zipfile.ZipFile(sys.argv[1]);[m.parseString(z.read(n)) for n in z.namelist()];print(len(z.namelist()))`, path.join(dir, 'a.xlsx')]).toString();
assert.strictEqual(x.trim(), '6');
assert.strictEqual(E.colName(0), 'A'); assert.strictEqual(E.colName(26), 'AA');
console.log('core ok');
