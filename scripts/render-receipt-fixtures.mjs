#!/usr/bin/env node
/**
 * Renders the Receipts AI fixtures: twelve documents with FICTIONAL vendors, drawn in HTML and
 * photographed by Playwright with the damage real receipts arrive with (fading, rotation, blur,
 * creases, a coffee stain). Expected values live beside them in expected.json, and every
 * receipt's numbers add up exactly, so a wrong read is the reader's fault and not the fixture's.
 *
 *   node scripts/render-receipt-fixtures.mjs
 *   node scripts/render-receipt-fixtures.mjs --demo
 *
 * --demo renders a photo for EVERY receipt the demo seed creates (scripts/demo-receipts.mjs, the
 * list the seed migration is generated from) into public/demo/receipts/demo-NN.jpg: the vendor, the
 * items, the taxes, the total and the card number printed on the slip all match the seeded row.
 * A finance reviewer opened "ready" demo receipts and found no photo behind them, and the six
 * photos there were printed a card and amounts some rows did not have.
 *
 * The seed dates receipts in LAST month, whichever month that is, and a static photo cannot know
 * it. The photos print August 2026 (September for the one bought "this month"), and
 * public/demo/receipts/manifest.json records where each printed date is, in what format, at what
 * angle, so src/lib/demoReceiptPhotos.ts can redraw the date to match the row before uploading.
 *
 * The test fixtures are left as they are: expected.json and the AI evaluation read them.
 */
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const DEMO = process.argv.includes('--demo');
import { DEMO_CARDS, DEMO_RECEIPTS, demoReceiptMoney, demoPhotoFile } from './demo-receipts.mjs';
/** The month the demo photos print. The uploader redraws the date for any other. */
const DEMO_LAST_MONTH = [2026, 8];
const OUT = path.resolve(DEMO ? 'public/demo/receipts' : 'test-fixtures/receipts');
fs.mkdirSync(OUT, { recursive: true });

const money = (n) => n.toFixed(2);
const frMoney = (n) => n.toFixed(2).replace('.', ',') + ' $';

