/**
 * One sticker.
 *
 * Everything about a single label lives here — its geometry, its content, and what the QR
 * actually encodes — because the on-screen preview and the printed sheet must be the same
 * object. A preview that is a hand-drawn approximation of the print is worse than no preview:
 * somebody trusts it, prints forty, and finds out the name overflowed on the real thing.
 *
 * So `QrLabel` is sized by a single `size` number in a caller-chosen unit (inches for print,
 * pixels for screen) and every internal dimension is derived from it. The two renderings are
 * the same component at two scales, which is what makes the preview honest.
 */
/* eslint-disable react-refresh/only-export-components --
 * The layout geometry and the sticker URL helpers ARE the label's definition — the printed sheet
 * and the on-screen preview have to agree on them or the preview lies. Splitting them into a
 * sibling module to satisfy fast refresh would put the definition of a label in one file and the
 * drawing of it in another, for a dev-server nicety. */
import { useMemo } from 'react';
import { encodeQr, qrToSvgPath } from '@/lib/qr';
import { APP_ENV, MARKETING_HOSTS } from '@/lib/env';

export type LabelLayout = 'avery5163' | 'large4up';

/** What one sticker names. Built from a location or an asset by the print modal. */
export interface LabelSpec {
  kind: 'location' | 'asset';
  /** The row's id — used as a React key and by the rotate action, never printed. */
  id: string;
  token: string;
  name: string;
  /** The parent path ("Boys Village › Cabin 7"), or an asset's storage location. */
  path: string | null;
  logoUrl: string | null;
}

export interface LayoutGeometry {
  name: string;
  hint: string;
  /** Label size in inches. */
  w: number;
  h: number;
  cols: number;
  rows: number;
  /** Distance from the paper edge to the first label, in inches. */
  marginTop: number;
  marginSide: number;
}

/**
 * Avery 5163 is the shipping-label stock every office already has: ten 2×4 inch labels on a
 * Letter sheet, no gutter. The large format is for a signpost at a trailhead or a pump house,
 * where the reader is standing six feet back and the QR has to be big enough to catch.
 */
export const LAYOUTS: Record<LabelLayout, LayoutGeometry> = {
  avery5163: {
    name: 'Avery 5163',
    hint: '4″ × 2″ · 10 per sheet · doors',
    w: 4, h: 2, cols: 2, rows: 5,
    marginTop: 0.5, marginSide: 0.1875,
  },
  large4up: {
    name: 'Large format',
    hint: '3.75″ × 5″ · 4 per sheet · outdoor posts',
    w: 3.75, h: 5, cols: 2, rows: 2,
    marginTop: 0.5, marginSide: 0.5,
  },
};

export const perSheet = (layout: LabelLayout) => LAYOUTS[layout].cols * LAYOUTS[layout].rows;

// ─── What the sticker points at ───────────────────────────────────────────────

/**
 * The origin printed on the sticker.
 *
 * Production always prints the marketing host, which is shorter to read aloud and to type, and
 * which the app's HostGuard bounces to app.campcommand.app on arrival. That bounce is not
 * incidental: sessions are per-origin, so a staff member's session only exists on the app host,
 * and landing there is what lets one sticker tell staff from guests.
 *
 * Off production we print the origin we are actually running on, so a test print from staging
 * scans back into staging instead of quietly pointing forty stickers at the live site.
 */
export function stickerOrigin(): string {
  if (APP_ENV === 'production' || typeof window === 'undefined') return `https://${MARKETING_HOSTS[0]}`;
  return window.location.origin;
}

export const stickerUrl = (token: string) => `${stickerOrigin()}/l/${token}`;

