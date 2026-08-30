import { useState, useEffect } from 'react';
import { Download, ScrollText, Smartphone, Trash2, Check, FileText, ExternalLink } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useCampStore } from '@/store/campStore';
import { LoadingBlock } from '@/components/shared/ModuleLoading';
import { PasswordSection } from '@/components/settings/PasswordSection';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint mb-2 mt-2">{children}</p>;
}

// ─── Multi-factor authentication (per-user) ─────────────────────────────────────

interface Factor { id: string; friendlyName: string | null; status: string; }

function MfaSection() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function applyFactors(data: { totp?: { id: string; friendly_name?: string | null; status: string }[] } | null) {
    setFactors((data?.totp ?? []).map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, status: f.status })));
    setLoading(false);
  }
  async function reload() {
    const { data } = await supabase.auth.mfa.listFactors();
    applyFactors(data);
  }

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => applyFactors(data));
  }, []);

  async function startEnroll() {
    setError(null);
    const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (e || !data) { setError(e?.message ?? 'Could not start setup. Please try again.'); return; }
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode('');
  }

  async function confirmEnroll() {
    if (!enrolling || busy) return;
    setBusy(true); setError(null);
    const ch = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
    if (ch.error || !ch.data) { setError(ch.error?.message ?? 'Something went wrong. Please try again.'); setBusy(false); return; }
    const v = await supabase.auth.mfa.verify({ factorId: enrolling.factorId, challengeId: ch.data.id, code: code.trim() });
    setBusy(false);
    if (v.error) { setError('That code didn’t match. Check your authenticator app and try again.'); return; }
    setEnrolling(null); setCode('');
    reload();
  }

  async function removeFactor(factorId: string) {
    if (!window.confirm('Turn off two-factor authentication for this device? You’ll no longer be asked for a code from it when you sign in.')) return;
    await supabase.auth.mfa.unenroll({ factorId });
    reload();
  }

  const verified = factors.filter((f) => f.status === 'verified');

  return (
    <section className="bg-white rounded-card border border-border p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-sage-pale flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-4.5 h-4.5 text-forest" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-forest">Two-step sign-in</h2>
          <p className="text-[13px] text-ink-soft mt-0.5">Add a second step when you sign in, using a free authenticator app (Google Authenticator, 1Password, Authy). Recommended for anyone with access to camper information.</p>
        </div>
      </div>

      {loading ? (
        <LoadingBlock size="sm" label="Loading" className="py-6" />
      ) : (
        <>
          {verified.length > 0 && (
            <div className="space-y-2 mb-4">
              {verified.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 rounded-btn border border-border bg-cream/40">
                  <Check className="w-4 h-4 text-green-muted-text flex-shrink-0" />
                  <span className="text-[13px] font-medium text-forest flex-1">Two-step sign-in is on</span>
                  <button onClick={() => removeFactor(f.id)} className="text-ink-faint hover:text-red transition-colors" title="Turn off">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {enrolling ? (
            <div className="rounded-btn border border-border p-4">
              <p className="text-[13px] font-medium text-forest mb-3">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
              <div className="flex flex-wrap gap-5 items-start">
                {/* qr_code is an SVG data URI from Supabase */}
                <img src={enrolling.qr} alt="QR code for authenticator setup" className="w-40 h-40 rounded-lg border border-border bg-white" />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Can’t scan? Enter this key instead</p>
                  <code className="text-[12px] break-all text-ink">{enrolling.secret}</code>
                  <div className="mt-4">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      placeholder="123456"
                      className="w-32 px-3 py-2 rounded-btn border border-border text-[15px] tracking-[0.3em] text-center text-forest focus:outline-none focus:border-sage"
                    />
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={confirmEnroll} disabled={code.length !== 6 || busy}>{busy ? 'Checking…' : 'Turn on'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEnrolling(null)}>Cancel</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Button size="sm" variant={verified.length ? 'ghost' : 'primary'} onClick={startEnroll}>
              {verified.length ? 'Add another device' : 'Turn on two-step sign-in'}
            </Button>
          )}
          {error && <p className="text-[12px] text-red mt-3">{error}</p>}
        </>
      )}
    </section>
  );
}

// ─── Data export (admin) ────────────────────────────────────────────────────────

function DataExportSection({ campId, campName }: { campId: string; campName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.rpc('export_camp_data', { p_camp_id: campId });
    setBusy(false);
    if (e || !data) { setError(e?.message ?? 'The export didn’t finish. Please try again.'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-data-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="bg-white rounded-card border border-border p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-sage-pale flex items-center justify-center flex-shrink-0">
          <Download className="w-4.5 h-4.5 text-forest" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-forest">Download your data</h2>
          <p className="text-[13px] text-ink-soft mt-0.5">Get a complete copy of everything in your camp as a single file, useful for your own records or backups. The download is noted in your activity log.</p>
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={exportData} disabled={busy}>{busy ? 'Preparing…' : 'Download a copy'}</Button>
      {error && <p className="text-[12px] text-red mt-3">{error}</p>}
    </section>
  );
}

// ─── Activity log (admin) ───────────────────────────────────────────────────────

interface AuditRow { id: string; action: string; target_table: string | null; target_id: string | null; actor_id: string | null; actor_email: string | null; created_at: string; }

const ACTION_LABELS: Record<string, string> = {
  insert: 'Added a record', update: 'Edited a record', delete: 'Removed a record',
  view_camper_health: 'Viewed camper health info', export_data: 'Downloaded a data copy',
  regenerate_portal_token: 'Reset a guest portal link',
};

// Human names for the records touched, so the log doesn't show raw table names.
const TABLE_LABELS: Record<string, string> = {
  campers: 'Camper', camper_restrictions: 'Camper health', camper_sessions: 'Camper session',
  commissary_files: 'Health document', camp_members: 'Team member',
  retreat_charges: 'Retreat billing', retreat_payments: 'Retreat payment', retreat_costs: 'Retreat cost',
  retreats: 'Retreat',
};

function ActivitySection({ campId, memberNames }: { campId: string; memberNames: Record<string, string> }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('audit_log').select('*').eq('camp_id', campId)
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setRows((data ?? []) as AuditRow[]); setLoading(false); });
  }, [campId]);

  return (
    <section className="bg-white rounded-card border border-border p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-sage-pale flex items-center justify-center flex-shrink-0">
          <ScrollText className="w-4.5 h-4.5 text-forest" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-forest">Activity log</h2>
          <p className="text-[13px] text-ink-soft mt-0.5">A record of sensitive actions, who viewed or changed camper health info, team roles, retreat billing, data downloads, and guest-link resets.</p>
        </div>
      </div>
      {loading ? (
        <LoadingBlock size="sm" label="Loading" className="py-6" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-ink-faint italic">No activity yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="text-ink-faint text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-2 py-1.5">When</th>
                <th className="text-left font-semibold px-2 py-1.5">Who</th>
                <th className="text-left font-semibold px-2 py-1.5">Action</th>
                <th className="text-left font-semibold px-2 py-1.5">Area</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-cream-dark">
                  <td className="px-2 py-2 text-ink-soft whitespace-nowrap">{new Date(r.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-2 py-2 text-ink">{(r.actor_id ? memberNames[r.actor_id] : '') || r.actor_email || 'System'}</td>
                  <td className="px-2 py-2 text-forest font-medium">{ACTION_LABELS[r.action] ?? r.action}</td>
                  <td className="px-2 py-2 text-ink-soft">{r.target_table ? (TABLE_LABELS[r.target_table] ?? '-') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Privacy links (everyone) ───────────────────────────────────────────────────

function PolicyLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="flex items-center gap-3 px-4 py-3 rounded-btn border border-border hover:border-sage hover:bg-cream/40 transition-colors group">
      <FileText className="w-4 h-4 text-ink-faint group-hover:text-sage flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-forest">{title}</p>
        <p className="text-[12px] text-ink-soft">{desc}</p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-forest/30 group-hover:text-sage" />
    </a>
  );
}

function PrivacySection() {
  return (
    <section className="bg-white rounded-card border border-border p-4 sm:p-6">
      <h2 className="text-[15px] font-semibold text-forest mb-1">Privacy &amp; security</h2>
      <p className="text-[13px] text-ink-soft mb-4">Your camp's information (including camper health details) is kept private to your camp and protected with industry-standard safeguards. The full details are here:</p>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <PolicyLink href="/privacy" title="Privacy Policy" desc="What we collect and how it's used" />
        <PolicyLink href="/security" title="Security Overview" desc="How your data is protected" />
      </div>
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

// Two-step sign-in (MFA) is built but archived for now, flip to true to re-enable it.
const MFA_ENABLED = false;

export function SecuritySettings() {
  const { role } = useAuth();
  const { currentCamp, members } = useCampStore();
  const isAdmin = role === 'admin';

  const memberNames: Record<string, string> = {};
  for (const m of members ?? []) if (m.userId) memberNames[m.userId] = m.displayName ?? m.email ?? 'Team member';

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Security & privacy" subtitle="Protect your account and manage your camp's information" />
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <SectionLabel>Your account</SectionLabel>
          <PasswordSection />
          {MFA_ENABLED && <MfaSection />}

          {isAdmin && currentCamp && (
            <>
              <SectionLabel>Your camp's data</SectionLabel>
              <DataExportSection campId={currentCamp.id} campName={currentCamp.name} />
              <ActivitySection campId={currentCamp.id} memberNames={memberNames} />
            </>
          )}

          <SectionLabel>Policies</SectionLabel>
          <PrivacySection />
        </div>
      </div>
    </div>
  );
}