function thermal({ name, lines, address, meta = [], items, totals, footer = [], fr = false, width = 320, extra = '' }) {
  const m = fr ? frMoney : money;
  return `
  <div class="receipt" style="width:${width}px">${extra}
    <div class="c b big">${name}</div>
    ${address.map((a) => `<div class="c">${a}</div>`).join('')}
    ${lines ? `<div class="c">${lines}</div>` : ''}
    <div class="rule"></div>
    ${meta.map((x) => `<div class="row"><span>${x[0]}</span><span>${x[1] ?? ''}</span></div>`).join('')}
    <div class="rule"></div>
    ${items.map((i) => `<div class="row"><span>${i[0]}</span><span>${m(i[1])}</span></div>${i[2] ? `<div class="sub">${i[2]}</div>` : ''}`).join('')}
    <div class="rule"></div>
    ${totals.map((t) => `<div class="row ${t[2] ?? ''}"><span>${t[0]}</span><span>${typeof t[1] === 'number' ? m(t[1]) : t[1]}</span></div>`).join('')}
    <div class="rule"></div>
    ${footer.map((f) => `<div class="c">${f}</div>`).join('')}
  </div>`;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #444; }
  .scene { display: inline-block; padding: 60px; }
  .receipt { background: #fbfaf5; color: #1a1a1a; font: 15px/1.35 "Courier New", Courier, monospace; padding: 22px 20px 30px; }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .big { font-size: 19px; letter-spacing: 1px; margin-bottom: 4px; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .row.b span { font-weight: bold; }
  .row.huge span { font-size: 18px; font-weight: bold; }
  .sub { font-size: 12px; padding-left: 10px; color: #444; }
  .rule { border-top: 1px dashed #555; margin: 8px 0; }
`;

/** Each fixture: file, expected values, and how to draw it. */
const FIXTURES = [
  {
    file: '01-thermal-faded.jpg',
    note: 'Thermal paper faded to low contrast',
    expected: { readable: true, vendor: 'Pinegrove General Store', date: '2026-08-14', subtotal: 30.47, taxes: { HST: 3.96 }, tip: null, total: 34.43, currency: 'CAD' },
    css: `.scene { background: #d8d4c8; } .receipt { color: #b3afa5; background: #f4f1e8; filter: contrast(0.8) blur(0.35px); }
          .receipt { background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 9px); }`,
    html: thermal({
      name: 'PINEGROVE GENERAL STORE', address: ['41 Muskoka Rd N', 'Huntsville ON P1H 1A2', 'Tel 705-555-0142'],
      meta: [['2026-08-14', '15:42'], ['Clerk: 03', 'Reg: 2']],
      items: [['AA BATTERIES 12PK', 14.99], ['DUCT TAPE 48MM', 8.49], ['ZIP TIES 100CT', 6.99]],
      totals: [['SUBTOTAL', 30.47], ['HST 13%', 3.96], ['TOTAL', 34.43, 'b'], ['VISA ****4821', 34.43]],
      footer: ['HST# 81234 5678 RT0001', 'THANK YOU - COME AGAIN'],
    }),
  },
  {
    file: '02-on-hst.jpg',
    note: 'Ontario HST 13%, a clean photo on a desk',
    expected: { readable: true, vendor: 'Northwind Hardware', date: '2026-08-03', subtotal: 75.0, taxes: { HST: 9.75 }, tip: null, total: 84.75, currency: 'CAD' },
    css: `.scene { background: linear-gradient(135deg, #7b5a3c, #5e4330); } .receipt { transform: rotate(-2deg); box-shadow: 8px 12px 24px rgba(0,0,0,.45); }`,
    html: thermal({
      name: 'NORTHWIND HARDWARE', address: ['Store #214', '880 Queen St E, Toronto ON', 'M4M 1J3'],
      meta: [['Date: 08/03/2026', 'Time: 10:17'], ['Trans: 214-0098812', '']],
      items: [['DOCK HINGE GALV 2 @ 18.50', 37.0], ['DECK SCREWS #8 2.5IN', 12.49], ['EXT WOOD STAIN 946ML', 25.51]],
      totals: [['SUBTOTAL', 75.0], ['HST 13.00%', 9.75], ['TOTAL', 84.75, 'huge'], ['VISA TEND ************4821', 84.75]],
      footer: ['GST/HST REG 70011 2233 RT0001', 'Returns within 30 days with receipt'],
    }),
  },
  {
    file: '03-bc-gst-pst.jpg',
    note: 'British Columbia GST 5% + PST 7%',
    expected: { readable: true, vendor: 'Cedar Coast Outfitters', date: '2026-07-22', subtotal: 153.99, taxes: { GST: 7.7, PST: 10.78 }, tip: null, total: 172.47, currency: 'CAD' },
    css: `.scene { background: radial-gradient(circle at 30% 30%, #a9b7c0, #6d7c86); } .receipt { transform: rotate(1.5deg); box-shadow: 4px 10px 18px rgba(0,0,0,.4); }`,
    html: thermal({
      name: 'CEDAR COAST OUTFITTERS', address: ['38020 Cleveland Ave', 'Squamish, BC V8B 0A1'],
      meta: [['22-Jul-2026', '11:05 AM'], ['Receipt 55120', '']],
      items: [['PFD ADULT UNIVERSAL', 89.99], ['PADDLE 240CM ALLOY', 64.0]],
      totals: [['Subtotal', 153.99], ['GST 5%', 7.7], ['PST 7%', 10.78], ['TOTAL', 172.47, 'huge'], ['Mastercard ...7390', 172.47]],
      footer: ['GST 12345 6789 RT0001', 'PST-1234-5678'],
    }),
  },
  {
    file: '04-qc-gst-qst.jpg',
    note: 'Quebec, in French: TPS 5% + TVQ 9,975%, decimal commas',
    expected: { readable: true, vendor: 'Épicerie Lac-Bleu', date: '2026-07-09', subtotal: 39.47, taxes: { GST: 1.97, QST: 3.94 }, tip: null, total: 45.38, currency: 'CAD' },
    css: `.scene { background: #cfc7b3; } .receipt { transform: rotate(-0.8deg); box-shadow: 3px 8px 14px rgba(0,0,0,.35); }`,
    html: thermal({
      fr: true,
      name: 'ÉPICERIE LAC-BLEU', address: ['1204 rue de Saint-Jovite', 'Mont-Tremblant (QC) J8E 3J9'],
      meta: [['Date : 2026/07/09', '17:31'], ['Caisse 1', 'Facture 88213']],
      items: [['CHARBON DE BOIS 8KG', 24.99], ['ALLUME-FEU 24', 7.49], ['GLACE 10 KG', 6.99]],
      totals: [['SOUS-TOTAL', 39.47], ['TPS 5 %', 1.97], ['TVQ 9,975 %', 3.94], ['TOTAL', 45.38, 'huge'], ['VISA', 45.38]],
      footer: ['TPS 123456789 RT0001', 'TVQ 1234567890 TQ0001', 'MERCI ET À BIENTÔT'],
    }),
  },
  {
    file: '05-ab-gst.jpg',
    note: 'Alberta, GST 5% only',
    expected: { readable: true, vendor: 'Foothills Farm & Feed', date: '2026-08-19', subtotal: 50.5, taxes: { GST: 2.53 }, tip: null, total: 53.03, currency: 'CAD' },
    css: `.scene { background: #8f9a7b; } .receipt { transform: rotate(2.5deg); box-shadow: 6px 10px 20px rgba(0,0,0,.4); }`,
    html: thermal({
      name: 'FOOTHILLS FARM & FEED', address: ['3 Railway St W', 'Cochrane AB T4C 2A5'],
      meta: [['Aug 19 2026', '8:52'], ['Acct: CASH SALE', '']],
      items: [['HAY BALE SQUARE 3 @ 12.00', 36.0], ['SALT BLOCK 20KG', 14.5]],
      totals: [['Subtotal', 50.5], ['GST 5%', 2.53], ['Total', 53.03, 'huge'], ['Visa ****4821', 53.03]],
      footer: ['GST# 88776 5544 RT0001'],
    }),
  },
  {
    file: '06-restaurant-tip.jpg',
    note: 'Restaurant slip with a handwritten tip and total',
    expected: { readable: true, vendor: "The Loon's Nest Grill", date: '2026-08-08', subtotal: 142.0, taxes: { HST: 18.46 }, tip: 25.0, total: 185.46, currency: 'CAD' },
    css: `.scene { background: #3b2f2a; } .receipt { transform: rotate(-1.2deg); box-shadow: 6px 12px 22px rgba(0,0,0,.6); }
          .hand { font-family: "Bradley Hand", "Segoe Script", "Comic Sans MS", cursive; font-size: 24px; color: #1f3b8a; }`,
    html: `
    <div class="receipt" style="width:340px">
      <div class="c b big">THE LOON'S NEST GRILL</div>
      <div class="c">12 Bay St, Parry Sound ON</div>
      <div class="rule"></div>
      <div class="row"><span>08/08/2026 19:48</span><span>Table 14</span></div>
      <div class="row"><span>Server: Jess</span><span>Guests: 9</span></div>
      <div class="rule"></div>
      <div class="row"><span>Food</span><span>118.00</span></div>
      <div class="row"><span>Non-alc beverages</span><span>24.00</span></div>
      <div class="rule"></div>
      <div class="row"><span>Subtotal</span><span>142.00</span></div>
      <div class="row"><span>HST 13%</span><span>18.46</span></div>
      <div class="row b"><span>Amount</span><span>160.46</span></div>
      <div class="rule"></div>
      <div class="row" style="align-items:flex-end"><span>Tip:</span><span class="hand">25.00</span></div>
      <div class="row" style="align-items:flex-end"><span>Total:</span><span class="hand">185.46</span></div>
      <div class="rule"></div>
      <div class="c">VISA ************4821</div>
      <div class="c">APPROVED 008812</div>
      <div class="c hand" style="margin-top:8px">T. Admin</div>
      <div class="c">CUSTOMER COPY</div>
    </div>`,
  },
  {
    file: '07-invoice-multipage.pdf',
    pdf: true,
    note: 'Two-page supplier invoice, NB HST 15%, totals on page 2',
    expected: { readable: true, vendor: 'Maritime Marine Supply', date: '2026-07-15', subtotal: 1248.0, taxes: { HST: 187.2 }, tip: null, total: 1435.2, currency: 'CAD' },
  },
  {
    file: '08-rotated.jpg',
    note: 'Photographed sideways (rotated 90°), Saskatchewan GST + PST',
    rotate: 90,
    expected: { readable: true, vendor: 'Prairie Sky Fuel & Snacks', date: '2026-08-27', subtotal: 48.97, taxes: { GST: 2.45, PST: 2.94 }, tip: null, total: 54.36, currency: 'CAD' },
    css: `.scene { background: #b9a88f; } .receipt { transform: rotate(3deg); box-shadow: 5px 9px 16px rgba(0,0,0,.4); }`,
    html: thermal({
      name: 'PRAIRIE SKY FUEL & SNACKS', address: ['1500 Central Ave N', 'Swift Current SK S9H 0H4'],
      meta: [['2026-08-27 14:09', ''], ['Pump: --', 'Inside sale']],
      items: [['BAGGED ICE 2 @ 4.49', 8.98], ['PROPANE TANK EXCH', 27.99], ['FIREWOOD BUNDLE', 12.0]],
      totals: [['SUBTOTAL', 48.97], ['GST 5%', 2.45], ['PST 6%', 2.94], ['TOTAL', 54.36, 'huge'], ['VISA 4821', 54.36]],
      footer: ['GST 76543 2109 RT0001'],
    }),
  },
  {
    file: '09-crumpled.jpg',
    note: 'Crumpled and flattened: creases, shading and a slight blur',
    expected: { readable: true, vendor: 'Harbourview Books & Gifts', date: '2026-09-02', subtotal: 76.47, taxes: { GST: 3.82, PST: 5.35 }, tip: null, total: 85.64, currency: 'CAD' },
    css: `.scene { background: #5f6b62; }
          .wrap { position: relative; transform: perspective(900px) rotateX(8deg) rotateZ(-3deg) skewY(1deg); filter: blur(0.5px); box-shadow: 10px 16px 26px rgba(0,0,0,.55); }
          .wrap::after { content: ""; position: absolute; inset: 0; pointer-events: none;
            background:
              linear-gradient(112deg, transparent 18%, rgba(0,0,0,.18) 19%, rgba(255,255,255,.35) 21%, transparent 24%),
              linear-gradient(64deg, transparent 47%, rgba(0,0,0,.2) 48%, rgba(255,255,255,.3) 50%, transparent 53%),
              linear-gradient(170deg, transparent 70%, rgba(0,0,0,.16) 71%, rgba(255,255,255,.28) 73%, transparent 76%),
              linear-gradient(20deg, transparent 30%, rgba(0,0,0,.14) 31%, transparent 34%),
              radial-gradient(circle at 80% 15%, rgba(0,0,0,.18), transparent 40%); }`,
    wrap: true,
    html: thermal({
      name: 'HARBOURVIEW BOOKS & GIFTS', address: ['77 Front St', 'Nanaimo BC V9R 5H9'],
      meta: [['09/02/2026', '13:26'], ['Sep 2, 2026', '']],
      items: [['BOARD GAME 2 @ 34.99', 69.98], ['PLAYING CARDS', 6.49]],
      totals: [['SUBTOTAL', 76.47], ['GST 5%', 3.82], ['PST 7%', 5.35], ['TOTAL', 85.64, 'huge'], ['MC ****7390', 85.64]],
      footer: ['Thank you for shopping local'],
    }),
  },
  {
    file: '10-usd.jpg',
    note: 'A US store charged in US dollars, with state sales tax',
    expected: { readable: true, vendor: 'Lakeshore Mercantile', date: '2026-08-01', subtotal: 64.95, taxes: { other: 5.2 }, tip: null, total: 70.15, currency: 'USD' },
    css: `.scene { background: #9aa3ad; } .receipt { transform: rotate(-2deg); box-shadow: 5px 10px 18px rgba(0,0,0,.4); }`,
    html: thermal({
      name: 'LAKESHORE MERCANTILE', address: ['210 Margaret St', 'Plattsburgh, NY 12901', 'USA'],
      meta: [['08/01/2026', '4:15 PM'], ['All prices in USD', '']],
      items: [['CAMP LANTERN LED', 45.0], ['WATER FILTER CART', 19.95]],
      totals: [['Subtotal', 64.95], ['Sales Tax 8.00%', 5.2], ['TOTAL USD', 'US$70.15', 'huge'], ['VISA XXXX4821', 'US$70.15']],
      footer: ['Have a great trip!'],
    }),
  },
  {
    file: '11-not-a-receipt.jpg',
    note: 'A photo of the lake. Must come back unreadable.',
    expected: { readable: false },
    css: `.scene { padding: 0; }`,
    html: `
    <div style="width:900px;height:600px;position:relative;overflow:hidden;background:linear-gradient(#8fc1e3 0%, #cfe6f2 45%, #3d6e8c 46%, #214a63 100%)">
      <div style="position:absolute;left:-60px;top:170px;width:560px;height:130px;background:#2f4f3a;border-radius:50% 60% 0 0"></div>
      <div style="position:absolute;left:380px;top:190px;width:700px;height:110px;background:#3b5e45;border-radius:60% 50% 0 0"></div>
      ${Array.from({ length: 14 }, (_, i) => `<div style="position:absolute;left:${30 + i * 62}px;top:${140 + (i % 3) * 18}px;width:0;height:0;border-left:22px solid transparent;border-right:22px solid transparent;border-bottom:${110 + (i % 4) * 14}px solid #1e3a2a"></div>`).join('')}
      <div style="position:absolute;left:520px;top:80px;width:70px;height:70px;border-radius:50%;background:#fff6c9;box-shadow:0 0 60px #fff3a0"></div>
      <div style="position:absolute;left:300px;top:420px;width:230px;height:26px;background:#b3462f;border-radius:0 0 120px 120px"></div>
      <div style="position:absolute;left:390px;top:396px;width:6px;height:40px;background:#6b4a2b;transform:rotate(30deg)"></div>
      ${Array.from({ length: 9 }, (_, i) => `<div style="position:absolute;left:${80 + i * 95}px;top:${360 + (i % 3) * 60}px;width:70px;height:2px;background:rgba(255,255,255,.35)"></div>`).join('')}
    </div>`,
  },
  {
    file: '12-stained-date.jpg',
    note: 'A coffee stain hides the date. The date must come back empty or low confidence.',
    expected: { readable: true, vendor: 'Trillium Craft Supply', date: '2026-08-14', dateHidden: true, subtotal: 77.46, taxes: { HST: 10.07 }, tip: null, total: 87.53, currency: 'CAD' },
    css: `.scene { background: linear-gradient(160deg, #caa57a, #9c7a55); } .receipt { position: relative; transform: rotate(-1deg); box-shadow: 6px 12px 20px rgba(0,0,0,.4); }
          .stain { position: absolute; left: -6px; top: 100px; width: 336px; height: 50px; border-radius: 40% 60% 45% 55% / 55% 45% 60% 40%;
                   background: radial-gradient(ellipse at 45% 50%, #4a2c14 0%, #5a3719 60%, #6e4524 85%, rgba(110,69,36,.9) 100%);
                   box-shadow: 0 0 0 3px rgba(120,80,40,.35), 14px 4px 0 -6px rgba(90,55,25,.8); }`,
    html: thermal({
      name: 'TRILLIUM CRAFT SUPPLY', address: ['220 Manitoba St', 'Bracebridge ON P1L 1S2'],
      meta: [['Date 14/08/26', 'Time 09:58'], ['Sale #40771', '']],
      items: [['ACRYLIC PAINT SET 24', 32.99], ['BRUSH ASSORTMENT', 14.5], ['CANVAS PAD 3 @ 9.99', 29.97]],
      totals: [['SUBTOTAL', 77.46], ['HST 13%', 10.07], ['TOTAL', 87.53, 'huge'], ['VISA ****4821', 87.53]],
      footer: ['HST 80011 4455 RT0001', 'Thanks for crafting with us!'],
      extra: '<div class="stain"></div>',
    }),
  },
];

function invoiceHtml() {
  const items = [
    ['DK-2210', 'Dock bumper, vinyl 24in', 8, 21.5], ['RP-0038', 'Anchor rope 3/8in x 100ft', 4, 42.0],
    ['CL-1102', 'Cleat, stainless 6in', 12, 11.25], ['LJ-5000', 'Life ring 24in with rope', 2, 89.0],
    ['PD-7200', 'Canoe paddle, laminated 60in', 10, 38.4], ['BL-0901', 'Bailer and sponge kit', 10, 6.9],
    ['WH-3300', 'Whistle, safety, orange', 20, 2.15], ['FL-4400', 'Waterproof flashlight', 6, 16.5],
  ];
  const sum = items.reduce((s, i) => s + i[2] * i[3], 0);
  if (Math.abs(sum - 1248) > 0.001) throw new Error(`invoice lines sum to ${sum}`);
  const rows = items.map((i) => `<tr><td>${i[0]}</td><td>${i[1]}</td><td class="n">${i[2]}</td><td class="n">${money(i[3])}</td><td class="n">${money(i[2] * i[3])}</td></tr>`).join('');
  return `<!doctype html><html><head><style>
    body { font: 12px/1.5 Georgia, serif; color: #222; margin: 0; }
    .page { width: 7.5in; height: 9.9in; padding: 0.3in; position: relative; page-break-after: always; }
    h1 { font: bold 22px Arial, sans-serif; color: #12436b; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #12436b; color: #fff; text-align: left; padding: 6px; font: bold 11px Arial; }
    td { padding: 7px 6px; border-bottom: 1px solid #ddd; }
    .n { text-align: right; }
    .foot { position: absolute; bottom: 0.3in; left: 0.3in; right: 0.3in; font-size: 10px; color: #777; display: flex; justify-content: space-between; }
    .tot td { border: none; font: 13px Arial; }
    .tot .grand td { font-weight: bold; font-size: 16px; border-top: 2px solid #12436b; }
  </style></head><body>
  <div class="page">
    <div style="display:flex;justify-content:space-between">
      <div><h1>MARITIME MARINE SUPPLY LTD.</h1><div>455 Main Street, Moncton NB E1C 1B9</div><div>accounts@maritime-marine.example</div></div>
      <div style="text-align:right"><div style="font:bold 20px Arial">INVOICE</div><div>Invoice # INV-20417</div><div>Invoice date: July 15, 2026</div><div>Terms: Paid by card</div></div>
    </div>
    <div style="margin-top:24px"><b>Bill to:</b><br>Prospect QA Camp<br>Attn: Waterfront<br>RR 2, Lake of Bays ON</div>
    <table><thead><tr><th>Item</th><th>Description</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot"><span>HST Registration 11223 3445 RT0001</span><span>Page 1 of 2 — continued</span></div>
  </div>
  <div class="page">
    <div style="display:flex;justify-content:space-between"><h1>MARITIME MARINE SUPPLY LTD.</h1><div>Invoice # INV-20417 (continued)</div></div>
    <table class="tot" style="width:50%;margin-left:50%;margin-top:40px">
      <tr><td>Subtotal</td><td class="n">$1,248.00</td></tr>
      <tr><td>Shipping</td><td class="n">$0.00</td></tr>
      <tr><td>HST 15%</td><td class="n">$187.20</td></tr>
      <tr class="grand"><td>Total</td><td class="n">$1,435.20</td></tr>
      <tr><td>Paid — Visa ending 4821</td><td class="n">($1,435.20)</td></tr>
      <tr><td><b>Balance due</b></td><td class="n"><b>$0.00</b></td></tr>
    </table>
    <p style="margin-top:40px">Thank you for your order. All prices in Canadian dollars.</p>
    <div class="foot"><span>HST Registration 11223 3445 RT0001</span><span>Page 2 of 2</span></div>
  </div></body></html>`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (x) => String(x).padStart(2, '0');
/** A calendar date as a till prints it. Mirrored by formatPrintedDate() in src/lib/demoReceiptPhotos.ts. */
function printedDate(y, m, d, fmt) {
  if (fmt === 'YYYY-MM-DD') return `${y}-${pad(m)}-${pad(d)}`;
  if (fmt === 'MM/DD/YYYY') return `${pad(m)}/${pad(d)}/${y}`;
  if (fmt === 'DD/MM/YYYY') return `${pad(d)}/${pad(m)}/${y}`;
  if (fmt === 'DD/MM/YY') return `${pad(d)}/${pad(m)}/${String(y).slice(2)}`;
  if (fmt === 'Mon D YYYY') return `${MONTHS[m - 1]} ${d} ${y}`;
  throw new Error(`unknown date format ${fmt}`);
}

const STYLES = {
  desk: { angle: -1.5, css: `.scene { background: linear-gradient(135deg, #6f7f8c, #4b5963); } .receipt { box-shadow: 6px 12px 22px rgba(0,0,0,.45); }` },
  wood: { angle: -2, css: `.scene { background: linear-gradient(135deg, #7b5a3c, #5e4330); } .receipt { box-shadow: 8px 12px 24px rgba(0,0,0,.45); }` },
  faded: { angle: 0.8, css: `.scene { background: #d8d4c8; } .receipt { color: #8f8b82; background: #f4f1e8; filter: contrast(0.85) blur(0.3px);
            background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 9px); }` },
  grey: { angle: 1.5, css: `.scene { background: radial-gradient(circle at 30% 30%, #a9b7c0, #6d7c86); } .receipt { box-shadow: 4px 10px 18px rgba(0,0,0,.4); }` },
  kraft: { angle: -1, css: `.scene { background: linear-gradient(160deg, #caa57a, #9c7a55); } .receipt { box-shadow: 6px 12px 20px rgba(0,0,0,.4); }` },
  green: { angle: 2.2, css: `.scene { background: #8f9a7b; } .receipt { box-shadow: 6px 10px 20px rgba(0,0,0,.4); }` },
  restaurant: { angle: -1.2, css: `.scene { background: #3b2f2a; } .receipt { box-shadow: 6px 12px 22px rgba(0,0,0,.6); }
            .hand { font-family: "Bradley Hand", "Segoe Script", "Comic Sans MS", cursive; font-size: 24px; color: #1f3b8a; }` },
  stained: { angle: -1, css: `.scene { background: linear-gradient(160deg, #caa57a, #9c7a55); } .receipt { position: relative; box-shadow: 6px 12px 20px rgba(0,0,0,.4); }
            .stain { position: absolute; left: -6px; top: 100px; width: 336px; height: 50px; border-radius: 40% 60% 45% 55% / 55% 45% 60% 40%;
                     background: radial-gradient(ellipse at 45% 50%, #4a2c14 0%, #5a3719 60%, #6e4524 85%, rgba(110,69,36,.9) 100%);
                     box-shadow: 0 0 0 3px rgba(120,80,40,.35), 14px 4px 0 -6px rgba(90,55,25,.8); }` },
  crumpled: { angle: -3, css: `.scene { background: #5f6b62; }
          .wrap { position: relative; transform: perspective(900px) rotateX(8deg) skewY(1deg); filter: blur(0.5px); box-shadow: 10px 16px 26px rgba(0,0,0,.55); }
          .wrap::after { content: ""; position: absolute; inset: 0; pointer-events: none;
            background:
              linear-gradient(112deg, transparent 18%, rgba(0,0,0,.18) 19%, rgba(255,255,255,.35) 21%, transparent 24%),
              linear-gradient(64deg, transparent 47%, rgba(0,0,0,.2) 48%, rgba(255,255,255,.3) 50%, transparent 53%),
              linear-gradient(170deg, transparent 70%, rgba(0,0,0,.16) 71%, rgba(255,255,255,.28) 73%, transparent 76%),
              radial-gradient(circle at 80% 15%, rgba(0,0,0,.18), transparent 40%); }`, wrap: true },
};

function demoHtml(r) {
  const m = demoReceiptMoney(r);
  const last4 = DEMO_CARDS[r.card];
  const [y0, m0] = DEMO_LAST_MONTH;
  const [y, mo] = r.nextMonthDay != null ? (m0 === 12 ? [y0 + 1, 1] : [y0, m0 + 1]) : [y0, m0];
  const day = r.nextMonthDay ?? r.day ?? r.hiddenDay;
  const date = printedDate(y, mo, day, r.dateFormat);
  const dt = `<span class="dt">${date}</span>`;
  const time = `${pad(8 + (r.k * 7) % 10)}:${pad((r.k * 23) % 60)}`;
  const taxRows = m.taxes.map((t) => [`${t.type} ${t.rate_pct}%`, t.amount]);
  if (r.style === 'restaurant') {
    return `
    <div class="receipt" style="width:340px">
      <div class="c b big">${r.vendor.toUpperCase()}</div>
      ${r.address.map((a) => `<div class="c">${a}</div>`).join('')}
      <div class="rule"></div>
      <div class="row"><span>${dt} 19:48</span><span>Table ${r.k + 5}</span></div>
      <div class="row"><span>Server: Jess</span><span>Guests: 9</span></div>
      <div class="rule"></div>
      ${r.items.map((i) => `<div class="row"><span>${i[0]}</span><span>${money(i[1])}</span></div>`).join('')}
      <div class="rule"></div>
      <div class="row"><span>Subtotal</span><span>${money(m.subtotal)}</span></div>
      ${taxRows.map((t) => `<div class="row"><span>${t[0]}</span><span>${money(t[1])}</span></div>`).join('')}
      <div class="row b"><span>Amount</span><span>${money(m.subtotal + m.taxes.reduce((s, t) => s + t.amount, 0))}</span></div>
      <div class="rule"></div>
      ${m.tip != null ? `<div class="row" style="align-items:flex-end"><span>Tip:</span><span class="hand">${money(m.tip)}</span></div>
      <div class="row" style="align-items:flex-end"><span>Total:</span><span class="hand">${money(m.total)}</span></div>` : `<div class="row b"><span>Total</span><span>${money(m.total)}</span></div>`}
      <div class="rule"></div>
      <div class="c">VISA ************${last4}</div>
      <div class="c">APPROVED 00${8800 + r.k}</div>
      <div class="c">CUSTOMER COPY</div>
    </div>`;
  }
  return thermal({
    name: r.vendor.toUpperCase(), address: r.address,
    meta: [[`Date ${dt}`, time], [`Sale #${40000 + r.k * 37}`, `Clerk ${pad(r.k % 7 + 1)}`]],
    items: r.items.map((i) => [i[0] + (i[2] ? ' Z' : ''), i[1]]),
    totals: [['SUBTOTAL', m.subtotal], ...taxRows, ...(m.taxes.length ? [] : [['TAX', 0]]), ['TOTAL', m.total, 'huge'], [`VISA ****${last4}`, m.total]],
    footer: [...(r.items.some((i) => i[2]) ? ['Z = ZERO-RATED GROCERY'] : []), 'GST/HST REG 80011 4455 RT0001', 'THANK YOU'],
    extra: r.style === 'stained' ? '<div class="stain"></div>' : '',
  });
}

async function renderDemo(page) {
  const manifest = {};
  for (const r of DEMO_RECEIPTS) {
    if (r.copyOf) continue;
    const style = STYLES[r.style];
    const file = demoPhotoFile(r);
    const inner = `<div class="tilt" style="transform: rotate(${style.angle}deg); display:inline-block">${style.wrap ? `<div class="wrap">${demoHtml(r)}</div>` : demoHtml(r)}</div>`;
    await page.setContent(`<!doctype html><html><head><style>${BASE_CSS}${style.css}</style></head><body><div class="scene">${inner}</div></body></html>`);
    const scene = page.locator('.scene');
    const sb = await scene.boundingBox();
    const db = await page.locator('.dt').boundingBox();
    const font = await page.locator('.dt').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: parseFloat(cs.fontSize), weight: cs.fontWeight };
    });
    const png = await scene.screenshot();
    await page.setContent(`<!doctype html><html><body style="margin:0"><canvas id="c"></canvas><img id="i" style="display:none" src="data:image/png;base64,${png.toString('base64')}"></body></html>`);
    const dataUrl = await page.evaluate(async () => {
      const img = document.getElementById('i'); await img.decode();
      const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.82);
    });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    const [y0, m0] = DEMO_LAST_MONTH;
    const [y, mo] = r.nextMonthDay != null ? (m0 === 12 ? [y0 + 1, 1] : [y0, m0 + 1]) : [y0, m0];
    const dpr = 2;
    manifest[file] = {
      // null: the date cannot be read on this photo (the coffee stain), so it is never redrawn.
      printedDate: r.day == null && r.nextMonthDay == null ? null : `${y}-${pad(mo)}-${pad(r.nextMonthDay ?? r.day)}`,
      format: r.dateFormat,
      box: { x: Math.round((db.x - sb.x) * dpr), y: Math.round((db.y - sb.y) * dpr), w: Math.round(db.width * dpr), h: Math.round(db.height * dpr) },
      angle: style.angle, fontPx: Math.round(font.size * dpr), bold: Number(font.weight) >= 600,
      faded: r.style === 'faded', blur: r.style === 'faded' || r.style === 'crumpled',
    };
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return Object.keys(manifest).length;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
if (DEMO) {
  const n = await renderDemo(page);
  await browser.close();
  console.log(`rendered ${n} demo photos and manifest.json into ${OUT}`);
  process.exit(0);
}
const expected = {};
for (const fixture of FIXTURES) {
  const f = fixture;
  expected[f.file] = { ...f.expected, note: f.note };
  if (f.pdf) {
    await page.setContent(invoiceHtml());
    await page.pdf({ path: path.join(OUT, f.file), width: '8in', height: '10.5in', printBackground: true });
    continue;
  }
  const inner = f.wrap ? `<div class="wrap">${f.html}</div>` : f.html;
  await page.setContent(`<!doctype html><html><head><style>${BASE_CSS}${f.css ?? ''}</style></head><body><div class="scene">${inner}</div></body></html>`);
  const el = page.locator('.scene');
  const tmp = path.join(OUT, `.tmp-${f.file}.png`);
  await el.screenshot({ path: tmp });
  let buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  if (f.rotate) {
    // Rotate the finished photo, as a phone held sideways would have saved it.
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000"><img id="i" src="data:image/png;base64,${buf.toString('base64')}"></body></html>`);
    await page.locator('#i').evaluate((img) => img.decode());
    const size = await page.locator('#i').evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" width="${size.h}" height="${size.w}"></canvas><img id="i" style="display:none" src="data:image/png;base64,${buf.toString('base64')}"></body></html>`);
    const dataUrl = await page.evaluate(async () => {
      const img = document.getElementById('i'); await img.decode();
      const c = document.getElementById('c'); const ctx = c.getContext('2d');
      ctx.translate(c.width / 2, c.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      return c.toDataURL('image/jpeg', 0.82);
    });
    fs.writeFileSync(path.join(OUT, f.file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    continue;
  }
  // JPEG, as a phone camera would send it.
  await page.setContent(`<!doctype html><html><body style="margin:0"><canvas id="c"></canvas><img id="i" style="display:none" src="data:image/png;base64,${buf.toString('base64')}"></body></html>`);
  const dataUrl = await page.evaluate(async () => {
    const img = document.getElementById('i'); await img.decode();
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.82);
  });
  fs.writeFileSync(path.join(OUT, f.file), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
fs.writeFileSync(path.join(OUT, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
await browser.close();
console.log(`rendered ${Object.keys(expected).length} fixtures into ${OUT}`);
