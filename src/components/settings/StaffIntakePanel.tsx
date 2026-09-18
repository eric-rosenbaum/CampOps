import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Copy, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useSafetyStore } from '@/store/safetyStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';
import { formatDate, generateId, toDateStr } from '@/lib/utils';
import {
  dbCreateIntakeLink, dbRevokeIntakeLink, dbLoadIntake, dbMarkSubmissionApplied,
  submissionPatch, type StaffIntakeLink, type StaffIntakeSubmission,
} from '@/lib/staffIntakeDb';
import type { SafetyStaff } from '@/lib/types';

/**
 * Collect the permit details from the people they belong to.
 *
 * A roster import brings in names and titles. It does not bring dates of birth, education or
 * prior camp experience, because those live in no system a roster is exported from — camps chase
 * them by email every spring and re-type the replies.
 *
 * So: one link, sent to everybody. Each person fills in their own record, and the replies queue
 * up here for an admin to apply. The queue is the safety property — a public link that wrote
 * straight to the roster would be an unauthenticated door into camp data, and reviewing is also
 * where a director notices two people typed the same name.
 */
/**
 * A calendar day said the reader's way. The birthday comes off a public form, so anything that is
 * not a clean YYYY-MM-DD is shown as typed — date-fns throws on an invalid date, and one odd reply
 * would otherwise take the whole roster tab down with it.
 */
const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? formatDate(s) : s);

export function StaffIntakePanel() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const season = useChecklistStore((s) => s.season);
  const { staff, addStaff, updateStaff } = useSafetyStore();
  const { currentUser } = useAuth();
  const { t } = useTranslation('staff');

  const [links, setLinks] = useState<StaffIntakeLink[]>([]);
  const [subs, setSubs] = useState<StaffIntakeSubmission[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!campId) return;
    let live = true;
    void dbLoadIntake(campId).then((d) => {
      if (!live) return;
      setLinks(d.links); setSubs(d.submissions);
    });
    return () => { live = false; };
  }, [campId]);

  const live = links.filter((l) => !l.revokedAt && l.staffId === null);

  async function createLink() {
    if (!campId) return;
    setBusy(true);
    // Six months out. A collection link is a capability that gets forwarded around a staff email
    // thread, so it expires on its own rather than living forever in somebody's inbox.
    const expires = toDateStr(new Date(Date.now() + 180 * 86400000));
    const made = await dbCreateIntakeLink(
      campId, season?.id ?? null,
      { label: season?.name ?? null, expiresOn: expires }, currentUser.name || null,
    );
    if (made) setLinks((l) => [made, ...l]);
    setBusy(false);
  }

  async function revoke(id: string) {
    if (await dbRevokeIntakeLink(id)) {
      setLinks((l) => l.map((x) => (x.id === id ? { ...x, revokedAt: new Date().toISOString() } : x)));
    }
  }

  async function apply(sub: StaffIntakeSubmission) {
    const patch = submissionPatch(sub);
    // Aimed at somebody already on the roster, or matching one by name: update rather than
    // create, so a person who fills the form twice does not become two people on DOH-367a.
    const existing = sub.staffId
      ? staff.find((m) => m.id === sub.staffId)
      : staff.find((m) => m.name.trim().toLowerCase() === patch.name?.trim().toLowerCase());

    if (existing) {
      updateStaff(existing.id, patch);
    } else {
      const now = new Date().toISOString();
      const member: SafetyStaff = {
        id: generateId(),
        name: patch.name ?? '', title: patch.title ?? '', isActive: true,
        dateOfBirth: patch.dateOfBirth ?? null, sex: patch.sex ?? null,
        education: patch.education ?? null,
        qualifyingExperience: patch.qualifyingExperience ?? null,
        professionalLicenseNumber: null, createdAt: now, updatedAt: now,
      };
      addStaff(member);
    }
    await dbMarkSubmissionApplied(sub.id, currentUser.name || null);
    setSubs((s) => s.filter((x) => x.id !== sub.id));
  }

  async function dismiss(sub: StaffIntakeSubmission) {
    await dbMarkSubmissionApplied(sub.id, currentUser.name || null);
    setSubs((s) => s.filter((x) => x.id !== sub.id));
  }

  function copy(token: string) {
    const url = `${window.location.origin}/staff-intake/${token}`;
    void navigator.clipboard?.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark">
        <p className="text-[13.5px] font-semibold text-forest">{t('intake.title')}</p>
        <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
          {t('intake.body')}
        </p>
      </div>

      {subs.length > 0 && (
        <div className="border-b border-cream-dark">
          <div className="px-5 py-2 bg-amber-bg">
            <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-amber-text">
              {t('intake.waiting', { count: subs.length })}
            </span>
          </div>
          {subs.map((sub) => (
            <div key={sub.id}
              className="px-5 py-3 border-b border-cream-dark last:border-b-0 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">{sub.payload.name}</div>
                <div className="text-[11.5px] text-ink-soft mt-0.5">
                  {[sub.payload.title,
                    sub.payload.date_of_birth
                      && t('intake.born', { date: day(sub.payload.date_of_birth) }),
                    sub.payload.education].filter(Boolean).join(' · ') || t('intake.nameOnly')}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => void dismiss(sub)}>
                  <X className="w-3.5 h-3.5" /> {t('intake.discard')}
                </Button>
                <Button size="sm" onClick={() => void apply(sub)}>
                  <Check className="w-3.5 h-3.5" /> {t('intake.addToRoster')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4">
        {live.length === 0 ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void createLink()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {t('intake.createLink')}
          </Button>
        ) : (
          <div className="space-y-2">
            {live.map((l) => (
              <div key={l.id} className="flex items-center gap-2 flex-wrap">
                <code dir="ltr" className="text-[11.5px] font-mono bg-paper-raised border border-border
                                 rounded-btn px-2.5 py-1.5 min-w-0 truncate flex-1">
                  {window.location.origin}/staff-intake/{l.token}
                </code>
                <Button size="sm" variant="ghost" onClick={() => copy(l.token)}>
                  {copied === l.token
                    ? <><Check className="w-3.5 h-3.5" /> {t('intake.copied')}</>
                    : <><Copy className="w-3.5 h-3.5" /> {t('intake.copy')}</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void revoke(l.id)}>{t('intake.revoke')}</Button>
              </div>
            ))}
            <p className="text-[11px] text-ink-faint">
              {live[0].expiresOn
                ? t('intake.expires', { date: day(live[0].expiresOn) })
                : t('intake.expiresNever')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
