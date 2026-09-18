import { useEffect, useState, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  UserPlus, Copy, Check, Trash2, Plus, Link2, Mail,
  Pencil, ChevronDown, ChevronUp, Shield, Users,
} from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import type { CampRole, StaffGroup, Invitation, JoinCode } from '@/store/campStore';
import { sendEmail, buildInviteEmail } from '@/lib/email';
import { BulkInviteForm } from '@/components/settings/BulkInviteForm';
import { seedCrewName } from '@/lib/useTrades';
import { formatDate } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: CampRole[] = ['admin', 'staff', 'viewer'];

/**
 * A crew as the reader should see it: the camp's own words as typed, except the five seed crews
 * under their seed names, which were ours and read in the reader's language. Display only — an
 * edit input shows `group.name`, or saving the form would write Spanish into the row.
 */
function crewLabel(g: Pick<StaffGroup, 'key' | 'name'>): string {
  return seedCrewName(g.key, g.name) ?? g.name;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModuleBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-forest/8 text-ink-soft border border-forest/10">
      {label}
    </span>
  );
}

interface GroupFormProps {
  initial?: { name: string; issuesSeeUnassigned: boolean; canViewCamperHealth: boolean };
  onSave: (name: string, issuesSeeUnassigned: boolean, canViewCamperHealth: boolean) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  /** Surfaced from the save handler. Without this a rejected save is invisible. */
  error?: string | null;
}

