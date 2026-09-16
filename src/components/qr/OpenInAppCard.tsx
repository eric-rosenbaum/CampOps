/**
 * "This place, in the app" — shown under a scanned sticker on an iPhone or iPad.
 *
 * Only on iOS, because that is the only app there is. Telling an Android or desktop user about
 * an App Store listing they cannot install is noise on a page whose job is a thirty-second
 * problem report.
 *
 * The card carries the Smart App Banner with it: while it is mounted, mobile Safari offers
 * OPEN to anyone who already has the app, with this sticker's URL as the argument, so they land
 * on the cabin they are standing in front of rather than on the app's home screen. The button
 * below is the honest fallback for everyone else — a plain link to the App Store, which never
 * fails and never shows an error dialog. See lib/appLinks.ts for why it is not a deep link with
 * a timer behind it.
 */
import { useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { APP_STORE_URL, installSmartAppBanner, isIOS, stickerLink } from '@/lib/appLinks';

export function OpenInAppCard({ token, targetName }: { token: string; targetName?: string | null }) {
  const ios = isIOS();

  useEffect(() => {
    if (!ios) return;
    return installSmartAppBanner(stickerLink(token));
  }, [ios, token]);

  if (!ios) return null;

  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3.5 flex items-center gap-3">
      <AppMark />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-ink leading-tight">CampCommand for iPhone</p>
        <p className="text-[12.5px] text-ink-faint leading-snug mt-0.5">
          {targetName
            ? <>Scan this sticker with your camera and the app opens on {targetName}.</>
            : <>Scan a sticker with your camera and the app opens on that spot.</>}
        </p>
      </div>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-none inline-flex items-center gap-1 rounded-xl bg-stone-800 px-3.5 py-2.5 text-[13px]
                   font-semibold text-white transition-colors hover:bg-stone-700 active:bg-stone-900"
      >
        Get the app
        <ArrowUpRight className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

/** The app icon, drawn rather than fetched: one more request on a doorway is one too many. */
function AppMark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-forest text-cream"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4 20h16L12 3Z" />
        <path d="M12 11 8.5 20h7L12 11Z" fill="currentColor" stroke="none" opacity="0.35" />
      </svg>
    </span>
  );
}
