import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Trash2, Copy, Check } from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import type { MemberWithProfile, CampRole, Department, Invitation } from '@/store/campStore';

const ROLE_LABELS: Record<CampRole, string> = {
  admin: 'Admin', staff: 'Staff', viewer: 'Viewer',
};

const DEPT_LABELS: Record<string, string> = {
  waterfront: 'Waterfront', maintenance: 'Maintenance', kitchen: 'Kitchen',
  administration: 'Administration', health: 'Health', program: 'Program', other: 'Other',
};

export function Members() {
  const { currentCamp, currentMember, loadMembers, inviteMember, removeMember, updateMemberRole, loadInvitations, revokeInvitation } = useCampStore();
  const campId = currentCamp?.id ?? '';

  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CampRole>('staff');
  const [inviteDept, setInviteDept] = useState<Department | ''>('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    if (!campId) return;
    const [m, i] = await Promise.all([loadMembers(campId), loadInvitations(campId)]);
    setMembers(m);
    setInvitations(i);
    setLoading(false);
  }, [campId, loadMembers, loadInvitations]);

  useEffect(() => { reload(); }, [reload]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const token = await inviteMember(campId, inviteEmail, inviteRole, inviteDept as Department | null || null);
      const link = `${window.location.origin}/invite/${token}`;
      setInviteLink(link);
      setInviteEmail('');
      reload();
    } catch (err) {
      console.error(err);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRemove(memberId: string) {
    if (!confirm('Remove this member from the camp?')) return;
    await removeMember(memberId);
    reload();
  }

  async function handleRoleChange(memberId: string, role: CampRole, dept: Department | null) {
    await updateMemberRole(memberId, role, dept);
    reload();
  }

  if (loading) {
    return <div className="p-7 text-[13px] text-forest/40">Loading members…</div>;
  }

  return (
    <div className="p-7 max-w-3xl">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[20px] font-bold text-forest">Members</h1>
          <p className="text-[12px] text-forest/50 mt-0.5">{members.length} active member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowInviteForm(!showInviteForm); setInviteLink(null); }}
          className="flex items-center gap-2 bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-forest/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Invite
        </button>
      </div>

      {showInviteForm && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
          <h2 className="text-[14px] font-semibold text-forest mb-4">Send invitation</h2>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Email address</label>
                <input
                  type="email" required value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CampRole)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            {inviteRole === 'staff' && (
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Department</label>
                <select
                  value={inviteDept}
                  onChange={(e) => setInviteDept(e.target.value as Department)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  <option value="">None</option>
                  {Object.entries(DEPT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}
            <button
              type="submit"
              disabled={inviteLoading}
              className="bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
            >
              {inviteLoading ? 'Generating…' : 'Generate invitation link'}
            </button>
          </form>

          {inviteLink && (
            <div className="mt-4 p-3 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-[11px] font-medium text-forest/60 mb-2">Invitation link — share this with the invitee:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] text-forest break-all">{inviteLink}</code>
                <button onClick={() => handleCopy(inviteLink)} className="flex-shrink-0 p-1.5 rounded hover:bg-stone-200 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-forest/50" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active members */}
      <div className="bg-white border border-stone-200 rounded-xl mb-5">
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
                <p className="text-[13px] font-medium text-forest">{m.fullName}</p>
                {m.department && (
                  <p className="text-[11px] text-forest/40">{DEPT_LABELS[m.department] ?? m.department}</p>
                )}
              </div>
              <select
                value={m.role}
                disabled={m.userId === currentMember?.userId}
                onChange={(e) => handleRoleChange(m.id, e.target.value as CampRole, m.department)}
                className="text-[12px] border border-stone-200 rounded-md px-2 py-1 text-forest disabled:opacity-50"
              >
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {m.userId !== currentMember?.userId && (
                <button
                  onClick={() => handleRemove(m.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="text-[13px] font-semibold text-forest">Pending invitations</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {invitations.map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-forest">{inv.email}</p>
                  <p className="text-[11px] text-forest/40">
                    {ROLE_LABELS[inv.role]} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(`${window.location.origin}/invite/${inv.token}`)}
                  className="text-[12px] text-forest/50 hover:text-forest flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy link
                </button>
                <button
                  onClick={async () => { await revokeInvitation(inv.id); reload(); }}
                  className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
