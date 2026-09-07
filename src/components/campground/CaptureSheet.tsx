import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, Sparkles, X } from 'lucide-react';
import type { WorkOrderDraft } from '@/lib/types';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCampStore } from '@/store/campStore';
import { useLocationStore } from '@/store/locationStore';
import { useAssetStore } from '@/store/assetStore';
import { useIssuesStore } from '@/store/issuesStore';
import { draftWorkOrder } from '@/lib/campgroundDb';

/**
 * Capture without typing.
 *
 * The person who finds the broken thing is holding a mop, standing in three inches of water, in
 * a building with one bar of signal. Every field this asks for is a reason the thing does not
 * get logged at all. So: point the camera, say what is wrong, and something else does the
 * typing.
 *
 * What comes back is NEVER filed. It drops straight into the log form as an editable draft and
 * this sheet closes. There is no approve-the-draft step in between: the form IS the review, every
 * field is already editable there, and a second confirm screen only asked people to read the same
 * text twice. If it came back wrong, Cancel costs nothing.
 */

// ─── Web Speech API ───────────────────────────────────────────────────────────
// lib.dom ships the result types but not the recognizer itself, and Chrome still exposes it
// under the webkit prefix. Declared narrowly here rather than globally so this file owns the
// shim and nothing else has to agree with it.

interface SpeechAlt { transcript: string }
interface SpeechRes { isFinal: boolean; readonly length: number; [index: number]: SpeechAlt }
interface SpeechResList { readonly length: number; [index: number]: SpeechRes }
interface SpeechEvt { resultIndex: number; results: SpeechResList }
interface SpeechErrEvt { error: string }

interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvt) => void) | null;
  onerror: ((e: SpeechErrEvt) => void) | null;
  onend: (() => void) | null;
}

type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognizerCtor;
    webkitSpeechRecognition?: RecognizerCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Say what went wrong in the words of the person holding the phone. */
function voiceErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The browser blocked the microphone. Allow it for this site, or type it below.';
    case 'no-speech':
      return 'Nothing came through. Hold the button while you speak.';
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'network':
      return 'Speech needs a connection, and there is not one right now. Type it below.';
    default:
      return `Voice capture stopped (${code}). Type it below instead.`;
  }
}

interface Props {
  onClose: () => void;
  /** Hands the draft back to the form that opened this. Nothing is filed here. */
  onDraft: (draft: WorkOrderDraft) => void;
}

