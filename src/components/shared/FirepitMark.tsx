// The brand mark: a firepit. Replaces the pine tree.
//
// Drawn rather than imported so it inherits nothing from lucide's monoline set — the mark is
// the one place in the UI that carries colour of its own (ember orange over amber, two logs
// crossed beneath), which is what lets it read at 22px in a collapsed rail.

interface Props {
  size?: number;
  className?: string;
}

export function FirepitMark({ size = 34, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="CampCommand"
      fill="none"
    >
      {/* Outer flame: drawn as an outline so the mark stays legible at rail size, where a
          solid silhouette would read as an undifferentiated blob. */}
      <path
        d="M16 4.4c3.4 3.7 5.2 6.4 5.2 9.1a5.2 5.2 0 0 1-10.4 0c0-1.7.6-3.2 1.7-4.6.2 1.1.7 1.8 1.5 2.1-.6-2.4-.2-4.5 2-6.6Z"
        stroke="#B0522F"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      {/* Inner flame, solid amber — the one warm highlight. */}
      <path
        d="M16 10.6c1.5 1.9 2.1 2.9 2.1 4a2.1 2.1 0 0 1-4.2 0c0-1.1.6-2.1 2.1-4Z"
        fill="#D9922B"
      />
      {/* Two logs crossed beneath the fire. */}
      <g strokeLinecap="round" strokeWidth="3.4">
        <path d="M5.2 24.6 26.8 20.6" stroke="#7C5A34" />
        <path d="M5.2 20.6 26.8 24.6" stroke="#946B3E" />
      </g>
    </svg>
  );
}

/**
 * The topographic contour lines behind the sidebar. Purely decorative, and deliberately at
 * low opacity — it should register as paper texture, not as a diagram.
 */
export function SidebarContours() {
  return (
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none opacity-[0.16] text-[#EFE7D4]"
      viewBox="0 0 300 700"
      preserveAspectRatio="none"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M-20 90C60 40 150 130 220 80s90-40 120-70" />
      <path d="M-20 140C60 90 150 180 220 130s90-40 120-70" />
      <path d="M-20 250C70 210 120 300 200 270s80-70 140-60" />
      <path d="M-20 300C70 260 120 350 200 320s80-70 140-60" />
      <path d="M-20 350C70 310 120 400 200 370s80-70 140-60" />
      <path d="M-20 500C60 470 140 540 210 500s70-60 130-50" />
      <path d="M-20 560C60 530 140 600 210 560s70-60 130-50" />
      <path d="M-20 620C60 590 140 660 210 620s70-60 130-50" />
    </svg>
  );
}