function GroupForm({ initial, onSave, onCancel, saving, error }: GroupFormProps) {
  const { t } = useTranslation(['team', 'common']);
  const [name, setName] = useState(initial?.name ?? '');
  const [issuesSeeUnassigned, setIssuesSeeUnassigned] = useState(initial?.issuesSeeUnassigned ?? true);
  const [canViewCamperHealth, setCanViewCamperHealth] = useState(initial?.canViewCamperHealth ?? false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave(name.trim(), issuesSeeUnassigned, canViewCamperHealth);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-ink-soft mb-1">{t('form.name')}</label>
        <input
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('form.namePlaceholder')}
          className="w-full px-3 py-1.5 border border-border rounded-lg text-[12px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20"
        />
      </div>

      {/* What a crew decides is whose work you can see. It used to also decide which modules
          you could open at all, which made setting a camp up an exercise in guessing who might
          one day need the pool page. */}
      <div className="bg-paper border border-border rounded-lg px-3 py-2.5">
        <p className="text-[11px] font-medium text-ink-soft mb-1.5">{t('form.sees')}</p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="crew-visibility"
            checked={issuesSeeUnassigned}
            onChange={() => setIssuesSeeUnassigned(true)}
            className="w-3.5 h-3.5 accent-forest mt-0.5"
          />
          <span className="text-[12px] text-forest">
            {t('form.pickUp')}
            <span className="block text-[11px] text-ink-soft mt-0.5">
              {t('form.pickUpHint')}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer mt-2">
          <input
            type="radio"
            name="crew-visibility"
            checked={!issuesSeeUnassigned}
            onChange={() => setIssuesSeeUnassigned(false)}
            className="w-3.5 h-3.5 accent-forest mt-0.5"
          />
          <span className="text-[12px] text-forest">
            {t('form.own')}
            <span className="block text-[11px] text-ink-soft mt-0.5">
              {t('form.ownHint')}
            </span>
          </span>
        </label>
      </div>

      {(

        <div className="bg-red-bg border border-red/20 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-[11px] font-medium text-red/80 mb-1">{t('form.healthTitle')}</p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={canViewCamperHealth}
              onChange={(e) => setCanViewCamperHealth(e.target.checked)}
              className="w-3.5 h-3.5 accent-forest mt-0.5"
            />
            <span className="text-[12px] text-forest">
              {t('form.health')}
              <span className="block text-[11px] text-ink-soft mt-0.5 leading-relaxed">
                {t('form.healthHint')}
              </span>
            </span>
          </label>
        </div>
      )}

      {error && (
        <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-ink-faint hover:text-forest px-3 py-1.5 rounded-lg hover:bg-paper transition-colors"
        >
          {t('common:actions.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex-1 bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
        >
          {saving ? t('common:actions.saving') : (initial ? t('form.saveChanges') : t('form.create'))}
        </button>
      </div>
    </form>
  );
}

interface AddLinkFormProps {
  onSave: (maxUses: number | null, days: number) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function AddLinkForm({ onSave, onCancel, saving }: AddLinkFormProps) {
  const { t } = useTranslation(['team', 'common']);
  const [days, setDays] = useState('30');
  const [maxUses, setMaxUses] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave(maxUses ? parseInt(maxUses) : null, parseInt(days));
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2">
      <div>
        <label className="block text-[10px] font-medium text-ink-soft mb-0.5">{t('links.expiresDays')}</label>
        <input
          type="number" min="1" max="365" required value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-20 px-2 py-1 border border-border rounded-lg text-[11px] text-forest focus:outline-none focus:ring-1 focus:ring-forest/20"
        />
      </div>
      <div>
        <label className="block text-[10px] font-medium text-ink-soft mb-0.5">{t('links.maxUses')}</label>
        <input
          type="number" min="1" value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="∞"
          className="w-16 px-2 py-1 border border-border rounded-lg text-[11px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-1 focus:ring-forest/20"
        />
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-[11px] text-ink-faint hover:text-forest px-2 py-1 rounded transition-colors"
      >
        {t('common:actions.cancel')}
      </button>
      <button
        type="submit"
        disabled={saving}
        className="bg-forest text-cream text-[11px] font-medium px-3 py-1 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
      >
        {saving ? '…' : t('links.create')}
      </button>
    </form>
  );
}

// ─── CrewRoster ────────────────────────────────────────────────────────────────

/**
 * Who is on this crew.
 *
 * Membership is many-to-many on purpose. A crew is also a kind of work, and a camp with three
 * staff still has five kinds of work — so Sam is on Maintenance, Grounds and Tech at once rather
 * than the camp collapsing three categories it actually tracks.
 */
function CrewRoster({ group, campId }: { group: StaffGroup; campId: string }) {
  const { t } = useTranslation('team');
  const members = useCampStore((s) => s.members);
  const crewMembership = useCampStore((s) => s.crewMembership);
  const setCrewMembers = useCampStore((s) => s.setCrewMembers);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCrew = crewMembership[group.id] ?? [];
  const assignable = members
    .filter((m) => m.isActive && m.role !== 'viewer')
    .sort((a, b) => (a.displayName ?? a.fullName ?? '').localeCompare(b.displayName ?? b.fullName ?? ''));

  async function toggle(userId: string) {
    setSaving(userId);
    setError(null);
    const next = onCrew.includes(userId) ? onCrew.filter((u) => u !== userId) : [...onCrew, userId];
    try {
      await setCrewMembers(campId, group.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('roster.errorSave'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mb-3">
      <p className="text-[11px] font-medium text-ink-soft mb-1.5">
        {onCrew.length > 0 ? t('roster.titleCount', { count: onCrew.length }) : t('roster.title')}
      </p>
      {assignable.length === 0 ? (
        <p className="text-[11px] text-forest/30 italic">{t('roster.nobodyToAdd')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignable.map((m) => {
            const on = onCrew.includes(m.userId);
            return (
              <button
                key={m.userId}
                onClick={() => toggle(m.userId)}
                disabled={saving === m.userId}
                className={`px-2.5 py-1 rounded-full text-[11.5px] border transition-colors disabled:opacity-50 ${
                  on
                    ? 'bg-forest/10 border-forest/30 text-forest font-medium'
                    : 'bg-white border-border text-ink-soft hover:border-forest/30'
                }`}
              >
                {on && <Check className="w-3 h-3 inline -mt-px me-1" />}
                {m.displayName ?? m.fullName}
              </button>
            );
          })}
        </div>
      )}
      {onCrew.length === 0 && assignable.length > 0 && (
        <p className="text-[11px] text-ink-faint mt-1.5">
          {t('roster.nobodyHere', { crew: crewLabel(group).toLowerCase() })}
        </p>
      )}
      {error && <p className="text-[11px] text-red mt-1.5">{error}</p>}
    </div>
  );
}

// ─── StaffGroupCard ────────────────────────────────────────────────────────────

interface StaffGroupCardProps {
  group: StaffGroup;
  joinCodes: JoinCode[];
  campId: string;
  onUpdated: () => void;
}

function StaffGroupCard({ group, joinCodes, campId, onUpdated }: StaffGroupCardProps) {
  const { t } = useTranslation('team');
  const { generateJoinCode, revokeJoinCode, updateStaffGroup, deleteStaffGroup } = useCampStore();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const groupCodes = joinCodes.filter((c) => c.staffGroupId === group.id);

  function joinCodeUrl(code: string) {
    return `${window.location.origin}/join?code=${code}`;
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) return t('links.noExpiry');
    const d = new Date(expiresAt);
    const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (diffDays < 0) return t('links.expired');
    if (diffDays === 0) return t('links.expiresToday');
    if (diffDays === 1) return t('links.expiresTomorrow');
    return t('links.expiresOn', { date: formatDate(expiresAt) });
  }

  async function handleSaveEdit(
    name: string, issuesSeeUnassigned: boolean, canViewCamperHealth: boolean
  ) {
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateStaffGroup(group.id, { name, issuesSeeUnassigned, canViewCamperHealth });
      setEditing(false);
    } catch (err) {
      console.error('[handleSaveEdit]', err);
      setEditError(err instanceof Error ? err.message : t('crews.errorSave'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAddLink(maxUses: number | null, days: number) {
    setSavingLink(true);
    setLinkError(null);
    try {
      await generateJoinCode(campId, 'staff', group.id, maxUses, days);
      setShowAddLink(false);
      onUpdated();
    } catch (err) {
      console.error('[handleAddLink]', err);
      setLinkError(err instanceof Error ? err.message : t('links.errorCreate'));
    } finally {
      setSavingLink(false);
    }
  }

  async function handleDeleteGroup() {
    if (!confirm(t('crews.confirmDelete', { name: crewLabel(group) }))) return;
    try {
      await deleteStaffGroup(group.id);
    } catch (err) {
      console.error('[handleDeleteGroup]', err);
      setEditError(err instanceof Error ? err.message : t('crews.errorDelete'));
      setEditing(true); // surface the message; the form is where errors are rendered
    }
  }

  async function handleRevokeCode(codeId: string) {
    if (!confirm(t('links.confirmRevoke'))) return;
    await revokeJoinCode(codeId);
    onUpdated();
  }

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-forest/8 flex items-center justify-center flex-shrink-0">
          <Shield className="w-3.5 h-3.5 text-ink-soft" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-forest">{crewLabel(group)}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            <ModuleBadge label={group.issuesSeeUnassigned ? t('crews.badgePickUp') : t('crews.badgeOwn')} />
            {group.canViewCamperHealth && <ModuleBadge label={t('crews.badgeHealth')} />}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => { setEditing(true); setExpanded(true); }}
            className="p-1.5 rounded hover:bg-cream-dark text-ink-faint hover:text-forest transition-colors"
            title={t('crews.edit')}
            aria-label={t('crews.edit')}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteGroup}
            className="p-1.5 rounded hover:bg-red-50 text-ink-faint hover:text-red-500 transition-colors"
            title={t('crews.delete')}
            aria-label={t('crews.delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? t('crews.hideDetails') : t('crews.showDetails')}
            aria-expanded={expanded}
            className="p-1.5 rounded hover:bg-cream-dark text-ink-faint hover:text-forest transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-3">
          {editing ? (
            <GroupForm
              initial={{
                name: group.name,
                issuesSeeUnassigned: group.issuesSeeUnassigned,
                canViewCamperHealth: group.canViewCamperHealth,
              }}
              onSave={handleSaveEdit}
              onCancel={() => { setEditing(false); setEditError(null); }}
              saving={savingEdit}
              error={editError}
            />
          ) : (
            <>
              <div className="mb-3 text-[11px] text-ink-soft space-y-0.5">
                <p>{group.issuesSeeUnassigned ? t('crews.workPickUp') : t('crews.workOwn')}</p>
                <p>{group.canViewCamperHealth ? t('crews.healthVisible') : t('crews.healthAggregate')}</p>
              </div>

              <CrewRoster group={group} campId={campId} />

              {/* Join codes */}
              <p className="text-[11px] font-medium text-ink-soft mb-1.5">{t('links.title')}</p>
              {groupCodes.length === 0 && !showAddLink && (
                <p className="text-[11px] text-forest/30 italic mb-2">{t('links.none')}</p>
              )}
              {groupCodes.map((jc) => {
                const url = joinCodeUrl(jc.code);
                const codeKey = `${jc.id}-code`;
                const linkKey = `${jc.id}-link`;
                return (
                  <div key={jc.id} className="py-2.5 border-b border-stone-50 last:border-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-ink-faint">
                        <bdi>{jc.maxUses
                          ? t('links.usesOf', { count: jc.useCount, max: jc.maxUses })
                          : t('links.uses', { count: jc.useCount })}</bdi> · {formatExpiry(jc.expiresAt)}
                      </span>
                      <button
                        onClick={() => handleRevokeCode(jc.id)}
                        title={t('links.revoke')}
                        aria-label={t('links.revoke')}
                        className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Short code */}
                      <div className="flex items-center gap-1.5 bg-paper border border-border rounded-lg px-2.5 py-1.5 flex-shrink-0">
                        <code dir="ltr" className="text-[12px] font-mono font-bold text-forest tracking-widest">{jc.code}</code>
                        <button
                          onClick={() => handleCopy(jc.code, codeKey)}
                          className="text-ink-faint hover:text-forest transition-colors"
                          title={t('links.copyCode')}
                          aria-label={t('links.copyCode')}
                        >
                          {copiedId === codeKey
                            ? <Check className="w-3 h-3 text-green-600" />
                            : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <span className="text-[10px] text-forest/30">{t('links.or')}</span>
                      {/* Full link */}
                      <div className="flex items-center gap-1.5 bg-paper border border-border rounded-lg px-2.5 py-1.5 flex-1 min-w-0">
                        <Link2 className="w-3 h-3 text-forest/30 flex-shrink-0" />
                        <span dir="ltr" className="text-[11px] text-ink-soft truncate flex-1 text-start">{url}</span>
                        <button
                          onClick={() => handleCopy(url, linkKey)}
                          className="text-ink-faint hover:text-forest transition-colors flex-shrink-0"
                          title={t('links.copyLink')}
                          aria-label={t('links.copyLink')}
                        >
                          {copiedId === linkKey
                            ? <Check className="w-3 h-3 text-green-600" />
                            : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {showAddLink ? (
                <>
                  <AddLinkForm
                    onSave={handleAddLink}
                    onCancel={() => { setShowAddLink(false); setLinkError(null); }}
                    saving={savingLink}
                  />
                  {linkError && (
                    <p className="mt-1.5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{linkError}</p>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setShowAddLink(true)}
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-soft hover:text-forest transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {t('links.add')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Team() {
  const { t } = useTranslation(['team', 'common', 'shell']);
  const {
    currentCamp, currentMember, members,
    removeMember, updateMemberRole, staffGroups,
    createStaffGroup,
    inviteMember,
    loadInvitations, revokeInvitation,
    loadJoinCodes,
  } = useCampStore();
  const campId = currentCamp?.id ?? '';

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [joinCodes, setJoinCodes] = useState<JoinCode[]>([]);

  // Create group form
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Invite by email
  const [showBulkInvite, setShowBulkInvite] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CampRole>('staff');
  const [inviteGroupId, setInviteGroupId] = useState<string>('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkEmail, setInviteLinkEmail] = useState('');
  const [inviteEmailed, setInviteEmailed] = useState(false);
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const isAdmin = currentMember?.role === 'admin';

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

  // Pre-select first group when role switches to staff
  useEffect(() => {
    if (inviteRole === 'staff' && !inviteGroupId && staffGroups.length > 0) {
      setInviteGroupId(staffGroups[0].id);
    }
    if (inviteRole !== 'staff') setInviteGroupId('');
  }, [inviteRole, staffGroups]);

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleCreateGroup(
    name: string, issuesSeeUnassigned: boolean, canViewCamperHealth: boolean
  ) {
    setSavingGroup(true);
    setGroupError(null);
    try {
      await createStaffGroup(campId, name, issuesSeeUnassigned, canViewCamperHealth);
      setShowCreateGroup(false);
    } catch (err) {
      // Previously this had no catch: createStaffGroup throws on error, the rejection went
      // unhandled, and the button just flipped back to "Create group" with no explanation.
      console.error('[handleCreateGroup]', err);
      setGroupError(err instanceof Error ? err.message : t('crews.errorCreate'));
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(t('invite.timeout'))), 30_000)
      );
      const groupId = inviteRole === 'staff' ? inviteGroupId || null : null;
      const to = inviteEmail.trim();
      const token = await Promise.race([
        inviteMember(campId, to, inviteRole, groupId),
        timeout,
      ]);
      const link = `${window.location.origin}/invite/${token}`;
      // Send the invite email (same flow as customer provisioning), THEN reveal the result · so we
      // don't flash "couldn't send" before the send resolves. The link shows as a backup.
      const { subject, html } = buildInviteEmail(currentCamp?.name ?? 'your camp', link, { owner: false });
      const res = await sendEmail({ to, subject, html, fromName: currentCamp?.name ?? 'CampCommand', fromEmail: 'invites@campcommand.app' });
      setInviteEmailed(res.ok);
      setInviteEmailError(res.ok ? null : res.error);
      setInviteLinkEmail(to);
      setInviteLink(link);
      setInviteEmail('');
      setInviteGroupId('');
      setShowInviteForm(false);
      reload();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t('invite.errorLink'));
    } finally {
      setInviteLoading(false);
    }
  }

  // The invitation (this draft and the email sent through buildInviteEmail) stays English on
  // purpose: it goes to someone whose language nobody knows yet, not to the admin reading this
  // page, and following the admin's interface language would send Hebrew to an English speaker.
  function mailtoHref(email: string, link: string) {
    const subject = encodeURIComponent(`You're invited to join ${currentCamp?.name ?? 'your camp'} on CampCommand`);
    const body = encodeURIComponent(
      `Hi,\n\nYou've been invited to join ${currentCamp?.name ?? 'your camp'} on CampCommand.\n\nClick the link below to create your account and get started:\n${link}\n\nThis invitation expires in 7 days.\n\nSee you there!`
    );
    return `mailto:${email}?subject=${subject}&body=${body}`;
  }

  function groupNameForMember(staffGroupId: string | null) {
    if (!staffGroupId) return null;
    const g = staffGroups.find((x) => x.id === staffGroupId);
    return g ? crewLabel(g) : null;
  }

  function groupNameForInvite(inv: Invitation) {
    if (inv.role !== 'staff') return null;
    if (!inv.staffGroupId) return null;
    const g = staffGroups.find((x) => x.id === inv.staffGroupId);
    return g ? crewLabel(g) : null;
  }

  // Legacy join codes have no staffGroupId
  const legacyJoinCodes = joinCodes.filter((c) => !c.staffGroupId);

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-7 max-w-3xl">
      <div className="mb-7">
        <h1 className="text-[20px] font-bold text-forest">{t('shell:nav.items.team')}</h1>
        <p className="text-[12px] text-ink-soft mt-0.5">{t('activeCount', { count: members.length })}</p>
      </div>

      {/* ─── Staff Groups ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-semibold text-forest">{t('crews.title')}</h2>
            <p className="text-[11px] text-ink-faint mt-0.5">{t('crews.intro')}</p>
          </div>
          {isAdmin && !showCreateGroup && (
            <button
              onClick={() => setShowCreateGroup(true)}
              className="flex items-center gap-1.5 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-forest/90 transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('crews.new')}
            </button>
          )}
        </div>

        {showCreateGroup && (
          <div className="bg-white border border-border rounded-xl p-5 mb-3">
            <h3 className="text-[13px] font-semibold text-forest mb-3">{t('crews.new')}</h3>
            <GroupForm
              onSave={handleCreateGroup}
              onCancel={() => { setShowCreateGroup(false); setGroupError(null); }}
              saving={savingGroup}
              error={groupError}
            />
          </div>
        )}

        <div className="space-y-3">
          {staffGroups.length === 0 && !showCreateGroup && (
            <div className="bg-white border border-dashed border-border rounded-xl px-5 py-4 sm:py-6 text-center">
              <p className="text-[13px] font-medium text-ink-soft">{t('crews.emptyTitle')}</p>
              <p className="text-[11px] text-ink-faint mt-1">{t('crews.emptyHint')}</p>
            </div>
          )}
          {staffGroups.map((group) => (
            <StaffGroupCard
              key={group.id}
              group={group}
              joinCodes={joinCodes}
              campId={campId}
              onUpdated={reload}
            />
          ))}
        </div>

        {/* Legacy join codes (no group attached) */}
        {legacyJoinCodes.length > 0 && (
          <div className="bg-white border border-border rounded-xl mt-3 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h3 className="text-[12px] font-semibold text-ink-soft">{t('links.legacyTitle')}</h3>
              <p className="text-[11px] text-ink-faint">{t('links.legacyHint')}</p>
            </div>
            <div className="px-5 py-3 space-y-2">
              {legacyJoinCodes.map((jc) => {
                const url = `${window.location.origin}/join?code=${jc.code}`;
                return (
                  <div key={jc.id} className="flex items-center gap-3">
                    <code dir="ltr" className="text-[11px] font-mono font-bold text-forest tracking-widest w-16 text-start">{jc.code}</code>
                    <span className="text-[10px] text-ink-faint flex-1">
                      {t(`common:role.${jc.role}`)} · <bdi>{jc.maxUses
                        ? t('links.usesOf', { count: jc.useCount, max: jc.maxUses })
                        : t('links.uses', { count: jc.useCount })}</bdi>
                    </span>
                    <button
                      onClick={() => handleCopy(url, jc.id)}
                      className="flex items-center gap-1 text-[10px] text-ink-soft hover:text-forest transition-colors"
                    >
                      {copiedId === jc.id ? <><Check className="w-2.5 h-2.5 text-green-600" /> {t('copied')}</> : <><Link2 className="w-2.5 h-2.5" /> {t('copy')}</>}
                    </button>
                    <button
                      onClick={async () => {
                        const { revokeJoinCode } = useCampStore.getState();
                        if (!confirm(t('links.confirmRevoke'))) return;
                        await revokeJoinCode(jc.id);
                        reload();
                      }}
                      title={t('links.revoke')}
                      aria-label={t('links.revoke')}
                      className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Invite by email ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <h2 className="text-[13px] font-semibold text-forest mb-0.5">{t('invite.title')}</h2>
        <p className="text-[11px] text-ink-faint leading-relaxed mb-4">
          {t('invite.intro')}
        </p>

        {!showInviteForm && !showBulkInvite && !inviteLink && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowBulkInvite(true)}
              className="flex items-center gap-2 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-forest/90 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              {t('invite.team')}
            </button>
            <button
              onClick={() => setShowInviteForm(true)}
              className="flex items-center gap-2 text-[12px] font-medium text-forest px-3 py-1.5 rounded-lg border border-border hover:bg-paper transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t('invite.one')}
            </button>
          </div>
        )}

        {showBulkInvite && (
          <BulkInviteForm
            campId={campId}
            campName={currentCamp?.name ?? 'your camp'}
            staffGroups={staffGroups}
            pendingEmails={invitations.map((i) => i.email)}
            onSent={reload}
            onCancel={() => setShowBulkInvite(false)}
          />
        )}

        {showInviteForm && !inviteLink && (
          <form onSubmit={handleInvite} className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">{t('invite.email')}</label>
              <input
                type="email" dir="ltr" required autoFocus value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-1.5 border border-border rounded-lg text-[12px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-ink-soft mb-1">{t('invite.role')}</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CampRole)}
                  className="w-full px-2 py-1.5 border border-border rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  {ROLES.map((v) => <option key={v} value={v}>{t(`common:role.${v}`)}</option>)}
                </select>
              </div>
              {inviteRole === 'staff' && (
                <div>
                  <label className="block text-[11px] font-medium text-ink-soft mb-1">{t('invite.crew')}</label>
                  {staffGroups.length === 0 ? (
                    <p className="text-[11px] text-red-500 pt-1.5">{t('invite.createCrewFirst')}</p>
                  ) : (
                    <select
                      value={inviteGroupId}
                      onChange={(e) => setInviteGroupId(e.target.value)}
                      required
                      className="w-full px-2 py-1.5 border border-border rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                    >
                      <option value="">{t('invite.selectCrew')}</option>
                      {staffGroups.map((g) => <option key={g.id} value={g.id}>{crewLabel(g)}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>

            {inviteError && (
              <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{inviteError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowInviteForm(false); setInviteError(null); }}
                className="text-[12px] text-ink-faint hover:text-forest px-3 py-1.5 rounded-lg hover:bg-paper transition-colors"
              >
                {t('common:actions.cancel')}
              </button>
              <button
                type="submit"
                disabled={inviteLoading || (inviteRole === 'staff' && !inviteGroupId)}
                className="flex-1 bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
              >
                {inviteLoading ? t('invite.sending') : t('invite.send')}
              </button>
            </div>
          </form>
        )}

        {inviteLink && (
          <div>
            <p className="text-[11px] mb-2">
              {inviteEmailed
                ? (
                  <span className="text-green-700 font-medium">
                    <Trans t={t} i18nKey="invite.emailed" values={{ email: inviteLinkEmail }}
                      components={{ b: <strong dir="ltr" /> }} />
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium">
                    <Trans t={t} i18nKey={inviteEmailError ? 'invite.notEmailedReason' : 'invite.notEmailed'}
                      values={{ email: inviteLinkEmail, reason: inviteEmailError ?? '' }}
                      components={{ e: <bdi /> }} />
                  </span>
                )}
            </p>
            <div className="bg-paper border border-border rounded-lg px-3 py-2 mb-2.5">
              <code dir="ltr" className="block text-[10px] text-forest break-all leading-relaxed text-start">{inviteLink}</code>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => handleCopy(inviteLink, 'invite-link')}
                className="flex items-center gap-1.5 text-[11px] text-forest font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-paper transition-colors"
              >
                {copiedId === 'invite-link' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copiedId === 'invite-link' ? t('copiedLink') : t('copyLink')}
              </button>
              <a
                href={mailtoHref(inviteLinkEmail, inviteLink)}
                className="flex items-center gap-1.5 text-[11px] text-forest font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-paper transition-colors"
              >
                <Mail className="w-3 h-3" />
                {t('invite.openInEmail')}
              </a>
            </div>
            <button
              onClick={() => { setInviteLink(null); setInviteLinkEmail(''); setShowInviteForm(true); }}
              className="text-[11px] text-ink-faint hover:text-forest transition-colors"
            >
              {t('invite.another')}
            </button>
          </div>
        )}
      </div>

      {/* ─── Active members ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl mb-6">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[13px] font-semibold text-forest">{t('members.title')}</h2>
        </div>
        <div className="divide-y divide-stone-100">
          {roleError && (
            <div className="px-5 py-2 bg-red-50 text-red-600 text-[12px]">{roleError}</div>
          )}
          {members.map((m) => {
            const isSelf = m.userId === currentMember?.userId;
            const locked = m.isCreator || isSelf || !isAdmin;
            const groupName = groupNameForMember(m.staffGroupId);
            return (
              <div key={m.id} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-forest text-cream text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                  {m.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-medium text-forest truncate">{m.fullName}</p>
                    {m.isCreator && (
                      <span className="text-[10px] font-medium text-ink-faint bg-cream-dark px-1.5 py-0.5 rounded">{t('members.creator')}</span>
                    )}
                  </div>
                  {m.role === 'staff' && (
                    <p className="text-[11px] text-ink-faint">{groupName ?? t('members.fullAccessLegacy')}</p>
                  )}
                </div>
                <select
                  value={m.role}
                  disabled={locked}
                  onChange={async (e) => {
                    setRoleError(null);
                    const newRole = e.target.value as CampRole;
                    try {
                      await updateMemberRole(m.id, newRole, newRole === 'staff' ? m.staffGroupId : null);
                      reload();
                    } catch (err) {
                      setRoleError(err instanceof Error ? err.message : t('members.errorRole'));
                    }
                  }}
                  aria-label={t('members.roleFor', { name: m.fullName })}
                  className="text-[12px] border border-border rounded-md px-2 py-1 text-forest bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ROLES.map((v) => <option key={v} value={v}>{t(`common:role.${v}`)}</option>)}
                </select>
                {isAdmin && m.role === 'staff' && !isSelf && !m.isCreator && (
                  <select
                    value={m.staffGroupId ?? ''}
                    onChange={async (e) => {
                      setRoleError(null);
                      try {
                        await updateMemberRole(m.id, 'staff', e.target.value || null);
                        reload();
                      } catch (err) {
                        setRoleError(err instanceof Error ? err.message : t('members.errorCrew'));
                      }
                    }}
                    aria-label={t('members.crewFor', { name: m.fullName })}
                    className="text-[12px] border border-border rounded-md px-2 py-1 text-forest bg-white"
                  >
                    <option value="">{t('members.fullAccess')}</option>
                    {staffGroups.map((g) => <option key={g.id} value={g.id}>{crewLabel(g)}</option>)}
                  </select>
                )}
                {isAdmin && !isSelf && !m.isCreator && (
                  <button
                    onClick={async () => {
                      if (!confirm(t('members.confirmRemove'))) return;
                      await removeMember(m.id);
                      reload();
                    }}
                    title={t('members.remove', { name: m.fullName })}
                    aria-label={t('members.remove', { name: m.fullName })}
                    className="p-1.5 rounded hover:bg-red-50 text-ink-faint hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Pending invitations ──────────────────────────────────────────────── */}
      {invitations.length > 0 && (
        <div className="bg-white border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[13px] font-semibold text-forest">{t('pending.title')}</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {invitations.map((inv) => {
              const link = `${window.location.origin}/invite/${inv.token}`;
              const gName = groupNameForInvite(inv);
              return (
                <div key={inv.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p dir="ltr" className="text-[13px] font-medium text-forest truncate text-start">{inv.email}</p>
                    <p className="text-[11px] text-ink-faint">
                      {gName
                        ? t('pending.metaCrew', { role: t(`common:role.${inv.role}`), crew: gName, date: formatDate(inv.expiresAt) })
                        : t('pending.meta', { role: t(`common:role.${inv.role}`), date: formatDate(inv.expiresAt) })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(link, `inv-${inv.id}`)}
                    className="flex items-center gap-1.5 text-[12px] text-ink-soft hover:text-forest transition-colors flex-shrink-0"
                  >
                    {copiedId === `inv-${inv.id}` ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copiedId === `inv-${inv.id}` ? t('copiedLink') : t('copyLink')}
                  </button>
                  <a
                    href={mailtoHref(inv.email, link)}
                    className="flex items-center gap-1.5 text-[12px] text-ink-soft hover:text-forest transition-colors flex-shrink-0"
                  >
                    <Mail className="w-3 h-3" />
                    {t('pending.sendEmail')}
                  </a>
                  <button
                    onClick={async () => { await revokeInvitation(inv.id); reload(); }}
                    title={t('pending.revoke', { email: inv.email })}
                    aria-label={t('pending.revoke', { email: inv.email })}
                    className="p-1.5 rounded hover:bg-red-50 text-ink-faint hover:text-red-500 transition-colors flex-shrink-0"
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
    </div>
  );
}