export function CaptureSheet({ onClose, onDraft }: Props) {
  const members = useCampStore((s) => s.members);
  const locations = useLocationStore((s) => s.locations);
  const assets = useAssetStore((s) => s.assets);
  const issues = useIssuesStore((s) => s.issues);

  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const recRef = useRef<Recognizer | null>(null);
  /** Finalised words so far. Interim results replay themselves, so they cannot be appended. */
  const finalRef = useRef('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Resolved once, on mount: whether the browser can hear at all does not change mid-sheet.
  const [supported] = useState(() => recognizerCtor() !== null);

  useEffect(() => () => { recRef.current?.abort(); }, []);

  function startListening() {
    if (listening) return;
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    setVoiceError(null);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalRef.current = `${finalRef.current} ${text}`.trim();
        else interim += text;
      }
      // Live on screen while the button is held, so it is visibly working rather than
      // asking somebody to trust a red dot.
      setTranscript(`${finalRef.current} ${interim}`.trim());
    };
    rec.onerror = (e) => { setVoiceError(voiceErrorMessage(e.error)); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if a previous session has not finished tearing down. Harmless.
      setListening(false);
    }
  }

  function stopListening() {
    recRef.current?.stop();
    setListening(false);
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setPhotoPreview(url);
      // Send the whole data: URL, prefix included. Slicing it off threw away the media type, and
      // the function then had to guess — it guessed JPEG, so every PNG (a screenshot, or an
      // Android share sheet) came back 400 "appears to be a image/png image".
      setPhotoBase64(url);
    };
    reader.readAsDataURL(file);
  }

  async function handleRead() {
    setReading(true);
    setReadError(null);
    const result = await draftWorkOrder({
      imageBase64: photoBase64 ?? undefined,
      transcript: transcript.trim() || undefined,
      context: {
        members: members.map((m) => ({ id: m.userId, name: m.fullName })),
        locations: locations.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name })),
        assets: assets.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name })),
        // Recent titles let it recognise "the dishwasher again" as the same dishwasher.
        recentTitles: issues.slice(0, 12).map((i) => i.title),
      },
    });
    setReading(false);
    if (!result) {
      setReadError('That did not come back. Your words are still here, so try again or type it in.');
      return;
    }
    if (!result.readable) {
      // Nothing to fill the form with. Keep what they said on screen rather than closing over it.
      setReadError(result.error ?? 'Could not make anything out of that. Type it in instead.');
      return;
    }
    applyDraft(result);
  }

  /** The raw transcript rides along on the description: what was actually said is evidence. */
  function applyDraft(base: WorkOrderDraft) {
    const said = transcript.trim();
    const description = [base.description?.trim(), said ? `Said: “${said}”` : '']
      .filter(Boolean)
      .join('\n\n');
    onDraft({ ...base, description });
    onClose();
  }

  const nothingToRead = !photoBase64 && !transcript.trim();

  return (
    <Modal title="Capture" onClose={onClose} width="460px">
      <div className="space-y-4">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Take a picture, say what is wrong, or both.
        </p>

        {/* ── Voice ─────────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">Say it</p>
          {supported ? (
            <button
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={() => { if (listening) stopListening(); }}
              onPointerCancel={stopListening}
              className={`flex w-full items-center justify-center gap-2 rounded-card border px-3 py-3
                          text-[13px] font-bold transition-colors select-none ${
                listening
                  ? 'border-red bg-red-bg text-red'
                  : 'border-border bg-white text-forest hover:border-sage'
              }`}
            >
              <Mic className="h-4 w-4" />
              {listening ? 'Listening — let go when you are done' : 'Hold to talk'}
            </button>
          ) : (
            <div className="rounded-card border border-dashed border-border bg-cream px-3 py-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-faint">
                <Mic className="h-4 w-4" />
                Voice is not available in this browser
              </div>
              <p className="mt-1 text-[11.5px] text-ink-soft">
                Voice input needs Chrome, Edge or Safari. Type it below instead.
              </p>
            </div>
          )}

          {voiceError && <p className="mt-1.5 text-[11.5px] text-red">{voiceError}</p>}

          <textarea
            value={transcript}
            onChange={(e) => { finalRef.current = e.target.value; setTranscript(e.target.value); }}
            rows={3}
            placeholder="…or type what is wrong"
            className="mt-2 w-full resize-none rounded-btn border border-border bg-white px-3 py-2
                       text-[13px] leading-relaxed text-ink placeholder:text-ink-faint
                       focus:border-sage focus:outline-none"
          />
        </div>

        {/* ── Photo ─────────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">Show it</p>
          {photoPreview ? (
            <div className="relative overflow-hidden rounded-card">
              <img
                src={photoPreview}
                alt="What you photographed"
                className={`max-h-48 w-full rounded-card border border-border object-cover
                            transition-[filter,opacity] duration-300
                            ${reading ? 'opacity-80 saturate-[.6]' : ''}`}
              />
              {reading && (
                <>
                  {/* The sweep is the whole point: it says THIS image is being read, where a
                      centred spinner would only say "wait". */}
                  <div className="pointer-events-none absolute inset-0 rounded-card bg-forest/10" />
                  <div
                    className="cc-scan-line pointer-events-none absolute inset-x-0 top-0 h-[2px]
                               bg-gradient-to-r from-transparent via-sage to-transparent
                               shadow-[0_0_10px_2px_rgba(94,122,97,.55)]"
                  />
                </>
              )}
              {!reading && (
                <button
                  onClick={() => { setPhotoPreview(null); setPhotoBase64(null); }}
                  className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full
                             bg-black/50 text-white transition-colors hover:bg-black/70"
                  title="Remove this photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-card border border-dashed border-border
                         bg-cream px-3 py-3 text-ink-faint transition-colors hover:border-sage hover:text-ink-soft"
            >
              <Camera className="h-4 w-4" />
              <span className="text-[12.5px]">Take a photo</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
        </div>

        {readError && <p className="text-[12px] text-red">{readError}</p>}

        {reading && (
          <div className="flex items-center justify-center gap-2 rounded-card border border-border
                          bg-cream px-3 py-2.5">
            <Sparkles className="cc-loading-breathe h-4 w-4 text-sage" aria-hidden="true" />
            <span className="cc-loading-shimmer text-[12.5px] font-semibold text-ink-soft">
              {photoPreview ? 'Reading the photo…' : 'Reading what you said…'}
            </span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 justify-center"
            onClick={handleRead}
            disabled={nothingToRead || reading}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {reading ? 'Reading…' : 'Read this'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
