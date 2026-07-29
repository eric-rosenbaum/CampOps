import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TreePine, Plus, FlaskConical, LogIn, Copy, Check, Building2, ShieldCheck, Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useAdminStore, type AdminCamp } from '@/store/adminStore';
import { useCampStore } from '@/store/campStore';
import { useAuthStore } from '@/store/authStore';

const TYPE_STYLE: Record<string, string> = {
  customer: 'bg-green-muted-bg text-green-muted-text',
  trial: 'bg-amber-bg text-amber-text',
  demo: 'bg-blue-bg text-blue-text',
  internal: 'bg-cream-dark text-forest/60',
};
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-muted-bg text-green-muted-text',
  suspended: 'bg-red-bg text-red',
  trial_expired: 'bg-red-bg text-red',
};

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - new Date().getTime()) / 86400000);
}

export function AdminConsole() {
  const { camps, deletedCamps, orgs, loading, load } = useAdminStore();
  const openCampAsAdmin = useCampStore((s) => s.openCampAsAdmin);
  const navigate = useNavigate();
  const [modal, setModal] = useState<'customer' | 'trial' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCamp | null>(null);

  useEffect(() => { load(); }, [load]);

  async function open(campId: string) {
    await openCampAsAdmin(campId);
    navigate('/home');
  }

  const byType = (t: string) => camps.filter((c) => c.accountType === t).length;

  return (
    <div className="min-h-screen bg-cream w-full">
      <div className="bg-forest text-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-sage rounded-btn flex items-center justify-center"><TreePine className="w-4.5 h-4.5 text-forest" /></div>
            <div>
              <p className="text-[15px] font-semibold">CampCommand — Admin</p>
              <p className="text-[11px] text-white/50">{camps.length} camps · {byType('customer')} customers · {byType('trial')} trials · {byType('demo')} demo</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="!text-cream border border-white/25 hover:bg-white/10" onClick={() => setModal('trial')}>
              <FlaskConical className="w-3.5 h-3.5" /> Spin up trial
            </Button>
            <Button size="sm" onClick={() => setModal('customer')}>
              <Plus className="w-3.5 h-3.5" /> Provision customer
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <PlatformAdmins />
        <OrgQuickAdd />
        {loading ? (
          <p className="text-[13px] text-forest/50 py-10 text-center">Loading…</p>
        ) : (
          <div className="bg-white rounded-card border border-border overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="bg-cream-dark/40 text-[10px] font-semibold uppercase tracking-widest text-forest/45">
                  <th className="text-left px-4 py-2.5">Camp</th>
                  <th className="text-left px-3 py-2.5">Type</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-3 py-2.5">Plan</th>
                  <th className="text-left px-3 py-2.5">Members</th>
                  <th className="text-left px-3 py-2.5">Trial</th>
                  <th className="text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {camps.map((c) => <CampRow key={c.id} c={c} orgs={orgs} onOpen={() => open(c.id)} onDelete={() => setDeleteTarget(c)} />)}
              </tbody>
            </table>
          </div>
        )}

        {deletedCamps.length > 0 && <DeletedCamps camps={deletedCamps} />}
      </div>

      {modal === 'customer' && <ProvisionCustomerModal onClose={() => setModal(null)} />}
      {modal === 'trial' && <SpinUpTrialModal onClose={() => setModal(null)} />}
      {deleteTarget && <DeleteCampModal camp={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  );
}

function CampRow({ c, orgs, onOpen, onDelete }: { c: AdminCamp; orgs: { id: string; name: string }[]; onOpen: () => void; onDelete: () => void }) {
  const { setStatus, extendTrial, convertTrialToCustomer, setPlan, setSeed, setCampOrg } = useAdminStore();
  const [busy, setBusy] = useState(false);
  const dl = daysLeft(c.trialEndsAt);
  const wrap = (fn: () => Promise<void>) => async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <tr className="border-t border-cream-dark align-top">
      <td className="px-4 py-3">
        <p className="font-semibold text-forest">{c.name}{c.isSeed && <span className="ml-1.5 text-[10px] text-sage font-semibold uppercase">seed</span>}</p>
        <p className="text-[11px] text-forest/40">{orgs.find((o) => o.id === c.orgId)?.name ?? 'No org'}</p>
      </td>
      <td className="px-3 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${TYPE_STYLE[c.accountType]}`}>{c.accountType}</span></td>
      <td className="px-3 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${STATUS_STYLE[c.status]}`}>{c.status.replace('_', ' ')}</span></td>
      <td className="px-3 py-3">
        <input defaultValue={c.plan ?? ''} placeholder="—" onBlur={(e) => e.target.value !== (c.plan ?? '') && setPlan(c.id, e.target.value.trim() || null)}
          className="w-24 text-[12px] bg-transparent border border-transparent hover:border-border focus:border-sage rounded px-1 py-0.5 focus:outline-none" />
      </td>
      <td className="px-3 py-3 text-forest/60">{c.memberCount}</td>
      <td className="px-3 py-3 text-forest/60">{c.accountType === 'trial' && dl != null ? (dl >= 0 ? `${dl}d left` : 'expired') : '—'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5 justify-end">
          <Button size="sm" variant="ghost" disabled={busy} onClick={onOpen}><LogIn className="w-3.5 h-3.5" /> Open</Button>
          {c.status === 'active'
            ? <Button size="sm" variant="ghost" disabled={busy} onClick={wrap(() => setStatus(c.id, 'suspended'))}>Suspend</Button>
            : <Button size="sm" variant="ghost" disabled={busy} onClick={wrap(() => setStatus(c.id, 'active'))}>Reactivate</Button>}
          {c.accountType === 'trial' && (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={wrap(() => extendTrial(c.id, 30))}>+30d</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={wrap(() => convertTrialToCustomer(c.id, c.plan))}>→ Customer</Button>
            </>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={wrap(() => setSeed(c.id, !c.isSeed))}>{c.isSeed ? 'Unseed' : 'Set seed'}</Button>
          {orgs.length > 0 && (
            <select value={c.orgId ?? ''} onChange={(e) => setCampOrg(c.id, e.target.value || null)}
              className="text-[11px] border border-border rounded px-1 py-0.5 bg-white focus:outline-none focus:border-sage">
              <option value="">No org</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 text-[12px] text-red/80 hover:text-red px-2 py-1 rounded-btn hover:bg-red-bg transition-colors" title="Delete camp">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function DeleteCampModal({ camp, onClose }: { camp: AdminCamp; onClose: () => void }) {
  const { deleteCamp } = useAdminStore();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const match = typed.trim() === camp.name;

  async function confirm() {
    if (!match) return;
    setBusy(true); setErr(null);
    try { await deleteCamp(camp.id); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); setBusy(false); }
  }

  return (
    <Modal title="Delete camp" onClose={onClose} width="460px">
      <div className="space-y-4">
        <div className="bg-red-bg border border-red/20 rounded-card px-4 py-3 text-[13px] text-red-text leading-relaxed">
          This moves <span className="font-semibold">{camp.name}</span> and all its data to the trash. It’s
          <span className="font-semibold"> recoverable for 30 days</span>, then permanently deleted. Members lose access immediately.
        </div>
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-forest/45 mb-1">
            Type <span className="text-forest normal-case font-bold">{camp.name}</span> to confirm
          </label>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className={INPUT} placeholder={camp.name} />
        </div>
        {err && <p className="text-[12px] text-red">{err}</p>}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1 justify-center !bg-red hover:!bg-red/90" disabled={!match || busy} onClick={confirm}>
            {busy ? 'Deleting…' : 'Delete camp'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function DeletedCamps({ camps }: { camps: AdminCamp[] }) {
  const { restoreCamp } = useAdminStore();
  return (
    <div className="mt-6">
      <h2 className="text-[12px] font-semibold uppercase tracking-widest text-forest/40 mb-2">Recently deleted (auto-purges after 30 days)</h2>
      <div className="bg-white rounded-card border border-border divide-y divide-cream-dark">
        {camps.map((c) => {
          const purgeDays = c.deletedAt ? Math.max(0, 30 + Math.ceil((new Date(c.deletedAt).getTime() - new Date().getTime()) / 86400000)) : 0;
          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <Trash2 className="w-4 h-4 text-forest/30 flex-shrink-0" />
              <span className="font-medium text-forest flex-1 truncate">{c.name}</span>
              <span className="text-[11px] text-forest/45">{purgeDays} day{purgeDays === 1 ? '' : 's'} until permanent deletion</span>
              <Button size="sm" variant="ghost" onClick={() => restoreCamp(c.id)}>Restore</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlatformAdmins() {
  const { platformAdmins, addPlatformAdmin, removePlatformAdmin } = useAdminStore();
  const myId = useAuthStore((s) => s.user?.id);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    try { await addPlatformAdmin(email); setEmail(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-card border border-border p-4 mb-4">
      <div className="flex items-center gap-2 mb-2.5">
        <ShieldCheck className="w-4 h-4 text-forest" />
        <h2 className="text-[13px] font-semibold text-forest">Platform admins (founders / super-admins)</h2>
      </div>
      <p className="text-[11px] text-forest/50 mb-3">Full access to this console and every camp. Add someone only after they've signed in once.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {platformAdmins.map((a) => (
          <span key={a.userId} className="inline-flex items-center gap-1.5 bg-cream border border-border rounded-full pl-3 pr-1.5 py-1 text-[12px] text-forest">
            {a.email}{a.userId === myId && <span className="text-[10px] font-semibold text-sage uppercase">you</span>}
            {a.userId !== myId && (
              <button onClick={() => removePlatformAdmin(a.userId)} className="text-forest/30 hover:text-red p-0.5" title={`Remove ${a.email}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
        {platformAdmins.length === 0 && <span className="text-[12px] text-forest/40">No platform admins loaded.</span>}
      </div>
      <div className="flex items-center gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="founder@campcommand.app"
          className="flex-1 max-w-xs text-[13px] bg-white border border-border rounded-btn px-3 py-1.5 focus:outline-none focus:border-sage" />
        <Button size="sm" variant="ghost" disabled={busy || !email.trim()} onClick={add}>
          <Plus className="w-3.5 h-3.5" /> Add super-admin
        </Button>
      </div>
      {err && <p className="text-[12px] text-red mt-2">{err}</p>}
    </div>
  );
}

function OrgQuickAdd() {
  const { createOrg } = useAdminStore();
  const [name, setName] = useState('');
  return (
    <div className="flex items-center gap-2 mb-4">
      <Building2 className="w-4 h-4 text-forest/40" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New organization (for multi-camp networks)…"
        className="flex-1 max-w-sm text-[13px] bg-white border border-border rounded-btn px-3 py-1.5 focus:outline-none focus:border-sage" />
      <Button size="sm" variant="ghost" disabled={!name.trim()} onClick={async () => { await createOrg(name.trim()); setName(''); }}>Add org</Button>
    </div>
  );
}

function InviteResult({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-green-muted-bg border border-sage/30 rounded-card p-4">
      <p className="text-[13px] font-semibold text-green-muted-text mb-1.5">Created ✓ — send this invite link to the buyer:</p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="flex-1 text-[12px] font-mono bg-white border border-border rounded-btn px-2.5 py-1.5" />
        <Button size="sm" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <p className="text-[11px] text-forest/45 mt-2">They open it, set a password, and become the camp admin.</p>
    </div>
  );
}

function ProvisionCustomerModal({ onClose }: { onClose: () => void }) {
  const { orgs, provisionCustomer } = useAdminStore();
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [orgId, setOrgId] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !email.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { inviteUrl } = await provisionCustomer({ name: name.trim(), plan: plan.trim() || null, orgId: orgId || null, buyerEmail: email.trim() });
      setResult(inviteUrl);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  }

  return (
    <Modal title="Provision a customer" onClose={onClose} width="480px">
      {result ? <div className="space-y-4"><InviteResult url={result} /><Button className="w-full justify-center" onClick={onClose}>Done</Button></div> : (
        <div className="space-y-3.5">
          <Field label="Camp name *"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. Camp Pinecrest" /></Field>
          <Field label="Plan (label, optional)"><input value={plan} onChange={(e) => setPlan(e.target.value)} className={INPUT} placeholder="e.g. Standard – founding" /></Field>
          <Field label="Organization (optional)">
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={INPUT}>
              <option value="">None</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Buyer email (camp admin) *"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} placeholder="director@camp.org" /></Field>
          {err && <p className="text-[12px] text-red">{err}</p>}
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 justify-center" disabled={busy || !name.trim() || !email.trim()} onClick={submit}>{busy ? 'Provisioning…' : 'Provision + invite'}</Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SpinUpTrialModal({ onClose }: { onClose: () => void }) {
  const { camps, spinUpTrial } = useAdminStore();
  const seeds = camps.filter((c) => c.isSeed);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState(seeds[0]?.id ?? camps[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !email.trim() || !source) return;
    setBusy(true); setErr(null);
    try {
      const { inviteUrl } = await spinUpTrial({ name: name.trim(), sourceCampId: source, buyerEmail: email.trim() });
      setResult(inviteUrl);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  }

  return (
    <Modal title="Spin up a trial" onClose={onClose} width="480px">
      {result ? <div className="space-y-4"><InviteResult url={result} /><Button className="w-full justify-center" onClick={onClose}>Done</Button></div> : (
        <div className="space-y-3.5">
          <p className="text-[12px] text-forest/55 bg-cream-dark/40 rounded-btn px-3 py-2">A fresh 30-day trial is cloned from the seed camp — fake data only. The prospect gets an admin invite.</p>
          <Field label="Prospect / camp name *"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. Maplewood (trial)" /></Field>
          <Field label="Seed to clone *">
            <select value={source} onChange={(e) => setSource(e.target.value)} className={INPUT}>
              {seeds.length === 0 && <option value="" disabled>No seed marked — pick any camp below or mark one “seed”</option>}
              {(seeds.length ? seeds : camps).map((c) => <option key={c.id} value={c.id}>{c.name}{c.isSeed ? ' (seed)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Prospect email (trial admin) *"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} placeholder="coordinator@prospect.org" /></Field>
          {err && <p className="text-[12px] text-red">{err}</p>}
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 justify-center" disabled={busy || !name.trim() || !email.trim() || !source} onClick={submit}>{busy ? 'Cloning…' : 'Spin up + invite'}</Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const INPUT = 'w-full text-[14px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[12px] font-semibold uppercase tracking-wide text-forest/45 mb-1">{label}</label>{children}</div>;
}
