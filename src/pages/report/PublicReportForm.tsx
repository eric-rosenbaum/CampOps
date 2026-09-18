import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// A plain client: no session, no custom fetch wrapper, no timeout logic. Everything this page
// calls is granted to `anon` on purpose, and a stale staff token would only make these requests
// slower, never more capable.
const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);
import { dbUploadPublicReportPhoto } from '@/lib/db';
import { generateId } from '@/lib/utils';
import type { QrTarget } from '@/lib/types';
import { Camera, X, CheckCircle, AlertCircle, Copy, Check, Clock } from 'lucide-react';
import { CampCommandMark } from '@/components/shared/CampCommandMark';
import { OpenInAppCard } from '@/components/qr/OpenInAppCard';
import { LanguagePicker } from '@/components/i18n/LanguagePicker';

interface CampLocationOption { id: string; name: string; }

interface CampInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Only populated on the slug form; a sticker fixes the location and needs no list. */
  locations: CampLocationOption[];
}

/** What `open_reports_at` hands back. Deliberately thin: no ids, no assignee, no reporter. */
interface OpenReport {
  title: string;
  reported_days_ago: number;
  status: string;
}

/**
 * The database words its refusals for people ("Too many reports from this device…"), in English.
 * Re-say the ones we know in the reader's language; anything else is shown as it came.
 */
function reportError(t: TFunction<'scan'>, message: string): string {
  if (/too many reports/i.test(message)) return t('report.errors.tooMany');
  if (/short description of the problem is required/i.test(message)) return t('report.errors.titleRequired');
  if (/code is not recognised/i.test(message)) return t('report.errors.unknownCode');
  if (/location is not recognised/i.test(message)) return t('report.errors.unknownLocation');
  if (/camp is not recognised/i.test(message)) return t('report.errors.unknownCamp');
  if (message && message.length < 200) return message;
  return t('report.errors.generic');
}

/** `open_reports_at` says where a report stands in two plain English phrases. */
function openStatus(t: TFunction<'scan'>, status: string): string {
  if (status === 'not started yet') return t('report.open.notStarted');
  if (status === 'being worked on') return t('report.open.inProgress');
  return status;
}

/** Top-end, on the pages that have no header of their own. */
function CornerPicker() {
  return (
    <div className="absolute top-4 end-4">
      <LanguagePicker tone="light" />
    </div>
  );
}

type PageState = 'loading' | 'not_found' | 'form' | 'submitting' | 'success' | 'already_known';

interface Props {
  /**
   * A sticker's token, when this form is reached from a scan. Also read from `?token=` so a
   * link somebody pasted into a group chat behaves the same way.
   */
  token?: string;
  /**
   * The already-resolved target, passed by ScanTarget so a scan is one round trip rather than
   * two. Absent when the page is opened directly.
   */
  target?: QrTarget | null;
}

