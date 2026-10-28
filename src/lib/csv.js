// Small CSV parser that handles quoted fields, escaped quotes and line breaks inside quotes.
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = [];
    } else f += c;
  }
  row.push(f); if (row.some(x => x !== '')) rows.push(row);
  const head = rows.shift() || [];
  return { head, rows: rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) };
}
export const toCSV = (rows, cols) => {
  const esc = v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
};
