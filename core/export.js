/* Aurora Extract — CSV / JSON / XLSX export from an array of flat row objects. */
(function (root) {
  'use strict';
  const Zip = root.AuroraZip || (typeof require !== 'undefined' ? require('./zip.js') : null);

  function cell(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.join('; ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function columns(rows, preferred) {
    const seen = new Set();
    const cols = [];
    for (const k of preferred || []) if (rows.some((r) => r[k] != null && r[k] !== '')) { seen.add(k); cols.push(k); }
    for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
    return cols;
  }
  /** Spreadsheet apps run formulas starting with = + - @ — neutralise them. */
  function safe(s) { return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)*$/.test(s) ? "'" + s : s; }

  function toCSV(rows, preferred) {
    const cols = columns(rows, preferred);
    const esc = (s) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const lines = [cols.map(esc).join(',')];
    for (const r of rows) lines.push(cols.map((c) => esc(safe(cell(r[c])))).join(','));
    return '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 (emoji, Arabic, …)
  }
  function toJSON(rows) { return JSON.stringify(rows, null, 2); }

  const xml = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  function colName(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }

  function toXLSX(rows, preferred, sheetName = 'Aurora Extract') {
    const cols = columns(rows, preferred);
    const data = [cols, ...rows.map((r) => cols.map((c) => r[c]))];
    const sheetRows = data.map((row, ri) => {
      const cells = row.map((v, ci) => {
        const ref = colName(ci) + (ri + 1);
        if (ri > 0 && typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
        const s = safe(cell(v)).slice(0, 32000);
        return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(s)}</t></is></c>`;
      });
      return `<row r="${ri + 1}">${cells.join('')}</row>`;
    });
    const widths = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(48, Math.max(12, c.length + 4))}" customWidth="1"/>`).join('');
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
      { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows.join('')}</sheetData></worksheet>` },
    ];
    return Zip.makeZip(files);
  }

  const api = { toCSV, toJSON, toXLSX, columns, colName };
  root.AuroraExport = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
