import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { LanguagePicker } from '@/components/i18n/LanguagePicker';
import { authErrorMessage } from './authErrors';
import { useAuthStore } from '@/store/authStore';
import { CampCommandMark } from '@/components/shared/CampCommandMark';

export function ForgotPassword() {
  const { t } = useTranslation('auth');
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    const err = await requestPasswordReset(email);
    setLoading(false);
    // Show the same confirmation whether or not the email exists (don't leak account existence).
    if (err) { setError(authErrorMessage(t, err)); return; }
    setSent(true);
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-paper p-4 sm:p-6">
      <div className="absolute top-4 end-4">
        <LanguagePicker tone="light" />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <CampCommandMark size={36} decorative />
          <span className="text-lg font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-border shadow-sm p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><MailCheck className="w-5 h-5 text-green-600" /></div>
              <h1 className="text-[18px] font-semibold text-forest mb-2">{t('forgot.sentTitle')}</h1>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                <Trans t={t} i18nKey="forgot.sentBody" values={{ email }} components={{ email: <bdi className="font-medium text-forest" /> }} />
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-[18px] font-semibold text-forest mb-1.5">{t('forgot.title')}</h1>
              <p className="text-[13px] text-ink-soft mb-5">{t('forgot.intro')}</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-[12px] font-medium text-ink mb-1.5">{t('fields.email')}</label>
                  <input id="forgot-email" dir="ltr" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40" />
                </div>
                {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-2">
                  {loading ? t('status.sending') : t('forgot.submit')}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="text-center mt-5">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft hover:text-forest transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 rtl:-scale-x-100" /> {t('forgot.back')}
          </Link>
        </div>
      </div>
    </div>
  );
}
