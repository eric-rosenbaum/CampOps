import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Copy, Check, Trash2, Plus, Link2, Mail } from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import type { CampRole, Department, Invitation, JoinCode } from '@/store/campStore';

const ROLE_LABELS: Record<CampRole, string> = {
  admin: 'Admin', staff: 'Staff', viewer: 'Viewer',
};

const DEPT_LABELS: Record<string, string> = {
  waterfront: 'Waterfront', maintenance: 'Maintenance', kitchen: 'Kitchen',
  administration: 'Administration', health: 'Health', program: 'Program', other: 'Other',
};

export function Team() {
  const {
    currentCamp, currentMember, members,
    inviteMember, removeMember, updateMemberRole,
    loadInvitations, revokeInvitation,
    loadJoinCodes, generateJoinCode, revokeJoinCode,
  } = useCampStore();
  const campId = currentCamp?.id ?? '';

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [joinCodes, setJoinCodes] = useState<JoinCode[]>([]);

  // Invite by email
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CampRole>('staff');
  const [inviteDept, setInviteDept] = useState<Department | ''>('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkEmail, setInviteLinkEmail] = useState('');

  // Join code form
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [codeRole, setCodeRole] = useState<CampRole>('staff');
  const [codeDept, setCodeDept] = useState<Department | ''>('');
  const [codeDays, setCodeDays] = useState('30');
  const [codeMaxUses, setCodeMaxUses] = useState('');
  const [codeGenerating, setCodeGenerating] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!campId) return;
    const [inv, codes] = await Promise.all([
      loadInvitations(campId),
      loadJoinCodes(campId),
    ]);
    setInvitations(inv);
    setJoinCodes(codes);
  }, [campId, loadInvitations, loadJoinCodes]);

  useEffect(() => { reload(); }, [reload]);

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const token = await inviteMember(campId, inviteEmail, inviteRole, (inviteDept as Department) || null);
      setInviteLinkEmail(inviteEmail);
      setInviteLink(`${window.location.origin}/invite/${token}`);
      setInviteEmail('');
      setInviteDept('');
      setShowInviteForm(false);
      reload();
    } catch (err) {
      console.error(err);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleGenerateCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeGenerating(true);
    try {
      await generateJoinCode(campId, codeRole, (codeDept as Department) || null, codeMaxUses ? parseInt(codeMaxUses) : null, parseInt(codeDays));
      setShowCodeForm(false);
      setCodeMaxUses('');
      reload();
    } catch (err) {
      console.error(err);
    } finally {
      setCodeGenerating(false);
    }
  }

  function joinCodeUrl(code: string) {
    return `${window.location.origin}/join?code=${code}`;
  }

  function mailtoHref(email: string, link: string) {
    const subject = encodeURIComponent(`You're invited to join ${currentCamp?.name ?? 'your camp'} on CampCommand`);
    const body = encodeURIComponent(
      `Hi,\n\nYou've been invited to join ${currentCamp?.name ?? 'your camp'} on CampCommand.\n\nClick the link below to create your account and get started:\n${link}\n\nThis invitation expires in 7 days.\n\nSee you there!`
    );
    return `mailto:${email}?subject=${subject}&body=${body}`;
  }

  function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) return 'No expiry';
    const d = new Date(expiresAt);
    const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires ${d.toLocaleDateString()}`;
  }


  return (
    <div className="p-7 max-w-3xl">
      <div className="mb-7">
        <h1 className="text-[20px] font-bold text-forest">Team</h1>
        <p className="text-[12px] text-forest/50 mt-0.5">{members.length} active member{members.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Active members */}
      <div className="bg-white border border-stone-200 rounded-xl mb-6">
        <div className="px-5 py-4 border-b border-stone-100">
          <h2 className="text-[13px] font-semibold text-forest">Active members</h2>
        </div>
        <div className="divide-y divide-stone-100">
          {members.map((m) => (
            <div key={m.id} className="px-5 py-3 flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-forest text-cream text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                {m.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-forest truncate">{m.fullName}</p>
                {m.department && (
                  <p className="text-[11px] text-forest/40">{DEPT_LABELS[m.department] ?? m.department}</p>
                )}
              </div>
              <select
                value={m.role}
                disabled={m.userId === currentMember?.userId}
                onChange={(e) => updateMemberRole(m.id, e.target.value as CampRole, m.department).then(reload)}
                className="text-[12px] border border-stone-200 rounded-md px-2 py-1 text-forest bg-white disabled:opacity-50"
              >
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {m.userId !== currentMember?.userId && (
                <button
                  onClick={async () => {
                    if (!confirm('Remove this member from the camp?')) return;
                    await removeMember(m.id);
                    reload();
                  }}
                  className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invite + Join links side by side */}
      <div className="grid grid-cols-2 gap-4 mb-6">

        {/* Invite by email */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-forest mb-0.5">Invite by email</h2>
          <p className="text-[11px] text-forest/40 leading-relaxed mb-4">
            For specific people. Works for any role — the link is tied to their email address, so only they can use it.
          </p>

          {!showInviteForm && !inviteLink && (
            <button
              onClick={() => setShowInviteForm(true)}
              className="flex items-center gap-2 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-forest/90 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Invite someone
            </button>
          )}

          {showInviteForm && !inviteLink && (
            <form onSubmit={handleInvite} className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Email address</label>
                <input
                  type="email" required autoFocus value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-forest/60 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => { setInviteRole(e.target.value as CampRole); setInviteDept(''); }}
                    className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                  >
                    {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {inviteRole === 'staff' && (
                  <div>
                    <label className="block text-[11px] font-medium text-forest/60 mb-1">Department</label>
                    <select
                      value={inviteDept}
                      onChange={(e) => setInviteDept(e.target.value as Department)}
                      className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                    >
                      <option value="">None</option>
                      {Object.entries(DEPT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowInviteForm(false)} className="text-[12px] text-forest/40 hover:text-forest px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={inviteLoading} className="flex-1 bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50">
                  {inviteLoading ? 'Generating…' : 'Generate link'}
                </button>
              </div>
            </form>
          )}

          {inviteLink && (
            <div>
              <p className="text-[11px] text-forest/50 mb-2">
                Share this link with <strong>{inviteLinkEmail}</strong>:
              </p>
              <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 mb-2.5">
                <code className="text-[10px] text-forest break-all leading-relaxed">{inviteLink}</code>
              </div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => handleCopy(inviteLink, 'invite-link')}
                  className="flex items-center gap-1.5 text-[11px] text-forest font-medium px-2.5 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
                >
                  {copiedId === 'invite-link' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copiedId === 'invite-link' ? 'Copied!' : 'Copy link'}
                </button>
                <a
                  href={mailtoHref(inviteLinkEmail, inviteLink)}
                  className="flex items-center gap-1.5 text-[11px] text-forest font-medium px-2.5 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
                >
                  <Mail className="w-3 h-3" />
                  Open in email
                </a>
              </div>
              <button
                onClick={() => { setInviteLink(null); setInviteLinkEmail(''); setShowInviteForm(true); }}
                className="text-[11px] text-forest/40 hover:text-forest transition-colors"
              >
                + Invite another person
              </button>
            </div>
          )}
        </div>

        {/* Staff join links */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-forest mb-0.5">Staff join links</h2>
          <p className="text-[11px] text-forest/40 leading-relaxed mb-4">
            Share with a group — anyone with the link can join as Staff or Viewer. Admins must be invited individually.
          </p>

          {!showCodeForm && (
            <button
              onClick={() => setShowCodeForm(true)}
              className="flex items-center gap-2 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-forest/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create join link
            </button>
          )}

          {showCodeForm && (
            <form onSubmit={handleGenerateCode} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-forest/60 mb-1">Role</label>
                  <select
                    value={codeRole}
                    onChange={(e) => { setCodeRole(e.target.value as CampRole); setCodeDept(''); }}
                    className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                  >
                    <option value="staff">Staff</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-forest/60 mb-1">Expires (days)</label>
                  <input
                    type="number" min="1" max="365" required value={codeDays}
                    onChange={(e) => setCodeDays(e.target.value)}
                    className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                  />
                </div>
              </div>
              {codeRole === 'staff' && (
                <div>
                  <label className="block text-[11px] font-medium text-forest/60 mb-1">Department (optional)</label>
                  <select
                    value={codeDept}
                    onChange={(e) => setCodeDept(e.target.value as Department)}
                    className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                  >
                    <option value="">None</option>
                    {Object.entries(DEPT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Max uses (blank = unlimited)</label>
                <input
                  type="number" min="1" value={codeMaxUses}
                  onChange={(e) => setCodeMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCodeForm(false)} className="text-[12px] text-forest/40 hover:text-forest px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={codeGenerating} className="flex-1 bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50">
                  {codeGenerating ? 'Creating…' : 'Create link'}
                </button>
              </div>
            </form>
          )}

          {joinCodes.length > 0 && (
            <div className="mt-4 space-y-2">
              {joinCodes.map((jc) => {
                const url = joinCodeUrl(jc.code);
                return (
                  <div key={jc.id} className="border border-stone-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <code className="text-[11px] font-mono font-bold text-forest tracking-widest">{jc.code}</code>
                          <span className="text-[10px] text-forest/30">·</span>
                          <span className="text-[10px] text-forest/50">
                            {ROLE_LABELS[jc.role]}{jc.department ? ` · ${DEPT_LABELS[jc.department] ?? jc.department}` : ''}
                          </span>
                        </div>
                        <p className="text-[10px] text-forest/40">
                          {jc.useCount}{jc.maxUses ? `/${jc.maxUses}` : ''} use{jc.useCount !== 1 ? 's' : ''} · {formatExpiry(jc.expiresAt)}
                        </p>
                        <button
                          onClick={() => handleCopy(url, jc.id)}
                          className="mt-1.5 flex items-center gap-1 text-[10px] text-forest/50 hover:text-forest transition-colors"
                        >
                          {copiedId === jc.id
                            ? <><Check className="w-2.5 h-2.5 text-green-600" /> Copied!</>
                            : <><Link2 className="w-2.5 h-2.5" /> Copy join link</>}
                        </button>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm('Revoke this join link? Anyone who has it will no longer be able to use it.')) return;
                          await revokeJoinCode(jc.id);
                          reload();
                        }}
                        className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="text-[13px] font-semibold text-forest">Pending invitations</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {invitations.map((inv) => {
              const link = `${window.location.origin}/invite/${inv.token}`;
              return (
                <div key={inv.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-forest truncate">{inv.email}</p>
                    <p className="text-[11px] text-forest/40">
                      {ROLE_LABELS[inv.role]}{inv.department ? ` · ${DEPT_LABELS[inv.department] ?? inv.department}` : ''} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(link, `inv-${inv.id}`)}
                    className="flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest transition-colors flex-shrink-0"
                  >
                    {copiedId === `inv-${inv.id}` ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copiedId === `inv-${inv.id}` ? 'Copied!' : 'Copy link'}
                  </button>
                  <a
                    href={mailtoHref(inv.email, link)}
                    className="flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest transition-colors flex-shrink-0"
                  >
                    <Mail className="w-3 h-3" />
                    Send email
                  </a>
                  <button
                    onClick={async () => { await revokeInvitation(inv.id); reload(); }}
                    className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
