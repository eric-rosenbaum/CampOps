/**
 * Getting a phone photo into a shape the reader accepts, in the browser, before upload.
 *
 * A modern phone photo is 4–12 MB. Sent as-is it takes most of a minute to upload on camp wifi
 * and then exceeds the model's 5 MB image limit anyway. Downscaled to 2400 px on the long edge
 * and re-encoded as JPEG it is a few hundred KB and every digit on a receipt is still legible.
 * Re-encoding also bakes in the EXIF rotation, so a photo taken sideways arrives upright.
 */

const MAX_EDGE = 2400;
const MAX_PDF_BYTES = 4.8 * 1024 * 1024;

export class ReceiptFileError extends Error {}

export interface PreparedFile {
  file: File;
  ext: 'jpg' | 'png' | 'webp' | 'pdf';
  type: string;
}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export async function prepareReceiptFile(file: File): Promise<PreparedFile> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      throw new ReceiptFileError(`That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4.8 MB: send just the receipt pages.`);
    }
    return { file, ext: 'pdf', type: 'application/pdf' };
  }
  if (/\.(csv|tsv|xlsx?|ofx|qfx|qbo)$/i.test(file.name) || /csv|spreadsheet|excel/i.test(file.type)) {
    // A card statement dropped on the receipt reader. Say where it goes instead of only what it is not.
    throw new ReceiptFileError('That is a spreadsheet, not a receipt. A card statement is imported on Reconcile: pick the card and month, then “Choose the statement CSV”.');
  }
  if (!file.type.startsWith('image/') && !isHeic(file)) {
    throw new ReceiptFileError('That file is not a photo or a PDF of a receipt.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Safari decodes HEIC; Chrome and Firefox do not. A picked-from-library iPhone photo on a
    // laptop is the one case that lands here.
    if (isHeic(file)) {
      throw new ReceiptFileError('This browser cannot open HEIC photos. Use the Snap button on your phone, or save the photo as JPEG.');
    }
    throw new ReceiptFileError('That photo could not be opened. Try taking it again.');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ReceiptFileError('That photo could not be prepared.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new ReceiptFileError('That photo could not be prepared.');
  const base = file.name.replace(/\.[^.]+$/, '') || 'receipt';
  return { file: new File([blob], `${base}.jpg`, { type: 'image/jpeg' }), ext: 'jpg', type: 'image/jpeg' };
}
