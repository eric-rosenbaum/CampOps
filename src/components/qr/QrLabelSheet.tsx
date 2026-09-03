/**
 * The printable sheet.
 *
 * Rendered into a portal on `document.body` rather than inside the modal, for one reason: the
 * print stylesheet hides every top-level element that is not this one. A sheet nested inside a
 * `fixed inset-0` modal inherits that positioning and prints as a single clipped page no matter
 * what the page rules say.
 *
 * No PDF library. A browser laying out inch-sized boxes on a Letter page IS the PDF library, and
 * a print path with no dependency is one that still works in a camp office in three years.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LAYOUTS, QrLabel, perSheet, type LabelLayout, type LabelSpec } from './QrPreview';

const PRINT_ROOT_ID = 'qr-print-root';

/**
 * Page rules for one layout.
 *
 * The top margin is 0.5in, which is exactly Avery 5163's top margin, so row one lands on label
 * one. The SIDE margin is the layout's own (0.1875in for 5163) rather than a matching 0.5in:
 * with a 0.5in side margin the two 4in columns would need to start 0.3125in left of the
 * printable area, and content pushed outside the page box gets clipped by the browser rather
 * than politely overhanging. Setting the page box to the label grid is the only version of this
 * that survives an actual printer.
 */
function printCss(layout: LabelLayout): string {
  const geo = LAYOUTS[layout];
  return `
@media screen { #${PRINT_ROOT_ID} { display: none !important; } }
@media print {
  @page { size: letter; margin: ${geo.marginTop}in ${geo.marginSide}in; }
  html, body {
    margin: 0 !important; padding: 0 !important;
    background: #ffffff !important;
  }
  /* Everything the app renders lives in #root. Hide it, show the sheet. */
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} {
    display: block !important;
    position: static !important;
    width: auto !important;
  }
  .qr-sheet { break-after: page; page-break-after: always; }
  .qr-sheet:last-child { break-after: auto; page-break-after: auto; }
  /* Without this a printer "helpfully" drops the black fill of the QR to grey. */
  #${PRINT_ROOT_ID}, .qr-sheet, .qr-label {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;
}

interface Props {
  specs: LabelSpec[];
  layout: LabelLayout;
  /**
   * Cells to leave blank before the first label — how a camp reprints one sticker onto a sheet
   * that already has six peeled off it, instead of wasting nine labels to replace one.
   */
  startSlot?: number;
  /** Fired once the sheet has been laid out and its images settled. */
  onReady?: () => void;
}

export function QrLabelSheet({ specs, layout, startSlot = 0, onReady }: Props) {
  const geo = LAYOUTS[layout];
  const size = perSheet(layout);

  // The portal host is created once, imperatively, so it is a DIRECT child of <body> — which is
  // what the `body > *:not(...)` rule above depends on. A lazy useState initialiser rather than a
  // ref, so nothing is read or written during render.
  const [host] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById(PRINT_ROOT_ID) ?? document.createElement('div');
    el.id = PRINT_ROOT_ID;
    return el;
  });

  const readyRef = useRef(onReady);
  useEffect(() => { readyRef.current = onReady; }, [onReady]);

  useLayoutEffect(() => {
    if (!host) return;
    if (!host.parentNode) document.body.appendChild(host);
    return () => { host.remove(); };
  }, [host]);

  useEffect(() => {
    // Two frames for layout, then a beat for the camp logo to decode. Calling print() before the
    // logo has painted prints a sheet with a hole where the logo goes.
    let frame = 0;
    let timer = 0;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        timer = window.setTimeout(() => readyRef.current?.(), 300);
      });
    });
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [specs, layout, startSlot]);

  if (!host) return null;

  // Blank leading cells, then the labels, chunked into sheets.
  const cells: (LabelSpec | null)[] = [
    ...Array.from({ length: Math.max(0, Math.min(startSlot, size - 1)) }, () => null),
    ...specs,
  ];
  const pages: (LabelSpec | null)[][] = [];
  for (let i = 0; i < cells.length; i += size) pages.push(cells.slice(i, i + size));

  return createPortal(
    <>
      <style>{printCss(layout)}</style>
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className="qr-sheet"
          style={{
            width: `${geo.cols * geo.w}in`,
            display: 'grid',
            gridTemplateColumns: `repeat(${geo.cols}, ${geo.w}in)`,
            gridAutoRows: `${geo.h}in`,
            background: '#ffffff',
          }}
        >
          {page.map((spec, cellIndex) => (
            <div key={cellIndex} style={{ width: `${geo.w}in`, height: `${geo.h}in`, overflow: 'hidden' }}>
              {spec && <QrLabel spec={spec} layout={layout} size={geo.w} unit="in" />}
            </div>
          ))}
        </div>
      ))}
    </>,
    host,
  );
}
