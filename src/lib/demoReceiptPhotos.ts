/**
 * The demo's sample receipt photos, made to agree with the rows they are attached to.
 *
 * seed_demo_receipts_internal() dates its receipts in last month, whichever month that is, and
 * returns for each one the photo under /demo/receipts/ to upload. The photos are static files
 * rendered for August 2026 (scripts/render-receipt-fixtures.mjs --demo), so for any other month the
 * printed date would contradict the row: a finance reviewer compares the two. manifest.json says
 * where each photo's date is printed, how and at what angle; this paints over it with the paper
 * around it and prints the row's date in its place.
 *
 * For the uploader (src/lib/demoGuideDb.ts, uploadSamplePhotos):
 *
 *   const blob = await (await fetch(`/demo/receipts/${f.sample_file}`)).blob();
 *   const photo = await samplePhotoForReceipt(blob, f.sample_file, f.receipt_id);
 *   // upload `photo` instead of `blob`
 *
 * Any failure returns the photo unchanged: a sample with an old date is better than no photo.
 */

export interface SamplePhotoMeta {
  /** The date printed on the static file; null when the photo shows no readable date. */
  printedDate: string | null;
  format: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'DD/MM/YY' | 'Mon D YYYY';
  /** Where the date is, in the image's own pixels (axis-aligned box of the rotated text). */
  box: { x: number; y: number; w: number; h: number };
  /** Degrees the receipt is turned in the photo. */
  angle: number;
  fontPx: number;
  bold: boolean;
  faded: boolean;
  blur: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (x: number) => String(x).padStart(2, '0');

/** A YYYY-MM-DD calendar day as the till printed it. Mirrors printedDate() in the renderer. */
export function formatPrintedDate(ymd: string, format: SamplePhotoMeta['format']): string {
  const [y, m, d] = ymd.split('-').map(Number);
  switch (format) {
    case 'YYYY-MM-DD': return `${y}-${pad(m)}-${pad(d)}`;
    case 'MM/DD/YYYY': return `${pad(m)}/${pad(d)}/${y}`;
    case 'DD/MM/YYYY': return `${pad(d)}/${pad(m)}/${y}`;
    case 'DD/MM/YY': return `${pad(d)}/${pad(m)}/${String(y).slice(2)}`;
    case 'Mon D YYYY': return `${MONTHS[m - 1]} ${d} ${y}`;
  }
}

let manifest: Promise<Record<string, SamplePhotoMeta>> | null = null;
function loadManifest(): Promise<Record<string, SamplePhotoMeta>> {
  manifest ??= fetch('/demo/receipts/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifest;
}

/** Redraw the printed date on one sample photo. Returns the original blob when nothing needs doing. */
export async function stampSampleReceiptDate(photo: Blob, sampleFile: string, purchaseDate: string | null): Promise<Blob> {
  try {
    const meta = (await loadManifest())[sampleFile];
    if (!meta || !meta.printedDate || !purchaseDate || purchaseDate === meta.printedDate) return photo;
    const bitmap = await createImageBitmap(photo);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return photo;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const { x, y, w, h } = meta.box;
    // The ink is the darkest pixel where the old date was printed.
    const inside = ctx.getImageData(x, y, w, h).data;
    let ink = [40, 40, 40]; let darkest = 765;
    for (let i = 0; i < inside.length; i += 4) {
      const sum = inside[i] + inside[i + 1] + inside[i + 2];
      if (sum < darkest) { darkest = sum; ink = [inside[i], inside[i + 1], inside[i + 2]]; }
    }

    // Paint the old date out column by column, blending the paper just above the box into the paper
    // just below it, so fading stripes, shadows and creases carry on through instead of a flat patch.
    const x0 = Math.max(0, x - 2); const x1 = Math.min(canvas.width, x + w + 2);
    const top = Math.max(0, y - 4); const bottom = Math.min(canvas.height - 1, y + h + 3);
    const above = ctx.getImageData(x0, top, x1 - x0, 1).data;
    const below = ctx.getImageData(x0, bottom, x1 - x0, 1).data;
    const patch = ctx.createImageData(x1 - x0, bottom - top);
    for (let row = 0; row < patch.height; row++) {
      const t = patch.height > 1 ? row / (patch.height - 1) : 0;
      for (let col = 0; col < patch.width; col++) {
        for (let ch = 0; ch < 3; ch++) {
          patch.data[(row * patch.width + col) * 4 + ch] = Math.round(above[col * 4 + ch] * (1 - t) + below[col * 4 + ch] * t);
        }
        patch.data[(row * patch.width + col) * 4 + 3] = 255;
      }
    }
    ctx.putImageData(patch, x0, top);
    ctx.save();
    const text = formatPrintedDate(purchaseDate, meta.format);
    const rad = (meta.angle * Math.PI) / 180;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rad);
    ctx.font = `${meta.bold ? 'bold ' : ''}${meta.fontPx}px "Courier New", Courier, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    if (meta.blur) ctx.filter = 'blur(0.6px)';
    ctx.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
    // The text's own width, laid out from the left edge of where the old date began.
    const width = ctx.measureText(text).width;
    const unrotatedW = Math.abs((w - Math.abs(Math.sin(rad)) * h) / Math.max(0.01, Math.cos(rad)));
    ctx.fillText(text, (width - unrotatedW) / 2, 0);
    ctx.restore();

    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return out ?? photo;
  } catch {
    return photo;
  }
}

/** The uploader's one call: look the receipt's date up, and stamp it on the photo. */
export async function samplePhotoForReceipt(photo: Blob, sampleFile: string, receiptId: string): Promise<Blob> {
  // Imported here so the date formatting above stays importable without a browser (the tests).
  const { supabase } = await import('./supabase');
  const { data } = await supabase.from('receipts').select('purchase_date').eq('id', receiptId).maybeSingle();
  return stampSampleReceiptDate(photo, sampleFile, (data?.purchase_date as string | null) ?? null);
}
