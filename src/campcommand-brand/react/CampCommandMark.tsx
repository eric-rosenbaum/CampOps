type Props = {
  /** Rendered width & height in px. Default 32. */
  size?: number | string;
  /** Badge fill. Default brand green. */
  disc?: string;
  /** Fire, monogram and ring. Default brand cream. */
  ink?: string;
  /** Drops the hairline ring and enlarges the contents. Use below ~24px. */
  compact?: boolean;
  /** Set when the mark sits next to the words "CampCommand". */
  decorative?: boolean;
  className?: string;
};

export const CC_GREEN = "#24392F";
export const CC_CREAM = "#FCF9F2";
export const CC_FLAME = "#A45838";
export const CC_EMBER = "#CF9542";
export const CC_WOOD  = "#8E6D45";

export function CampCommandMark({
  size = 32,
  disc = CC_GREEN,
  ink = CC_CREAM,
  compact = false,
  decorative = false,
  className,
}: Props) {
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": "CampCommand" };

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      {...a11y}
    >
      <circle cx="32" cy="32" r="31" fill={disc} />
      {!compact && (
        <circle cx="32" cy="32" r="27" fill="none" stroke={ink} strokeWidth={1.4} />
      )}
      <g
        transform={
          compact
            ? "translate(32 32) scale(1.14) translate(-32 -32)"
            : undefined
        }
      >
        <path d="M 28.863 17.965A7 7 0 1 0 28.863 28.035L 26.779 25.877A4 4 0 1 1 26.779 20.123Z" fill={ink} />
        <path d="M 44.863 17.965A7 7 0 1 0 44.863 28.035L 42.779 25.877A4 4 0 1 1 42.779 20.123Z" fill={ink} />
        <path d="M32 32C35 37 38 40 38 44A6 6 0 0 1 26 44C26 40.8 27.8 38.6 29 36C29.8 38.6 30.7 40 31.6 40.7C31.3 37.6 31.5 34.6 32 32Z" fill={ink} />
        <path d="M18 51 46 45.5" stroke={ink} strokeWidth={compact ? 3.8 : 3} />
        <path d="M18 45.5 46 51" stroke={ink} strokeWidth={compact ? 3.8 : 3} />
      </g>
    </svg>
  );
}

export default CampCommandMark;
