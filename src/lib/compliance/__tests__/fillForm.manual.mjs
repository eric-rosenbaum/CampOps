import { readFileSync, writeFileSync } from 'fs';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

// Mirrors src/lib/compliance/formFiller.ts exactly. Kept in sync by hand for this harness so
// the test can run in plain node; the assertions below are about geometry, not about TS.
const INK = rgb(0.05, 0.15, 0.45);
const isCheckbox = f => /draw\s+`?X`?|checkbox/i.test(f.notes ?? '');
function fit(text, maxWidth, size, width) {
  if (!maxWidth || width(text, size) <= maxWidth) return { text, size };
  let s = size;
  while (s > 6 && width(text, s) > maxWidth) s -= 0.5;
  if (width(text, s) <= maxWidth) return { text, size: s };
  let t = text;
  while (t.length > 1 && width(t + '…', s) > maxWidth) t = t.slice(0, -1);
  return { text: t + '…', size: s };
}
async function fillForm(bytes, map, values) {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const rotated = (map.page_rotation ?? 0) === 90;
  const width = (t, s) => font.widthOfTextAtSize(t, s);
  for (const f of map.fields) {
    if (f.disabled) continue;
    const raw = values[f.key];
    if (raw === undefined || raw === null || raw === '' || raw === false) continue;
    const page = pages[f.page]; if (!page) continue;
    const cb = isCheckbox(f);
    const text = cb ? 'X' : String(raw);
    const size = f.font_size ?? 9;
    const fitted = fit(text, f.max_width, size, width);
    let x = f.x;
    if (f.align === 'center' && f.max_width) x = f.x + (f.max_width - width(fitted.text, fitted.size)) / 2;
    else if (cb) x = f.x - width('X', fitted.size) / 2;
    const { height: pageH, width: pageW } = page.getSize();
    if (rotated) page.drawText(fitted.text, { x: f.y, y: pageW - x, size: fitted.size, font, color: INK, rotate: degrees(90) });
    else page.drawText(fitted.text, { x, y: pageH - f.y, size: fitted.size, font, color: INK });
  }
  return pdf.save();
}

const map = JSON.parse(readFileSync('src/lib/compliance/forms/ny/doh-2040.map.json', 'utf8'));
const blank = readFileSync('public/forms/ny/doh-2040.pdf');

// Realistic values: the header, plus Yes + a page ref for every component row.
const values = { camp_name: 'Pine Ridge Camp', county: 'Westchester',
  address: '142 Pine Ridge Rd, Katonah, NY 10536',
  date_month: '04', date_day: '18', date_year: '27' };
let rows = 0;
for (const f of map.fields) {
  if (f.disabled) continue;
  if (f.key.endsWith('_yes') && !f.key.startsWith('lhd')) { values[f.key] = true; rows++; }
  if (f.key.endsWith('_page')) values[f.key] = String(3 + (rows % 40));
}
const out = await fillForm(blank.buffer.slice(blank.byteOffset, blank.byteOffset + blank.byteLength), map, values);
writeFileSync('/tmp/build/pdflib-doh2040.pdf', out);
console.log('filled', map.form_code, 'fields in map:', map.fields.length, '| values set:', Object.keys(values).length);
