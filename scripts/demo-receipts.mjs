/**
 * The demo camp's sample receipts: one list that both the seed (seed_demo_receipts_internal) and
 * the photos (render-receipt-fixtures.mjs --demo) are made from, so a photo never disagrees with
 * the row it is attached to. src/lib/__tests__/demoReceipts.test.ts holds the migration to it.
 *
 * Fictional vendors only. `day` is the day of LAST month (the seed's month); `nextMonthDay` is a
 * day of this month; `day: null` is a receipt whose date cannot be read. Money in dollars; every
 * receipt's items add up to its subtotal and subtotal + taxes + tip to its total.
 *
 * Tax is what a till would charge in Ontario (HST 13%) unless the vendor is elsewhere. Basic
 * groceries (milk, bread, butter, bananas) are zero-rated: no HST (CRA, GST/HST Memorandum 4.3,
 * Basic groceries). Candy and snacks sold as treats are not basic groceries and are taxed.
 */

export const DEMO_CARDS = { A: '4821', B: '7390', C: '1156' };

const hst = (sub) => [{ type: 'HST', rate_pct: 13, amount: Math.round(sub * 13) / 100 }];

export const DEMO_RECEIPTS = [
  // ── Card A · Visa ··4821 · Maya Torres (Waterfront). Last month's statement: every receipt
  //    matched but #6 (the same receipt snapped twice) and one fuel charge with no receipt.
  { k: 1, card: 'A', day: 2, vendor: 'Blue Heron Marine', address: ['1150 Muskoka Rd S', 'Gravenhurst ON P1P 1K6'], code: 'WATER', purpose: 'Paddle repair kit',
    items: [['PADDLE REPAIR KIT', 89.99], ['MARINE EPOXY 2PK', 54.10], ['FIBREGLASS CLOTH 1M', 43.95]], dateFormat: 'YYYY-MM-DD', style: 'desk' },
  { k: 2, card: 'A', day: 5, vendor: 'Northwind Hardware', address: ['Store #214', '880 Queen St E, Toronto ON'], code: 'MAINT', purpose: 'Dock cleats and deck screws',
    items: [['DOCK CLEAT GALV 4 @ 9.85', 39.40], ['DECK SCREWS #8 2.5IN', 14.49], ['LAG BOLTS 3/8 10PK', 14.51]], dateFormat: 'MM/DD/YYYY', style: 'wood' },
  { k: 3, card: 'A', day: 9, vendor: 'Pinegrove General Store', address: ['41 Muskoka Rd N', 'Huntsville ON P1H 1A2'], code: 'KIT', purpose: 'Milk, bread and bananas for the swim-test snack',
    items: [['MILK 2% 4L 2 @ 6.49', 12.98, 'Z'], ['BREAD WHITE 3 @ 3.49', 10.47, 'Z'], ['BANANAS 1.9KG', 3.99, 'Z']], zeroRated: true, dateFormat: 'YYYY-MM-DD', style: 'faded' },
  { k: 4, card: 'A', day: 12, vendor: 'Lakeview Pharmacy', address: ['22 Main St W', 'Huntsville ON P1H 2C8'], code: 'HEALTH', purpose: 'Sunscreen for swim staff',
    items: [['SUNSCREEN SPF50 3 @ 12.99', 38.97], ['LIP BALM SPF15', 3.68]], dateFormat: 'DD/MM/YYYY', style: 'grey' },
  { k: 5, card: 'A', day: 15, vendor: 'Blue Heron Marine', address: ['1150 Muskoka Rd S', 'Gravenhurst ON P1P 1K6'], code: 'WATER', purpose: 'Two throw bags and a whistle kit',
    items: [['THROW BAG 70FT 2 @ 119.95', 239.90], ['SAFETY WHISTLE KIT 12', 72.49]], dateFormat: 'YYYY-MM-DD', style: 'desk' },
  // The same paper snapped a second time: the same photo, a second row.
  { k: 6, card: 'A', copyOf: 5 },
  { k: 7, card: 'A', day: 19, vendor: 'Trillium Craft Supply', address: ['220 Manitoba St', 'Bracebridge ON P1L 1S2'], code: 'ARTS', purpose: 'Tie-dye kits for the waterfront banner',
    items: [['TIE-DYE KIT 24 2 @ 24.99', 49.98], ['RUBBER BANDS 500', 3.49], ['SQUEEZE BOTTLES 12', 10.25]], dateFormat: 'DD/MM/YY', style: 'kraft' },
  { k: 8, card: 'A', day: 23, vendor: 'Northwind Hardware', address: ['Store #214', '880 Queen St E, Toronto ON'], code: 'WATER', purpose: 'Rope for the swim lines',
    items: [['POLY ROPE 3/8 X 50FT', 18.99]], dateFormat: 'MM/DD/YYYY', style: 'wood' },
  { k: 9, card: 'A', day: 27, vendor: "The Loon's Nest Grill", address: ['12 Bay St, Parry Sound ON'], code: 'TRIP', purpose: 'Staff dinner on the canoe trip',
    items: [['Food', 118.00], ['Non-alc beverages', 24.00]], dateFormat: 'MM/DD/YYYY', style: 'restaurant' },

  // ── Card B · Visa ··7390 · Luis Ortega (Maintenance). Last month agrees to the cent.
  { k: 10, card: 'B', day: 3, vendor: 'Northwind Hardware', address: ['Store #214', '880 Queen St E, Toronto ON'], code: 'MAINT', purpose: 'Hinges and door closers',
    items: [['DOOR CLOSER 3 @ 59.99', 179.97], ['BUTT HINGE 4IN 6PK 2 @ 24.49', 48.98], ['WOOD SCREWS ASSORTED', 35.23]], dateFormat: 'MM/DD/YYYY', style: 'wood' },
  { k: 11, card: 'B', day: 7, vendor: 'Foothills Lumber Yard', address: ['3 Mill Rd', 'Bracebridge ON P1L 1W9'], code: 'MAINT', purpose: 'Dock decking',
    items: [['DECKING 5/4X6 16FT 20 @ 27.49', 549.80], ['DECK SCREWS 5LB', 62.60]], dateFormat: 'Mon D YYYY', style: 'grey' },
  { k: 12, card: 'B', day: 11, vendor: 'Northwind Hardware', address: ['Store #214', '880 Queen St E, Toronto ON'], code: 'MAINT', purpose: 'Paint rollers',
    items: [['PAINT ROLLER KIT 2 @ 17.99', 35.98], ['ROLLER COVERS 6PK', 22.22]], dateFormat: 'MM/DD/YYYY', style: 'wood' },
  { k: 13, card: 'B', day: 16, vendor: 'Cedar Valley Electric Supply', address: ['75 Ecclestone Dr', 'Bracebridge ON P1L 1R2'], code: 'MAINT', purpose: 'Breaker for the dining hall',
    items: [['BREAKER 2P 30A', 89.76], ['WIRE NUTS 100PK', 12.49], ['ELECTRICAL TAPE 4PK', 27.50]], dateFormat: 'YYYY-MM-DD', style: 'desk' },
  { k: 14, card: 'B', day: 21, vendor: 'Pinegrove General Store', address: ['41 Muskoka Rd N', 'Huntsville ON P1H 1A2'], code: 'KIT', purpose: 'Emergency milk run',
    items: [['MILK 2% 4L 2 @ 6.49', 12.98, 'Z'], ['BUTTER 454G', 9.12, 'Z']], zeroRated: true, dateFormat: 'YYYY-MM-DD', style: 'faded' },
  { k: 15, card: 'B', day: 26, vendor: 'Northwind Hardware', address: ['Store #214', '880 Queen St E, Toronto ON'], code: 'MAINT', purpose: 'Plumbing fittings',
    items: [['PEX FITTINGS 1/2 10PK', 34.99], ['SHUTOFF VALVE 2 @ 18.49', 36.98], ['PIPE THREAD SEALANT', 24.36]], dateFormat: 'MM/DD/YYYY', style: 'wood' },

  // ── Card C · Visa ··1156 · Priya Shah (Programs). No statement yet: the visitor imports it.
  { k: 16, card: 'C', day: 4, vendor: 'Trillium Craft Supply', address: ['220 Manitoba St', 'Bracebridge ON P1L 1S2'], code: 'ARTS', purpose: 'Beads and string',
    items: [['PONY BEADS 5LB 2 @ 38.99', 77.98], ['ELASTIC CORD 4 @ 9.95', 39.80], ['BEAD TRAYS 10PK', 29.02]], dateFormat: 'DD/MM/YY', style: 'kraft' },
  { k: 17, card: 'C', day: 8, vendor: 'Paper Moon Stationers', address: ['9 Ontario St', 'Huntsville ON P1H 1M3'], code: 'OFFICE', purpose: 'Name tags',
    items: [['NAME BADGES 200', 38.99], ['LANYARDS 50', 25.13]], dateFormat: 'Mon D YYYY', style: 'grey' },
  { k: 18, card: 'C', day: 13, vendor: 'Trillium Craft Supply', address: ['220 Manitoba St', 'Bracebridge ON P1L 1S2'], code: 'ARTS', purpose: 'Watercolour paper',
    items: [['WATERCOLOUR PAD 6 @ 11.49', 68.94], ['BRUSH SET 12', 19.51]], dateFormat: 'DD/MM/YY', style: 'kraft' },
  { k: 19, card: 'C', day: 18, vendor: 'Maple Leaf Games & Toys', address: ['101 King St', 'Bracebridge ON P1L 1A1'], code: 'PRG', purpose: 'Evening program prizes',
    items: [['PRIZE ASSORTMENT BOX', 119.99]], dateFormat: 'DD/MM/YYYY', style: 'desk' },
  { k: 20, card: 'C', day: 25, vendor: 'Pinegrove General Store', address: ['41 Muskoka Rd N', 'Huntsville ON P1H 1A2'], code: 'PRG', purpose: 'Candy for the carnival',
    items: [['BULK CANDY MIX 3KG', 35.60]], dateFormat: 'YYYY-MM-DD', style: 'faded' },

  // ── Waiting for Priya to check what was read (status needs_review, with a sample AI read).
  { k: 31, card: 'C', day: 3, review: true, conf: 0.94, vendor: 'Northwind Hardware', address: ['Store #214', '880 Queen St E, Toronto ON'], code: 'MAINT',
    items: [['DOCK HINGE GALV 2 @ 18.50', 37.00], ['DECK SCREWS #8 2.5IN', 12.49], ['EXT WOOD STAIN 946ML', 25.51]], dateFormat: 'MM/DD/YYYY', style: 'wood' },
  // The coffee stain hides the date: the reader returns none, and the receipt stays undated.
  { k: 32, card: 'C', day: null, hiddenDay: 14, review: true, conf: 0.00, vendor: 'Trillium Craft Supply', address: ['220 Manitoba St', 'Bracebridge ON P1L 1S2'], code: 'ARTS',
    items: [['ACRYLIC PAINT SET 24', 32.99], ['BRUSH ASSORTMENT', 14.50], ['CANVAS PAD 3 @ 9.99', 29.97]], dateFormat: 'DD/MM/YY', style: 'stained' },
  { k: 33, card: 'C', day: 8, review: true, conf: 0.58, vendor: "The Loon's Nest Grill", address: ['12 Bay St, Parry Sound ON'], code: 'TRIP', tip: 25.00,
    items: [['Food', 118.00], ['Non-alc beverages', 24.00]], dateFormat: 'MM/DD/YYYY', style: 'restaurant' },
  { k: 34, card: 'C', day: 14, review: true, conf: 0.61, vendor: 'Pinegrove General Store', address: ['41 Muskoka Rd N', 'Huntsville ON P1H 1A2'], code: 'MAINT',
    items: [['AA BATTERIES 12PK', 14.99], ['DUCT TAPE 48MM', 8.49], ['ZIP TIES 100CT', 6.99]], dateFormat: 'YYYY-MM-DD', style: 'faded' },
  // Bought on this month's trip to Vancouver Island: GST and BC PST.
  { k: 35, card: 'C', nextMonthDay: 2, review: true, conf: 0.71, vendor: 'Harbourview Books & Gifts', address: ['77 Front St', 'Nanaimo BC V9R 5H9'], code: 'PRG',
    items: [['BOARD GAME 2 @ 34.99', 69.98], ['PLAYING CARDS', 6.49]], taxes: 'GST_PST_BC', dateFormat: 'MM/DD/YYYY', style: 'crumpled' },
  // A riding program's feed, from an Alberta supplier: GST only.
  { k: 36, card: 'C', day: 19, review: true, conf: 0.88, vendor: 'Foothills Farm & Feed', address: ['3 Railway St W', 'Cochrane AB T4C 2A5'], code: 'PRG',
    items: [['HAY BALE SQUARE 3 @ 12.00', 36.00], ['SALT BLOCK 20KG', 14.50]], taxes: 'GST', dateFormat: 'Mon D YYYY', style: 'green' },
];

const round2 = (x) => Math.round(x * 100) / 100;

/** Subtotal, tax lines, tip and total for one receipt, resolving copies. */
export function demoReceiptMoney(r) {
  const src = r.copyOf ? DEMO_RECEIPTS.find((x) => x.k === r.copyOf) : r;
  const subtotal = round2(src.items.reduce((s, i) => s + i[1], 0));
  let taxes;
  if (src.zeroRated) taxes = [];
  else if (src.taxes === 'GST') taxes = [{ type: 'GST', rate_pct: 5, amount: round2(Math.round(subtotal * 5) / 100) }];
  else if (src.taxes === 'GST_PST_BC') taxes = [{ type: 'GST', rate_pct: 5, amount: Math.round(subtotal * 5) / 100 }, { type: 'PST', rate_pct: 7, amount: Math.round(subtotal * 7) / 100 }];
  else taxes = hst(subtotal);
  const tip = src.tip ?? null;
  const total = round2(subtotal + taxes.reduce((s, t) => s + t.amount, 0) + (tip ?? 0));
  return { subtotal, taxes, tip, total };
}

export const demoPhotoFile = (r) => `demo-${String(r.copyOf ?? r.k).padStart(2, '0')}.jpg`;
