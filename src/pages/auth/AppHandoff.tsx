import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// No offline claim here: the iOS app has no offline layer, so any copy implying it works
// without a signal would be false advertising in the one place a new user reads carefully.
import { TreePine, Camera, ClipboardCheck, Bell } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';
import {
  IOS_APP_STORE_URL,
  markAppHandoffSeen,
  shouldOfferAppDownload,
} from '@/lib/appDownload';

/**
 * Shown once, immediately after someone joins a camp on an iPhone.
 *
 * Account creation happens on the web (invitations and join codes are links), but the day-to-day
 * job — logging an issue in a cabin, photographing a broken fixture — is a phone job. This is the
 * handoff between the two.
 *
 * Inert unless a store link is configured AND the visitor is on iOS: in every other case it
 * redirects straight to the dashboard, so joining from a laptop is unaffected.
 */
export function AppHandoff() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const currentCamp = useCampStore((s) => s.currentCamp);

  const offer = shouldOfferAppDownload();

  useEffect(() => {
    if (!offer) navigate('/home', { replace: true });
  }, [offer, navigate]);

  if (!offer) return null;

  const firstName = profile?.fullName?.trim().split(/\s+/)[0] ?? '';

  function goToStore() {
    markAppHandoffSeen();
    window.location.href = IOS_APP_STORE_URL;
  }

  function continueInBrowser() {
    markAppHandoffSeen();
    navigate('/home', { replace: true });
  }

  return (
    <div className="min-h-screen w-full bg-stone-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4.5 h-4.5 text-cream" />
          </div>
          <span className="text-lg font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8 text-center">
          <h1 className="text-[20px] font-bold text-forest mb-1.5">
            {firstName ? `You're in, ${firstName}!` : "You're in!"}
          </h1>
          {currentCamp && (
            <p className="text-[13px] text-forest/60 mb-6">
              You've joined {currentCamp.name}.
            </p>
          )}

          <p className="text-[13px] text-forest/70 leading-relaxed mb-5">
            Most camp work happens away from a desk. Get the iPhone app so you can log issues
            where you find them.
          </p>

          <ul className="text-left space-y-2.5 mb-7">
            <Benefit icon={Camera} text="Photograph problems on the spot" />
            <Benefit icon={Bell} text="Pick up jobs assigned to you" />
            <Benefit icon={ClipboardCheck} text="Work through opening and closing lists" />
          </ul>

          <button
            onClick={goToStore}
            className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors"
          >
            Get the iPhone app
          </button>

          <button
            onClick={continueInBrowser}
            className="mt-3 text-[12px] text-forest/50 hover:text-forest transition-colors"
          >
            Continue in browser
          </button>
        </div>
      </div>
    </div>
  );
}

function Benefit({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-md bg-sage-pale flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-forest/70" />
      </div>
      <span className="text-[12.5px] text-forest/75">{text}</span>
    </li>
  );
}
