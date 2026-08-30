import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { CERT_TYPE_LABELS, useSafetyStore } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { RosterCompleteness } from '@/components/safety/RosterCompleteness';
import type { CertType, SafetyStaff, StaffCertification } from '@/lib/types';

/**
 * Where the names on the permit forms come from.
 *
 * A director reading a filled DOH-367 sees their aquatics director named on it and has nowhere
 * in the platform to go and change that name. The roster the form reads from had no screen left
 * after the safety module was folded into this one, so the data was real, editable in the
 * database, and invisible in the product.
 *
 * Two things are on show here, and the second is the one that was missing. The people, so the
 * name on the form has a visible home. And the rule that picks the three the form asks for by
 * role, which is nothing more than the text of their title. Nobody would guess that, and until
 * they know it they cannot fix a blank line on the form.
 */

/**
 * The three roles DOH-367 asks about by name.
 *
 * These patterns are the ones FormsPanel uses to fill the form, repeated here because this
 * panel exists to explain that matching to the camp. If they ever drift apart, this screen is
 * lying about the form, so they are written the same way and in the same order.
 */
const FORM_ROLES: {
  label: string;
  match: RegExp;
  /** What a title has to look like, said the way a person would say it. */
  hint: string;
  /** The permit details asked only of this role. */
  needs: (m: SafetyStaff) => string[];
}[] = [
  {
    label: 'Camp director',
    match: /^camp director$|^director$/i,
    hint: 'a title of exactly Camp Director, or Director',
    needs: (m) => [
      ...(m.education ? [] : ['education']),
      ...(m.qualifyingExperience ? [] : ['qualifying experience']),
    ],
  },
  {
    label: 'Health director',
    match: /health director/i,
    hint: 'a title containing Health Director',
    needs: (m) => (m.professionalLicenseNumber ? [] : ['a professional license number']),
  },
  {
    label: 'Aquatics director',
    match: /aquatics? director/i,
    hint: 'a title containing Aquatics Director',
    needs: (m) => (m.dateOfBirth ? [] : ['a date of birth']),
  },
];

/** The certifications that put a person on one of DOH-367a's tables, where a birthday prints. */
const CERTS_ON_367A: CertType[] = ['lifeguard', 'first_aid', 'cpr_aed', 'wsi'];