export function PublicReportForm({ token: tokenProp, target: targetProp }: Props = {}) {
  const { t } = useTranslation('scan');
  const { camp: slug } = useParams<{ camp: string }>();
  const [searchParams] = useSearchParams();
  const token = tokenProp ?? searchParams.get('token') ?? undefined;

  const [pageState, setPageState] = useState<PageState>(targetProp ? 'form' : 'loading');
  const [camp, setCamp] = useState<CampInfo | null>(
    targetProp
      ? { id: targetProp.campId, name: targetProp.campName, logoUrl: targetProp.logoUrl, locations: [] }
      : null,
  );
  const [target, setTarget] = useState<QrTarget | null>(targetProp ?? null);
  const [openHere, setOpenHere] = useState<OpenReport[] | null>(null);
  const [receiptToken, setReceiptToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const original = viewport?.getAttribute('content') ?? '';
    viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    return () => {
      viewport?.setAttribute('content', original);
      document.documentElement.style.overflowX = '';
      document.body.style.overflowX = '';
    };
  }, []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Who and where ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (targetProp) { setTarget(targetProp); return; }
    if (!token) return;
    // Reached at /report/:camp?token=… or /l/:token without a pre-resolved target.
    supabasePublic.rpc('get_qr_target', { p_token: token }).then(({ data, error }) => {
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (error || !row) { setPageState('not_found'); return; }
      setTarget({
        campId: row.camp_id as string,
        campName: row.camp_name as string,
        campSlug: row.camp_slug as string,
        logoUrl: (row.logo_url as string) ?? null,
        kind: ((row.kind as QrTarget['kind']) ?? 'location'),
        targetId: row.target_id as string,
        targetName: row.target_name as string,
        targetPath: (row.target_path as string) ?? null,
      });
      setCamp({
        id: row.camp_id as string,
        name: row.camp_name as string,
        logoUrl: (row.logo_url as string) ?? null,
        locations: [],
      });
      setPageState('form');
    });
  }, [token, targetProp]);

  useEffect(() => {
    if (token || targetProp) return; // the sticker already answered "which camp"
    if (!slug) { setPageState('not_found'); return; }
    supabasePublic
      .rpc('get_public_camp', { p_slug: slug })
      .then(({ data, error }) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) { setPageState('not_found'); return; }
        setCamp({
          id: row.id as string,
          name: row.name as string,
          logoUrl: (row.logo_url as string) ?? null,
          locations: (row.locations as CampLocationOption[]) ?? [],
        });
        setPageState('form');
      });
  }, [slug, token, targetProp]);

  /**
   * What is already reported at this exact spot, before they type a word.
   *
   * This is the number-one failure of open reporting: the same broken door reported eleven
   * times, until the list is noise and the camp stops reading it. It is not an AI problem — the
   * sticker already told us the location, so it is a plain query, and showing the answer first
   * is the whole fix.
   */
  useEffect(() => {
    if (!token) return;
    supabasePublic.rpc('open_reports_at', { p_token: token }).then(({ data, error }) => {
      if (error) return; // a failed pre-check must never block reporting
      setOpenHere((data as OpenReport[]) ?? []);
    });
  }, [token]);

  // ── Photo ───────────────────────────────────────────────────────────────────

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!camp || !title.trim()) return;
    setPageState('submitting');
    setSubmitError(null);

    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        // The path only needs to be unique; the issue id does not exist until the RPC runs.
        photoUrl = await dbUploadPublicReportPhoto(photoFile, camp.id, generateId());
        // A failed upload returns null. Submit anyway — the words matter more than the picture.
      }

      const { data, error } = await supabasePublic.rpc('submit_public_report_v2', {
        p_camp_slug: token ? null : slug ?? null,
        p_qr_token: token ?? null,
        p_location_id: token ? null : (locationId || null),
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_reporter_name: reporterName.trim() || null,
        p_reporter_contact: reporterContact.trim() || null,
        p_photo_url: photoUrl,
      });

      if (error) throw error;
      const result = data as { id: string; receipt_token: string | null } | null;
      setReceiptToken(result?.receipt_token ?? null);
      setPageState('success');
    } catch (err) {
      // The database writes these messages for people — "Too many reports from this device in the
      // last hour, please call the camp office" — so show them rather than replacing them with a
      // generic apology. A PostgrestError is a plain object, not an Error, so `instanceof` alone
      // would silently swallow exactly the message worth showing.
      const message =
        typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : '';
      setSubmitError(reportError(t, message));
      setPageState('form');
    }
  }

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setLocationId('');
    setReporterName('');
    setReporterContact('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setSubmitError(null);
    setReceiptToken(null);
    setCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPageState('form');
  }, []);

  const receiptPath = receiptToken ? `/report/receipt/${receiptToken}` : null;
  const receiptUrl = receiptPath && typeof window !== 'undefined'
    ? `${window.location.origin}${receiptPath}` : null;

  async function copyReceipt() {
    if (!receiptUrl) return;
    try {
      await navigator.clipboard.writeText(receiptUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some in-app browsers. The link is on screen either way.
    }
  }

  const inputClass = 'w-full text-[15px] bg-white border border-border rounded-xl px-4 py-3.5 focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100 transition-all placeholder:text-ink-faint';
  const labelClass = 'block text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-2';

  // ── States ──────────────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-paper w-full flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-border border-t-stone-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (pageState === 'not_found') {
    return (
      <div className="relative min-h-screen bg-paper w-full flex items-center justify-center p-4 sm:p-6">
        <CornerPicker />
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-ink-faint" />
          </div>
          <h1 className="text-[20px] font-bold text-ink mb-2">
            {token ? t('unknown.title') : t('report.notFound')}
          </h1>
          <p className="text-[14px] text-ink-faint leading-relaxed">
            {token ? t('report.notFoundToken') : t('report.notFoundLink')}
          </p>
        </div>
      </div>
    );
  }

  if (pageState === 'already_known') {
    return (
      <div className="relative min-h-screen bg-paper w-full flex items-center justify-center p-4 sm:p-6">
        <CornerPicker />
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-[22px] font-bold text-ink mb-2">{t('report.knownTitle')}</h1>
          <p className="text-[15px] text-ink-faint leading-relaxed mb-8">
            {t('report.knownBody', { camp: camp?.name ?? '' })}
          </p>
          <button
            onClick={resetForm}
            className="w-full bg-stone-800 text-white text-[14px] font-semibold rounded-xl py-3.5 hover:bg-stone-700 active:bg-stone-900 transition-colors"
          >
            {t('report.somethingElse')}
          </button>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="relative min-h-screen bg-paper w-full flex items-center justify-center p-4 sm:p-6">
        <CornerPicker />
        <div className="max-w-sm w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-[22px] font-bold text-ink mb-2">{t('report.submittedTitle')}</h1>
            <p className="text-[15px] text-ink-faint leading-relaxed mb-6">
              {t('report.submittedBody', { camp: camp?.name ?? '' })}
            </p>
          </div>

          {/*
            The receipt is what separates a suggestion box from a conversation. Somebody who
            reports a broken door and never hears anything again does not report the next one —
            that is the loudest complaint about every open-reporting system there is. No account,
            no login: a link they can keep.
          */}
          {receiptPath && (
            <div className="bg-white border border-border rounded-xl p-4 mb-5">
              <p className="text-[13px] text-ink-soft leading-relaxed mb-3">
                {t('report.receiptHint')}
              </p>
              <Link
                to={receiptPath}
                dir="ltr"
                className="block text-[13px] font-mono text-forest break-all underline mb-3 text-start"
              >
                {receiptUrl ?? receiptPath}
              </Link>
              <div className="flex gap-2">
                <button
                  onClick={() => void copyReceipt()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white border border-border text-ink text-[13px] font-semibold rounded-xl py-2.5 hover:border-stone-400 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t('report.copied') : t('report.copyLink')}
                </button>
                <Link
                  to={receiptPath}
                  className="flex-1 inline-flex items-center justify-center bg-white border border-border text-ink text-[13px] font-semibold rounded-xl py-2.5 hover:border-stone-400 transition-colors"
                >
                  {t('report.checkOnIt')}
                </Link>
              </div>
            </div>
          )}

          <button
            onClick={resetForm}
            className="w-full bg-stone-800 text-white text-[14px] font-semibold rounded-xl py-3.5 hover:bg-stone-700 active:bg-stone-900 transition-colors"
          >
            {t('report.another')}
          </button>
        </div>
      </div>
    );
  }

  const alreadyOpen = openHere ?? [];

  return (
    <div className="min-h-screen bg-paper w-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {camp?.logoUrl ? (
            <img src={camp.logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <CampCommandMark size={36} decorative className="flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest">{t('report.header')}</p>
            <h1 className="text-[16px] font-bold text-ink leading-tight truncate">{camp?.name}</h1>
          </div>
          {/* Reporters are guests and crew with no account here; the form has to meet them in
              their own language before they type a word. What they type is sent as typed. */}
          <LanguagePicker tone="light" className="flex-none" />
        </div>
      </div>

      {/* Form */}
      <div className="max-w-lg mx-auto px-5 py-7">

        {/*
          The sticker is the answer to "where is it". A counselor standing in front of a broken
          screen door knows exactly what is broken and does NOT reliably know whether that
          building is called "Cabin 7", "Cabin Seven" or "Boys 7" in the camp's tree. So when a
          token is in play there is no dropdown at all: the location is fixed and shown as a fact.
        */}
        {target && (
          <div className="bg-white border border-border rounded-xl px-4 py-3.5 mb-5">
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest mb-0.5">
              {target.kind === 'asset' ? t('report.youScanned') : t('report.youreAt')}
            </p>
            <p className="text-[17px] font-bold text-ink leading-tight">{target.targetName}</p>
            {target.targetPath && (
              <p className="text-[12.5px] text-ink-faint mt-0.5">{target.targetPath}</p>
            )}
          </div>
        )}

        {/* Sits under "you're at", above the form: whoever is holding the phone is more likely
            to be crew than a guest once they are scanning a door, and the crew's answer is the
            app. It renders nothing off iOS, so a guest on Android sees the form and no clutter. */}
        {target && token && (
          <div className="mb-5">
            <OpenInAppCard token={token} targetName={target.targetName} />
          </div>
        )}

        {alreadyOpen.length > 0 && (
          <div className="bg-amber-bg border border-amber/40 rounded-xl px-4 py-3.5 mb-5">
            <p className="text-[14px] font-bold text-amber-text mb-2">
              {t('report.alreadyReported', { count: alreadyOpen.length })}
            </p>
            <ul className="space-y-1.5 mb-3">
              {alreadyOpen.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-amber-text">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-[3px] opacity-70" />
                  <span>
                    <span className="font-semibold">{r.title}</span>
                    <span className="opacity-75">
                      {' · '}
                      {r.reported_days_ago === 0 ? t('report.open.today') : t('report.open.daysAgo', { count: r.reported_days_ago })}
                      {' · '}{openStatus(t, r.status)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setPageState('already_known')}
              className="w-full bg-white border border-amber/50 text-amber-text text-[13px] font-semibold rounded-xl py-2.5 hover:bg-amber-bg transition-colors"
            >
              {t('report.thatsTheOne')}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Issue title */}
          <div>
            <label htmlFor="report-title" className={labelClass}>{t('report.titleLabel')} <span className="text-red-400">*</span></label>
            <input
              id="report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder={t('report.titlePlaceholder')}
              required
              disabled={pageState === 'submitting'}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="report-details" className={labelClass}>
              {t('report.details')} <span className="text-stone-300 normal-case font-normal tracking-normal">{t('report.optional')}</span>
            </label>
            <textarea
              id="report-details"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} resize-none`}
              rows={4}
              placeholder={target ? t('report.detailsPlaceholderTarget') : t('report.detailsPlaceholder')}
              disabled={pageState === 'submitting'}
            />
          </div>

          {/* Location — only on the slug form. A sticker has already answered this. */}
          {!target && camp && camp.locations.length > 0 && (
            <div>
              <label htmlFor="report-location" className={labelClass}>
                {t('report.location')} <span className="text-stone-300 normal-case font-normal tracking-normal">{t('report.optional')}</span>
              </label>
              <select
                id="report-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={pageState === 'submitting'}
                className={`${inputClass} appearance-none bg-white`}
              >
                <option value="">{t('report.locationPlaceholder')}</option>
                {camp.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Photo */}
          <div>
            <p className={labelClass}>
              {t('report.photo')} <span className="text-stone-300 normal-case font-normal tracking-normal">{t('report.optional')}</span>
            </p>
            {photoPreview ? (
              <div className="space-y-2.5">
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={photoPreview} alt={t('report.preview')} className="w-full max-h-52 object-cover" />
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={pageState === 'submitting'}
                    aria-label={t('report.removePhoto')}
                    className="absolute top-2.5 end-2.5 w-7 h-7 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-[12px] text-ink-faint cursor-pointer hover:text-ink-soft transition-colors w-fit">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{t('report.changePhoto')}</span>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2.5 py-7 px-4 bg-white rounded-xl border border-dashed border-border cursor-pointer hover:border-stone-400 hover:bg-paper transition-all">
                <div className="w-9 h-9 bg-cream-dark rounded-xl flex items-center justify-center">
                  <Camera className="w-4.5 h-4.5 text-ink-faint" />
                </div>
                <span className="text-[13px] text-ink-faint">{t('report.attachPhoto')}</span>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
            )}
          </div>

          {/* Divider */}
          <div className="pt-1">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-cream-dark" />
              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest">{t('report.yourInfo')}</p>
              <div className="h-px flex-1 bg-cream-dark" />
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="report-name" className={labelClass}>{t('report.name')}</label>
                <input
                  id="report-name"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  className={inputClass}
                  placeholder={t('report.namePlaceholder')}
                  disabled={pageState === 'submitting'}
                />
              </div>
              <div>
                <label htmlFor="report-contact" className={labelClass}>{t('report.contact')}</label>
                <input
                  id="report-contact"
                  dir="ltr"
                  value={reporterContact}
                  onChange={(e) => setReporterContact(e.target.value)}
                  className={inputClass}
                  placeholder={t('report.contactPlaceholder')}
                  disabled={pageState === 'submitting'}
                />
              </div>
            </div>
          </div>

          {submitError && (
            <div className="flex items-start gap-2.5 bg-red-50 text-red-600 text-[13px] rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={!title.trim() || pageState === 'submitting'}
            className="w-full bg-stone-800 text-white text-[15px] font-semibold rounded-xl py-4 hover:bg-stone-700 active:bg-stone-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pageState === 'submitting' ? t('report.submitting') : t('report.submit')}
          </button>

        </form>

        {/* Quiet, and last. Staff are the minority of the people holding this phone. */}
        {token && (
          <p className="mt-8 text-center text-[12.5px] text-ink-faint">
            <Trans
              t={t}
              i18nKey="report.staffSignIn"
              components={{
                signin: (
                  <Link
                    to="/login"
                    // Login reads this back after a successful sign-in, which lands them on the hub
                    // for the very door they are standing at rather than on a generic dashboard.
                    onClick={() => { try { sessionStorage.setItem('redirectAfterLogin', `/l/${token}`); } catch { /* private mode */ } }}
                    className="underline hover:text-ink-soft"
                  />
                ),
              }}
            />
          </p>
        )}
      </div>
    </div>
  );
}
