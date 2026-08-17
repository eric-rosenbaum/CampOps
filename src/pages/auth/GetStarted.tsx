import { Link, useNavigate } from 'react-router-dom';
import { TreePine, Smartphone, Monitor, ArrowRight, Mail, KeyRound } from 'lucide-react';
import {
  ANDROID_APP_AVAILABLE,
  ANDROID_PLAY_STORE_URL,
  IOS_APP_AVAILABLE,
  IOS_APP_STORE_URL,
  detectPlatform,
} from '@/lib/appDownload';
import type { DevicePlatform } from '@/lib/appDownload';

interface PlatformCard {
  id: DevicePlatform;
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  available: boolean;
  href?: string;
}

/**
 * The one link to hand someone who asks "how do I get in?".
 *
 * CampCommand runs on iPhone, on Android eventually, and in any browser, and a camp director
 * sending a link to forty seasonal staff should not have to work out which of those each
 * person needs. This page asks the visitor instead, and shows the platform they are already
 * holding first.
 *
 * It is written to be correct before either app ships. Store URLs live in appDownload.ts and
 * are empty until a build is live; an unavailable platform shows as "coming soon" rather than
 * a dead link, so this page can ship today and start working the moment a URL is filled in.
 */
export function GetStarted() {
  const navigate = useNavigate();
  const platform = detectPlatform();

  const cards: PlatformCard[] = [
    {
      id: 'ios',
      title: 'iPhone or iPad',
      detail: IOS_APP_AVAILABLE ? 'Download from the App Store' : 'Coming soon to the App Store',
      icon: Smartphone,
      available: IOS_APP_AVAILABLE,
      href: IOS_APP_STORE_URL,
    },
    {
      id: 'android',
      title: 'Android',
      detail: ANDROID_APP_AVAILABLE ? 'Download from Google Play' : 'Coming soon to Google Play',
      icon: Smartphone,
      available: ANDROID_APP_AVAILABLE,
      href: ANDROID_PLAY_STORE_URL,
    },
    {
      id: 'web',
      title: 'Web browser',
      detail: 'Works on any computer, phone or tablet',
      icon: Monitor,
      available: true,
    },
  ];

  // Lead with whatever the visitor is holding. Someone on an iPhone should not have to read
  // past two other options to find theirs.
  const ordered = [
    ...cards.filter((c) => c.id === platform),
    ...cards.filter((c) => c.id !== platform),
  ];

  function choose(card: PlatformCard) {
    if (card.id === 'web') { navigate('/login'); return; }
    if (card.available && card.href) window.location.assign(card.href);
  }

  return (
    <div className="min-h-screen w-full bg-stone-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4.5 h-4.5 text-cream" />
          </div>
          <span className="text-lg font-semibold text-forest">CampCommand</span>
        </Link>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6 sm:p-8">
          <h1 className="text-[20px] font-bold text-forest mb-1.5">Get started</h1>
          <p className="text-[13px] text-forest/60 leading-relaxed mb-6">
            Sign in or set up your account wherever you work. Everything stays in sync, so you
            can log an issue on your phone and pick it up later at a desk.
          </p>

          <div className="space-y-2.5">
            {ordered.map((card) => (
              <button
                key={card.id}
                onClick={() => choose(card)}
                disabled={!card.available}
                className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg border transition-colors ${
                  card.available
                    ? 'border-stone-200 hover:border-forest/30 hover:bg-stone-50'
                    : 'border-stone-200 bg-stone-50/60 cursor-default'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  card.available ? 'bg-sage-pale' : 'bg-stone-100'
                }`}>
                  <card.icon className={`w-4 h-4 ${card.available ? 'text-forest/70' : 'text-forest/30'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-medium ${card.available ? 'text-forest' : 'text-forest/40'}`}>
                    {card.title}
                    {card.id === platform && card.available && (
                      <span className="ml-2 text-[10px] font-medium text-forest/45 uppercase tracking-wide">
                        You're here
                      </span>
                    )}
                  </p>
                  <p className={`text-[11.5px] ${card.available ? 'text-forest/50' : 'text-forest/35'}`}>
                    {card.detail}
                  </p>
                </div>
                {card.available && <ArrowRight className="w-3.5 h-3.5 text-forest/30 flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/*
            Access is invite-only by design, so a visitor who arrives here without a camp needs
            telling where their way in comes from rather than being shown a signup form that
            would only reject them.
          */}
          <div className="mt-7 pt-6 border-t border-stone-100">
            <p className="text-[11px] font-medium text-forest/45 uppercase tracking-wide mb-3">
              Setting up for the first time?
            </p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Mail className="w-3.5 h-3.5 text-forest/40 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-forest/65 leading-relaxed">
                  Your camp administrator emails you an invitation. Open that link on any device
                  and it sets up your account. This is the usual way in.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <KeyRound className="w-3.5 h-3.5 text-forest/40 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-forest/65 leading-relaxed">
                  Given a join code instead?{' '}
                  <Link to="/join" className="font-medium text-forest hover:underline">
                    Enter it here
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[12px] text-forest/45 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-forest hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