export function RosterPanel() {
  const staff = useSafetyStore((s) => s.staff);
  const certifications = useSafetyStore((s) => s.certifications);
  const openSafetyAddStaffModal = useUIStore((s) => s.openSafetyAddStaffModal);
  const { can } = useAuth();

  // The permit columns are readable only by a camp admin, through an admin-gated function.
  // Everyone else holds nulls that mean "not yours to see", which is not the same as "blank",
  // so nothing below tells a non-admin that a person's record is incomplete.
  const seesPersonal = can('manageSafetyStaff');

  const active = useMemo(() => staff.filter((m) => m.isActive), [staff]);

  const certsByStaff = useMemo(() => {
    const out = new Map<string, StaffCertification[]>();
    for (const c of certifications) {
      const list = out.get(c.staffId);
      if (list) list.push(c);
      else out.set(c.staffId, [c]);
    }
    return out;
  }, [certifications]);

  /**
   * Who each role resolves to, and who else wanted it.
   *
   * Roster order decides ties, because the form builder takes the first match it finds. Saying
   * that out loud is the point: two people with the title Camp Director is a state the camp can
   * be in without knowing, and only one of them is on the paperwork.
   */
  const roles = useMemo(() => FORM_ROLES.map((role) => {
    const matches = active.filter((m) => role.match.test(m.title));
    return { ...role, printed: matches[0] ?? null, alsoMatching: matches.slice(1) };
  }), [active]);

  const roleLabelsFor = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const r of roles) {
      if (!r.printed) continue;
      out.set(r.printed.id, [...(out.get(r.printed.id) ?? []), r.label.toLowerCase()]);
    }
    return out;
  }, [roles]);

  /** What DOH-367 and DOH-367a still want from one person, in plain words. */
  function gapsFor(member: SafetyStaff): string[] {
    if (!seesPersonal) return [];
    const certs = certsByStaff.get(member.id) ?? [];
    const onDoh367a = certs.some((c) => CERTS_ON_367A.includes(c.certType));
    const gaps: string[] = [];
    if (onDoh367a && !member.dateOfBirth) gaps.push('a date of birth');
    for (const r of roles) {
      if (r.printed?.id !== member.id) continue;
      for (const need of r.needs(member)) if (!gaps.includes(need)) gaps.push(need);
    }
    return gaps;
  }

  return (
    <div id="compliance-roster" className="bg-white rounded-card border border-border overflow-hidden scroll-mt-4">
      <div className="px-5 py-4 border-b border-cream-dark">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[14px] font-semibold text-forest inline-flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-ink-faint" /> Your people
            </p>
            <p className="text-[12px] text-ink-soft mt-1 leading-relaxed max-w-[74ch]">
              Every name printed on a permit form comes from this list. Change someone here and
              they change on the forms, the packets and the certification tables at the same
              time.
            </p>
          </div>
          {can('manageSafetyStaff') && (
            <Button size="sm" variant="ghost" onClick={() => openSafetyAddStaffModal()}>
              Add a person
            </Button>
          )}
        </div>
      </div>

      {/* The rule that decides who gets printed, stated before the list rather than left to be
          worked out from it. */}
      <div className="px-5 py-4 border-b border-cream-dark bg-cream/40">
        <p className="text-[12.5px] font-semibold text-forest">Who the forms name</p>
        <p className="text-[11.5px] text-ink-soft mt-0.5 leading-relaxed max-w-[74ch]">
          DOH-367 asks for three people by role. Nothing here is a setting: each one is picked by
          the wording of a title below, so editing a title is how you change who prints.
        </p>

        <div className="mt-2.5 space-y-2">
          {roles.map((r) => (
            <div key={r.label} className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[11.5px] text-ink-faint w-[112px] flex-shrink-0">{r.label}</span>
              <div className="min-w-0">
                {r.printed ? (
                  <p className="text-[12.5px] text-ink">
                    {can('manageSafetyStaff') ? (
                      <button
                        onClick={() => openSafetyAddStaffModal(r.printed!.id)}
                        className="text-sage hover:underline cursor-pointer font-medium"
                      >
                        {r.printed.name}
                      </button>
                    ) : (
                      <span className="font-medium text-forest">{r.printed.name}</span>
                    )}
                    <span className="text-ink-faint"> matched on the title {r.printed.title}</span>
                  </p>
                ) : (
                  <p className="text-[12.5px] text-amber-text">
                    Nobody has {r.hint}, so this line prints blank on DOH-367.
                  </p>
                )}
                {r.printed && r.alsoMatching.length > 0 && (
                  <p className="text-[11.5px] text-amber-text mt-0.5">
                    {r.alsoMatching.map((m) => m.name).join(', ')} also{' '}
                    {r.alsoMatching.length === 1 ? 'matches' : 'match'} this role. {r.printed.name}{' '}
                    is the one that prints, because they come first on the roster.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Named, counted and tied to the form that is waiting. Renders nothing when nothing is
          missing, and nothing for someone who cannot see the personal columns. */}
      {seesPersonal && (
        <div className="px-5 pt-4">
          <RosterCompleteness />
        </div>
      )}

      {active.length === 0 ? (
        <p className="px-5 py-6 text-[12.5px] text-ink-faint">
          No active staff on the roster, so every name on the forms prints blank.
        </p>
      ) : (
        <div>
          {active.map((m) => {
            const certs = certsByStaff.get(m.id) ?? [];
            const printsAs = roleLabelsFor.get(m.id) ?? [];
            const gaps = gapsFor(m);
            return (
              <div key={m.id}
                   className="flex items-start justify-between gap-3 px-5 py-2.5 border-t border-cream-dark">
                <div className="min-w-0">
                  <p className="text-[13px] text-forest">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-[11.5px] text-ink-faint ml-2">{m.title}</span>
                  </p>
                  {printsAs.length > 0 && (
                    <p className="text-[11.5px] text-ink-soft mt-0.5">
                      Prints as your {printsAs.join(' and ')} on DOH-367.
                    </p>
                  )}
                  <p className="text-[11.5px] text-ink-faint mt-0.5">
                    {certs.length === 0
                      ? 'No certifications on file'
                      : certs.map((c) => CERT_TYPE_LABELS[c.certType]).join(' · ')}
                  </p>
                  {gaps.length > 0 && (
                    <p className="text-[11.5px] text-amber-text mt-0.5">
                      The forms still want {gaps.join(' and ')} from this record.
                    </p>
                  )}
                </div>
                {can('manageSafetyStaff') && (
                  <button
                    onClick={() => openSafetyAddStaffModal(m.id)}
                    className="text-[11.5px] text-sage hover:underline cursor-pointer flex-shrink-0"
                  >
                    Edit
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!seesPersonal && active.length > 0 && (
        <p className="px-5 py-3 border-t border-cream-dark text-[11.5px] text-ink-faint leading-relaxed max-w-[74ch]">
          Dates of birth and the other details the permit forms ask about a person are kept for
          camp admins only, so they are not shown on this page. A camp admin can see and edit
          them from here.
        </p>
      )}
    </div>
  );
}
