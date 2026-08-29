import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

/**
 * Fills an official New York DOH form by drawing onto it.
 *
 * Eight of the nine NY children's-camp forms carry no AcroForm fields — they are flat PDFs.
 * So there is nothing to "set"; values are drawn at coordinates measured from each form's own
 * printed labels. The official page is never modified, only overlaid, which matters because a
 * sanitarian recognises these forms and an altered layout reads as a forgery.
 *
 * Two traps are handled here because getting either wrong fails silently:
 *
 *  1. The maps are in TOP-LEFT origin (measured with PyMuPDF). pdf-lib draws in BOTTOM-LEFT.
 *     Every y is converted exactly once, here.
 *  2. DOH-367a carries /Rotate 90. pdf-lib's drawText ignores page rotation, so its coordinates
 *     are given in display space and transformed back to raw space below.
 */

export interface FormFieldMap {
  key: string;
  label_text?: string;
  page: number;
  x: number;
  y: number;
  max_width?: number;
  font_size?: number;
  align?: 'left' | 'center';
  /**
   * A comb field: the form prints a divider tick between character boxes, so the value has to
   * be drawn one character per cell centre. Centring the whole string instead puts both digits
   * either side of the divider and reads as "0|8".
   */
  comb_cells?: number[];
  notes?: string;
  disabled?: boolean;
}

export interface FormMap {
  form_code: string;
  form_version: string;
  page_count: number;
  page_size: [number, number];
  coordinate_origin: 'top-left';
  page_rotation?: number;
  fields: FormFieldMap[];
}

/**
 * The VALUE decides how it is drawn: `true` marks a checkbox with an X, a string is written
 * literally. Deliberately not inferred from the map's prose notes — several maps describe the
 * page-number column with the same "X mark" wording as the tick columns, so parsing notes
 * turns page references into ticks.
 */
export type FormValues = Record<string, string | boolean | null | undefined>;

const INK = rgb(0.05, 0.15, 0.45);   // reads as a typed-in value, never as printed form text

/**
 * Fits text to the field's clamp width by stepping the size down, then truncating.
 * A value that silently overflows into the next cell is worse than one visibly shortened.
 */
function fit(
  text: string, maxWidth: number | undefined, size: number,
  width: (t: string, s: number) => number,
): { text: string; size: number } {
  if (!maxWidth || width(text, size) <= maxWidth) return { text, size };
  let s = size;
  while (s > 6 && width(text, s) > maxWidth) s -= 0.5;
  if (width(text, s) <= maxWidth) return { text, size: s };
  let t = text;
  while (t.length > 1 && width(t + '…', s) > maxWidth) t = t.slice(0, -1);
  return { text: t + '…', size: s };
}

export async function fillForm(
  blankPdfBytes: ArrayBuffer,
  map: FormMap,
  values: FormValues,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(blankPdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const rotated = (map.page_rotation ?? 0) === 90;
  const width = (t: string, s: number) => font.widthOfTextAtSize(t, s);

  for (const f of map.fields) {
    if (f.disabled) continue;                       // office-use columns are not ours to fill
    const raw = values[f.key];
    if (raw === undefined || raw === null || raw === '' || raw === false) continue;

    const page = pages[f.page];
    if (!page) continue;

    const checkbox = typeof raw === 'boolean';
    const text = checkbox ? 'X' : String(raw);
    const size = f.font_size ?? 9;
    const fitted = fit(text, f.max_width, size, width);

    const pageH0 = page.getSize().height;
    const pageW0 = page.getSize().width;

    // Comb fields get one character per printed box, centred in the box. Anything longer than
    // the comb falls through to the normal path rather than spilling past the last cell.
    if (f.comb_cells && f.comb_cells.length >= fitted.text.length) {
      for (let i = 0; i < fitted.text.length; i += 1) {
        const ch = fitted.text[i];
        const cx = f.comb_cells[i] - width(ch, fitted.size) / 2;
        if (rotated) {
          page.drawText(ch, {
            x: f.y, y: pageW0 - cx, size: fitted.size, font, color: INK, rotate: degrees(90),
          });
        } else {
          page.drawText(ch, { x: cx, y: pageH0 - f.y, size: fitted.size, font, color: INK });
        }
      }
      continue;
    }

    // For centred fields the map's x IS the cell centre (the maps state their column centres),
    // so the glyph is offset back by half its width. Left-aligned fields anchor at f.x.
    const x = f.align === 'center'
      ? f.x - width(fitted.text, fitted.size) / 2
      : f.x;

    // Top-left (map) → bottom-left (pdf-lib). The single place this conversion happens.
    const pageH = page.getSize().height;
    const pageW = page.getSize().width;

    if (rotated) {
      // Display space → raw space for a /Rotate 90 page: (X,Y)display → (Y, pageH−X)raw,
      // with the glyphs turned 90°.
      page.drawText(fitted.text, {
        x: f.y, y: pageW - x, size: fitted.size, font, color: INK, rotate: degrees(90),
      });
    } else {
      page.drawText(fitted.text, {
        x, y: pageH - f.y, size: fitted.size, font, color: INK,
      });
    }
  }

  return pdf.save();
}

/** Fetches a blank official form. They ship with the app so there is no network dependency. */
export async function loadBlankForm(formCode: string): Promise<ArrayBuffer> {
  const res = await fetch(`/forms/ny/${formCode.toLowerCase()}.pdf`);
  if (!res.ok) throw new Error(`Could not load blank form ${formCode} (${res.status})`);
  return res.arrayBuffer();
}
