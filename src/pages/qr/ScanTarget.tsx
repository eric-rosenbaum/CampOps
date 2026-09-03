/**
 * What a scanned sticker resolves to.
 *
 * One sticker, two audiences. A camp cannot manage two kinds of code per door — anyone printing
 * a "staff" code and a "guest" code for the same cabin has already lost, because within a week
 * half the doors will have one of each and nobody will know which is which. So the sticker is
 * one URL and this page decides who is holding the phone.
 *
 * The decision is instant and free: a staff member's session is already in this origin's local
 * storage, so "is this staff" is a read, not a round trip. Nobody waits, and nobody is asked to
 * identify themselves before they can report a broken screen door.
 *
 * The third case is the honest one and the one that is usually skipped: signed in, but to a
 * different camp. Silently showing them the guest form would be a lie, and silently showing them
 * another camp's work would be a leak. So it says so, and offers both doors.
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { resolveQrToken } from '@/lib/campgroundDb';
import type { QrTarget } from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';
import { CampCommandMark } from '@/components/shared/CampCommandMark';
import { PublicReportForm } from '@/pages/report/PublicReportForm';

/** Where a staff member is sent. Lives inside the app shell, where the camp's data is loaded. */
const hubPath = (token: string) => `/hub/${token}`;

export function ScanTarget() {
  const { token } = useParams<{ token: string }>();
  /** Set by the escape hatch below, so a slow session read never traps somebody in a doorway. */
  const [forceGuest, setForceGuest] = useState(false);

  const authLoading = useAuthStore((s) => s.isLoading);
  const session = useAuthStore((s) => s.session);
  const campLoading = useCampStore((s) => s.isLoading);
  const currentCamp = useCampStore((s) => s.currentCamp);

  // The resolution is stamped with the token it belongs to, so a second scan in the same session
  // reads as "still loading" rather than briefly showing the previous door.
  const [resolved, setResolved] = useState<{ forToken: string; value: QrTarget | null } | null>(null);
  useEffect(() => {
    if (!token) return;
    let live = true;
    void resolveQrToken(token).then((t) => { if (live) setResolved({ forToken: token, value: t }); });
    return () => { live = false; };
  }, [token]);

  const target = resolved && resolved.forToken === token ? resolved.value : undefined;

  if (!token) return <UnknownCode />;
  if (target === undefined) return <Waiting onGuest={() => setForceGuest(true)} />;
  if (target === null) return <UnknownCode />;

  if (forceGuest) return <PublicReportForm token={token} target={target} />;

  // The session is read from local storage, so this settles in a frame or two. Anything longer
  // and the escape hatch in <Waiting> gets them to the report form anyway.
  if (authLoading) return <Waiting target={target} onGuest={() => setForceGuest(true)} />;

  if (!session) return <PublicReportForm token={token} target={target} />;

  if (campLoading) return <Waiting target={target} onGuest={() => setForceGuest(true)} />;

  if (currentCamp && currentCamp.id === target.campId) {
    return <Navigate to={hubPath(token)} replace />;
  }

  return <WrongCamp token={token} target={target} />;
}

// ─── States ───────────────────────────────────────────────────────────────────

function Shell({ target, children }: { target?: QrTarget | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-paper flex flex-col">
      <div className="bg-white border-b border-border px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {target?.logoUrl ? (
            <img src={target.logoUrl} alt="" className="w-9 h-9 rounded-card object-cover flex-none" />
          ) : (
            <CampCommandMark size={36} decorative className="flex-none" />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">
              {target ? (target.kind === 'asset' ? 'Equipment' : 'Location') : 'CampCommand'}
            </p>
            <h1 className="text-[16px] font-bold text-ink leading-tight truncate">
              {target?.targetName ?? 'Scanned code'}
            </h1>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

function Waiting({ target, onGuest }: { target?: QrTarget | null; onGuest: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <Shell target={target}>
      <div className="text-center">
        <Loader2 className="w-6 h-6 text-sage animate-spin mx-auto" />
        {/* Nobody standing in a doorway should be trapped behind a spinner. After a couple of
            seconds, offer the thing they almost certainly came here to do. The target is already
            resolved by then, so the form works with or without the session ever arriving. */}
        {slow && target && (
          <button
            onClick={onGuest}
            className="mt-5 text-[13px] text-ink-soft underline hover:text-forest"
          >
            Just report a problem here
          </button>
        )}
      </div>
    </Shell>
  );
}

function UnknownCode() {
  return (
    <Shell>
      <div className="text-center">
        <div className="w-14 h-14 bg-cream-dark rounded-card grid place-items-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-ink-faint" />
        </div>
        <h2 className="text-[19px] font-bold text-ink mb-2">This code is not recognised</h2>
        <p className="text-[14px] text-ink-soft leading-relaxed">
          The sticker may have been replaced, or the place it pointed at may no longer be listed.
          Tell someone at the camp office what you found and where — they can reprint it.
        </p>
      </div>
    </Shell>
  );
}

/**
 * Signed in, but to another camp.
 *
 * Two real doors, both honest. If they are a member of the camp on the sticker (a shared
 * director between two properties, or a founder), switching in is one tap. If they are not, the
 * guest report is the correct and only thing they can do here, and saying so is better than a
 * form that fails at the end.
 */
function WrongCamp({ token, target }: { token: string; target: QrTarget }) {
  const navigate = useNavigate();
  const camps = useCampStore((s) => s.camps);
  const currentCamp = useCampStore((s) => s.currentCamp);
  const selectCamp = useCampStore((s) => s.selectCamp);
  const openCampAsAdmin = useCampStore((s) => s.openCampAsAdmin);
  const isPlatformAdmin = useCampStore((s) => s.isPlatformAdmin);
  const [switching, setSwitching] = useState(false);
  const [asGuest, setAsGuest] = useState(false);

  if (asGuest) return <PublicReportForm token={token} target={target} />;

  const isMember = camps.some((c) => c.id === target.campId);
  const canSwitch = isMember || isPlatformAdmin;

  async function handleSwitch() {
    setSwitching(true);
    if (isMember) await selectCamp(target.campId);
    else await openCampAsAdmin(target.campId);
    navigate(hubPath(token), { replace: true });
  }

  return (
    <Shell target={target}>
      <div>
        <h2 className="text-[19px] font-bold text-ink mb-2">
          This is {target.campName}
        </h2>
        <p className="text-[14px] text-ink-soft leading-relaxed mb-6">
          {currentCamp
            ? <>You are signed in to <span className="font-semibold text-ink">{currentCamp.name}</span>, so this sticker is not one of yours.</>
            : <>You are signed in, but not to this camp.</>}
        </p>

        <div className="space-y-2.5">
          {canSwitch && (
            <button
              onClick={() => void handleSwitch()}
              disabled={switching}
              className="w-full flex items-center justify-between gap-3 bg-forest text-paper rounded-btn px-4 py-3.5 text-[14px] font-bold hover:bg-forest-mid disabled:opacity-50"
            >
              <span>{switching ? 'Switching…' : `Switch to ${target.campName}`}</span>
              <ArrowRight className="w-4 h-4 flex-none" />
            </button>
          )}
          <button
            onClick={() => setAsGuest(true)}
            className="w-full flex items-center justify-between gap-3 bg-white border border-border text-forest rounded-btn px-4 py-3.5 text-[14px] font-bold hover:border-sage"
          >
            <span>Report a problem here</span>
            <ArrowRight className="w-4 h-4 flex-none" />
          </button>
        </div>
      </div>
    </Shell>
  );
}