/** The same URL with the scheme stripped — what a human types when the QR will not scan. */
export const stickerText = (token: string) => stickerUrl(token).replace(/^https?:\/\//, '');

// ─── The code itself ──────────────────────────────────────────────────────────

/**
 * The QR as inline SVG.
 *
 * Level Q (~25% recoverable) is the encoder's default and is kept: these get rained on, scuffed
 * by a screen door and written on with a marker.
 */
export function QrCode({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const { d, extent } = useMemo(() => {
    const quiet = 4; // the spec's quiet zone; a code printed flush to a border does not scan
    const qr = encodeQr(text, 'Q');
    return { d: qrToSvgPath(qr, quiet), extent: qr.size + quiet * 2 };
  }, [text]);

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role="img"
      aria-label="QR code"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}

// ─── The label ────────────────────────────────────────────────────────────────

interface LabelProps {
  spec: LabelSpec;
  layout: LabelLayout;
  /** Label WIDTH, in `unit`. Height follows from the layout's aspect ratio. */
  size: number;
  unit: 'in' | 'px';
}

export function QrLabel({ spec, layout, size, unit }: LabelProps) {
  const geo = LAYOUTS[layout];
  const u = (n: number) => `${Number(n.toFixed(4))}${unit}`;
  const w = size;
  const h = (size * geo.h) / geo.w;
  const url = stickerUrl(spec.token);
  const text = stickerText(spec.token);

  // Pure black on pure white. Camp colours are for the screen the scan lands on; a label is a
  // scanning target first, and every colour a printer approximates costs contrast.
  const frame: React.CSSProperties = {
    width: u(w),
    height: u(h),
    background: '#ffffff',
    color: '#000000',
    boxSizing: 'border-box',
    overflow: 'hidden',
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
    fontFamily: '"Karla", ui-sans-serif, system-ui, sans-serif',
  };

  if (layout === 'large4up') {
    const pad = w * 0.05;
    const inner = w - pad * 2;
    return (
      <div className="qr-label" style={{ ...frame, padding: u(pad), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <LabelHead spec={spec} u={u} nameSize={w * 0.098} pathSize={w * 0.046} logoSize={w * 0.11} centered />
        {/*
          The QR takes whatever height is left rather than a fixed side, and `min-height: 0` is
          what lets it actually give ground. A hard-coded square overflowed the label by about an
          eighth of an inch on a long name and pushed the printed URL — the whole point of the
          fallback — off the bottom edge.
        */}
        <div style={{
          flex: '1 1 auto', minHeight: 0, width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: u(w * 0.025),
        }}>
          <QrCode text={url} style={{ height: '100%', width: 'auto', maxWidth: '100%' }} />
        </div>
        <Prompt u={u} size={w * 0.040} centered />
        <UrlStrip u={u} text={text} available={inner} max={w * 0.052} centered />
      </div>
    );
  }

  // Avery 5163. The typeable URL gets its own full-width strip along the bottom rather than
  // sharing the narrow column beside the QR: at 4 inches wide the label has room for the whole
  // address, and a fallback that ends in an ellipsis is not a fallback.
  const pad = w * 0.04;
  const inner = w - pad * 2;
  const strip = monoFit(text, inner, w * 0.045) * 1.5;
  const qrSide = h - pad * 2 - strip;

  return (
    <div className="qr-label" style={{ ...frame, padding: u(pad), display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: u(pad), height: u(qrSide) }}>
        <QrCode text={url} style={{ width: u(qrSide), height: u(qrSide), flex: 'none' }} />
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <LabelHead spec={spec} u={u} nameSize={w * 0.062} pathSize={w * 0.034} logoSize={w * 0.055} />
          <Prompt u={u} size={w * 0.030} />
        </div>
      </div>
      <UrlStrip u={u} text={text} available={inner} max={w * 0.045} rule />
    </div>
  );
}

/**
 * The largest font size at which `text` still fits `available` on one line.
 *
 * A guessed size works until somebody prints from staging, where the origin is longer — and the
 * failure mode is a silently ellipsised URL, which looks fine on screen and is worthless on a
 * wall. 0.62em is DM Mono's advance with a hair of headroom for the ui-monospace fallback.
 */
function monoFit(text: string, available: number, max: number): number {
  if (text.length === 0) return max;
  return Math.min(max, available / (text.length * 0.62));
}

function LabelHead({
  spec, u, nameSize, pathSize, logoSize, centered = false,
}: {
  spec: LabelSpec;
  u: (n: number) => string;
  nameSize: number;
  pathSize: number;
  logoSize: number;
  centered?: boolean;
}) {
  return (
    <div style={{ width: '100%', textAlign: centered ? 'center' : 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: u(logoSize * 0.35), justifyContent: centered ? 'center' : 'flex-start' }}>
        {spec.logoUrl && (
          <img
            src={spec.logoUrl}
            alt=""
            style={{ width: u(logoSize), height: u(logoSize), objectFit: 'contain', flex: 'none' }}
          />
        )}
        <span
          style={{
            fontSize: u(nameSize),
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            // Two lines, then clip. A name long enough to need a third has already lost the
            // argument with the label; the QR and the URL still work.
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {spec.name}
        </span>
      </div>
      {spec.path && (
        <div
          style={{
            fontSize: u(pathSize),
            lineHeight: 1.2,
            marginTop: u(pathSize * 0.35),
            color: '#000000',
            opacity: 0.62,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {spec.path}
        </div>
      )}
    </div>
  );
}

function Prompt({ u, size, centered = false }: { u: (n: number) => string; size: number; centered?: boolean }) {
  return (
    <div style={{
      fontSize: u(size), lineHeight: 1.2, opacity: 0.62,
      marginTop: u(size * 0.9), textAlign: centered ? 'center' : 'left',
      whiteSpace: 'nowrap', overflow: 'hidden',
    }}>
      Something broken? Scan this.
    </div>
  );
}

/**
 * The typeable address.
 *
 * Not decoration. QR fails in rain, in low light, behind a scratched laminate and on a phone
 * whose camera app does not scan — and a sticker that fails silently teaches a camp that the
 * whole programme does not work. A line somebody can type is the difference between a sticker
 * programme that survives the summer and one that does not, so it gets the full width of the
 * label, a mono face where 1/l and 0/O are distinguishable, and a size chosen to fit rather
 * than guessed at.
 */
function UrlStrip({
  u, text, available, max, centered = false, rule = false,
}: {
  u: (n: number) => string;
  text: string;
  available: number;
  max: number;
  centered?: boolean;
  rule?: boolean;
}) {
  const size = monoFit(text, available, max);
  return (
    <div style={{
      marginTop: u(size * 0.4),
      paddingTop: rule ? u(size * 0.35) : undefined,
      borderTop: rule ? '1px solid rgba(0,0,0,0.28)' : undefined,
      width: '100%',
      textAlign: centered ? 'center' : 'left',
    }}>
      <span style={{
        fontSize: u(size),
        lineHeight: 1.15,
        fontFamily: '"DM Mono", ui-monospace, monospace',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        {text}
      </span>
    </div>
  );
}

// ─── Screen preview ───────────────────────────────────────────────────────────

/**
 * One label on screen at true relative proportions, so somebody can see what they are about to
 * commit a sheet of label stock to.
 */
export function QrPreview({
  spec, layout, widthPx = 300, className = '',
}: {
  spec: LabelSpec;
  layout: LabelLayout;
  widthPx?: number;
  className?: string;
}) {
  return (
    <div className={`inline-block border border-border bg-white shadow-sm ${className}`}>
      <QrLabel spec={spec} layout={layout} size={widthPx} unit="px" />
    </div>
  );
}
