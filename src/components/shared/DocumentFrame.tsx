import { useEffect, useRef, useState } from 'react';

/**
 * A rendered document, framed like a page on a mat.
 *
 * Used by the camp's agreement composer and by the group's own portal, so both are looking at
 * the identical thing: the output of `agreementHtml`, which is also exactly what prints.
 *
 * It sizes itself to its content rather than scrolling internally. A fixed-height iframe sounds
 * right and is not — the wheel over a nested document does not reliably reach it, and a contract
 * you cannot scroll is worse than no preview at all. Growing instead means one scroll region
 * (the page), which is how a PDF embedded in a page behaves.
 *
 * `sandbox="allow-same-origin"` and nothing else: no scripts, no forms, no navigation. The
 * same-origin grant exists only so the height can be measured; the body is text somebody typed,
 * HTML-escaped on the way in.
 */
export function DocumentFrame({ html, title = 'Document', minHeight = 360, className = '' }: {
  html: string;
  title?: string;
  minHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);

  function measure() {
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    setHeight(Math.max(minHeight, doc.documentElement.scrollHeight));
  }

  // Fonts land after load and change the height, so measure again on the next frame too.
  useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, minHeight]);

  return (
    <div className={`rounded-card border border-border bg-cream-dark/60 p-2 sm:p-3 ${className}`}>
      <iframe
        ref={ref}
        title={title}
        srcDoc={html}
        sandbox="allow-same-origin"
        onLoad={measure}
        scrolling="no"
        style={{ height }}
        className="w-full rounded-sm border-0 bg-white
                   shadow-[0_1px_2px_rgba(26,46,26,0.10),0_10px_28px_-14px_rgba(26,46,26,0.35)]"
      />
    </div>
  );
}
