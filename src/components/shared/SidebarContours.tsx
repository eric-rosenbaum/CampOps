// The topographic texture behind the sidebar. Lifted out of the old FirepitMark file when
// that mark was replaced by the CampCommand badge, since the two were never related beyond
// having been drawn at the same time.

/**
 * The topographic contour lines behind the sidebar. Purely decorative, and deliberately at
 * low opacity. It should register as paper texture, not as a diagram.
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
