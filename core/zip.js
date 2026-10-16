/* Aurora Extract — tiny dependency-free ZIP writer (store, no compression).
   Used for the media bundle and for .xlsx files. */
(function (root) {
  'use strict';
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    T[n] = c >>> 0;
  }
  function crc32(u8, crc = 0) {
    crc = ~crc >>> 0;
    for (let i = 0; i < u8.length; i++) crc = T[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return ~crc >>> 0;
  }
  const enc = new TextEncoder();
  const u16 = (v) => [v & 255, (v >>> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

  function dosTime(d) {
    const t = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return [t, dt];
  }

  /** files: [{name, data: Uint8Array|string}] -> Uint8Array */
  function makeZip(files, date = new Date()) {
    const [tm, dt] = dosTime(date);
    const parts = [];
    const central = [];
    let offset = 0;
    const used = new Set();
    for (const f of files) {
      let name = String(f.name).replace(/\\/g, '/').replace(/^\/+/, '');
      if (used.has(name)) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let i = 2;
        while (used.has(`${base} (${i})${ext}`)) i++;
        name = `${base} (${i})${ext}`;
      }
      used.add(name);
      const nameB = enc.encode(name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(tm), ...u16(dt),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0),
      ]);
      parts.push(local, nameB, data);
      central.push({ nameB, crc, size: data.length, offset });
      offset += local.length + nameB.length + data.length;
    }
    const cdStart = offset;
    for (const c of central) {
      const rec = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(tm), ...u16(dt),
        ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.nameB.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset),
      ]);
      parts.push(rec, c.nameB);
      offset += rec.length + c.nameB.length;
    }
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
      ...u32(offset - cdStart), ...u32(cdStart), ...u16(0),
    ]);
    parts.push(end);
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  const api = { makeZip, crc32 };
  root.AuroraZip = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
