import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);
import { dbUploadPublicReportPhoto } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { Camera, X, CheckCircle, AlertCircle, TreePine } from 'lucide-react';

interface CampInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  locations: string[];
}

type PageState = 'loading' | 'not_found' | 'form' | 'submitting' | 'success';

export function PublicReportForm() {
  const { camp: slug } = useParams<{ camp: string }>();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [camp, setCamp] = useState<CampInfo | null>(null);

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
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug) { setPageState('not_found'); return; }
    supabasePublic
      .from('camps')
      .select('id, name, logo_url, locations')
      .eq('slug', slug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setPageState('not_found'); return; }
        setCamp({
          id: data.id as string,
          name: data.name as string,
          logoUrl: (data.logo_url as string) ?? null,
          locations: (data.locations as string[]) ?? [],
        });
        setPageState('form');
      });
  }, [slug]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!camp || !title.trim()) return;
    setPageState('submitting');
    setSubmitError(null);

    try {
      const issueId = generateId();
      const now = new Date().toISOString();

      let photoUrl: string | null = null;
      if (photoFile) {
        try {
          photoUrl = await dbUploadPublicReportPhoto(photoFile, camp.id, issueId);
        } catch {
          // Photo upload failed — submit without it rather than blocking the report
        }
      }

      const { error } = await supabasePublic.from('issues').insert({
        id: issueId,
        camp_id: camp.id,
        title: title.trim(),
        description: description.trim() || null,
        locations: [],
        priority: 'normal',
        status: 'unassigned',
        assignee_id: null,
        reported_by_id: null,
        is_public_report: true,
        reporter_name: reporterName.trim() || null,
        reporter_contact: reporterContact.trim() || null,
        estimated_cost_display: null,
        estimated_cost_value: null,
        actual_cost: null,
        photo_url: photoUrl,
        due_date: null,
        is_recurring: false,
        recurring_interval: null,
        created_at: now,
        updated_at: now,
      });

      if (error) throw error;

      setPageState('success');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
      setPageState('form');
    }
  }

  const inputClass = 'w-full text-[15px] bg-white border border-stone-200 rounded-xl px-4 py-3.5 focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100 transition-all placeholder:text-stone-400';
  const labelClass = 'block text-[12px] font-semibold text-stone-500 uppercase tracking-wide mb-2';

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-stone-50 w-full flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen bg-stone-50 w-full flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-stone-400" />
            </div>
            <h1 className="text-[20px] font-bold text-stone-800 mb-2">Page not found</h1>
            <p className="text-[14px] text-stone-400 leading-relaxed">This report link doesn't exist or is no longer active.</p>
          </div>
      </div>
    );
  }

  if (pageState === 'success') {
    function handleSubmitAnother() {
      setTitle('');
      setDescription('');
      setReporterName('');
      setReporterContact('');
      setPhotoFile(null);
      setPhotoPreview(null);
      setSubmitError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setPageState('form');
    }
    return (
      <div className="min-h-screen bg-stone-50 w-full flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-[22px] font-bold text-stone-800 mb-2">Report submitted</h1>
            <p className="text-[15px] text-stone-400 leading-relaxed mb-8">
              Thank you — {camp?.name} staff will review your report.
            </p>
            <button
              onClick={handleSubmitAnother}
              className="w-full bg-stone-800 text-white text-[14px] font-semibold rounded-xl py-3.5 hover:bg-stone-700 active:bg-stone-900 transition-colors"
            >
              Submit another report
            </button>
          </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 w-full">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {camp?.logoUrl ? (
            <img src={camp.logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 bg-stone-800 rounded-xl flex items-center justify-center flex-shrink-0">
              <TreePine className="w-4.5 h-4.5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest">Report an issue</p>
            <h1 className="text-[16px] font-bold text-stone-800 leading-tight truncate">{camp?.name}</h1>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-lg mx-auto px-5 py-7">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Issue title */}
          <div>
            <label className={labelClass}>What's the issue? <span className="text-red-400">*</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="e.g. Broken dock plank, leaking faucet…"
              required
              disabled={pageState === 'submitting'}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>
              Details <span className="text-stone-300 normal-case font-normal tracking-normal">— optional</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} resize-none`}
              rows={4}
              placeholder="Where exactly is it? When did you notice it? Any other context…"
              disabled={pageState === 'submitting'}
            />
          </div>

          {/* Photo */}
          <div>
            <label className={labelClass}>
              Photo <span className="text-stone-300 normal-case font-normal tracking-normal">— optional</span>
            </label>
            {photoPreview ? (
              <div className="space-y-2.5">
                <div className="relative rounded-xl overflow-hidden border border-stone-200">
                  <img src={photoPreview} alt="Preview" className="w-full max-h-52 object-cover" />
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={pageState === 'submitting'}
                    className="absolute top-2.5 right-2.5 w-7 h-7 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-[12px] text-stone-400 cursor-pointer hover:text-stone-600 transition-colors w-fit">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Change photo</span>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2.5 py-7 px-4 bg-white rounded-xl border border-dashed border-stone-200 cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-all">
                <div className="w-9 h-9 bg-stone-100 rounded-xl flex items-center justify-center">
                  <Camera className="w-4.5 h-4.5 text-stone-400" />
                </div>
                <span className="text-[13px] text-stone-400">Tap to attach a photo</span>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
            )}
          </div>

          {/* Divider */}
          <div className="pt-1">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-stone-100" />
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">Your info — optional</p>
              <div className="h-px flex-1 bg-stone-100" />
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  className={inputClass}
                  placeholder="First name or full name"
                  disabled={pageState === 'submitting'}
                />
              </div>
              <div>
                <label className={labelClass}>Email or phone</label>
                <input
                  value={reporterContact}
                  onChange={(e) => setReporterContact(e.target.value)}
                  className={inputClass}
                  placeholder="In case staff need to follow up"
                  disabled={pageState === 'submitting'}
                />
              </div>
            </div>
          </div>

          {submitError && (
            <div className="flex items-center gap-2.5 bg-red-50 text-red-600 text-[13px] rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={!title.trim() || pageState === 'submitting'}
            className="w-full bg-stone-800 text-white text-[15px] font-semibold rounded-xl py-4 hover:bg-stone-700 active:bg-stone-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pageState === 'submitting' ? 'Submitting…' : 'Submit report'}
          </button>

        </form>
      </div>
    </div>
  );
}
