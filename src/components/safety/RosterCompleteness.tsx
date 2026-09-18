import { useContext } from 'react';
import { AlertTriangle } from 'lucide-react';
import { UntranslatedContext, useScreenTranslation } from '@/components/i18n/untranslated';
import { useSafetyStore } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import type { CertType, SafetyStaff } from '@/lib/types';

/**
 * What the permit forms are still waiting on from the roster.
 *
 * The gap this closes is one nobody sees until the wrong moment. A camp fills its roster in
 * March, downloads DOH-367a in May, and finds eleven certification rows with a blank date of
 * birth beside each one. Nothing in the product ever said the birthday was load-bearing, and
 * the form is not where you want to learn it.
 *
 * So the roster says so itself, next to the people it is about and next to the button that
 * fixes it. Named, counted, and tied to the form that is waiting, because "incomplete profile"
 * tells a director nothing about whether it matters.
 *
 * Renders nothing when there is nothing missing, and nothing for someone who cannot edit staff.
 */

/** The certifications that put a person on one of DOH-367a's tables, where a birthday prints. */
const CERTS_ON_367A: CertType[] = ['lifeguard', 'first_aid', 'cpr_aed', 'wsi'];

/**
 * The three people DOH-367 asks about by role. These mirror the patterns the compliance module
 * uses to name the same directors on the packet; a title that matches neither simply is not a
 * director as far as either of them is concerned.
 */
type Role = 'campDirector' | 'healthDirector' | 'aquaticsDirector';
type Need = 'education' | 'experience' | 'license' | 'dob';

// Keys rather than English phrases, so the sentence below can be said in the reader's language.
// The patterns match the title as the camp typed it, which is unchanged by any translation.
const DIRECTOR_ROLES: { role: Role; match: RegExp; needs: (m: SafetyStaff) => Need[] }[] = [
  {
    role: 'campDirector',
    match: /^camp director$|^director$/i,
    needs: (m) => [
      ...(m.education ? [] : ['education' as const]),
      ...(m.qualifyingExperience ? [] : ['experience' as const]),
    ],
  },
  {
    role: 'healthDirector',
    match: /health director/i,
    needs: (m) => (m.professionalLicenseNumber ? [] : ['license']),
  },
  {
    role: 'aquaticsDirector',
    match: /aquatics? director/i,
    needs: (m) => (m.dateOfBirth ? [] : ['dob']),
  },
];

export function RosterCompleteness() {
  const staff = useSafetyStore((s) => s.staff);
  const certifications = useSafetyStore((s) => s.certifications);
  const openSafetyAddStaffModal = useUIStore((s) => s.openSafetyAddStaffModal);
  const { can } = useAuth();
  // Rendered on Camp Info (translated) and on Safety's staff tab (still English).
  const { t, i18n } = useScreenTranslation('staff');
  const english = useContext(UntranslatedContext);
  const list = new Intl.ListFormat(english ? 'en' : i18n.language, { type: 'conjunction' });

  if (!can('manageSafetyStaff')) return null;

  const active = staff.filter((m) => m.isActive);
  const certified = new Set(
    certifications
      .filter((c) => CERTS_ON_367A.includes(c.certType))
      .map((c) => c.staffId),
  );

  // Only the people the form actually prints a birthday cell for. A cook with no certifications
  // never appears on DOH-367a, so their missing birthday is not holding anything up and asking
  // for it would be collecting personal data for no reason.
  const onForm = active.filter((m) => certified.has(m.id));
  const missingDob = onForm.filter((m) => !m.dateOfBirth);

  // A director who is already named in the birthday list above is not named again for the same
  // birthday. One person, one thing to go and fix.
  const alreadyListed = new Set(missingDob.map((m) => m.id));
  const directorGaps = DIRECTOR_ROLES.flatMap((role) => {
    const member = active.find((m) => role.match.test(m.title));
    if (!member) return [];
    const needs = role.needs(member)
      .filter((n) => !(n === 'dob' && alreadyListed.has(member.id)));
    return needs.length === 0 ? [] : [{ member, role: role.role, needs }];
  });

  if (missingDob.length === 0 && directorGaps.length === 0) return null;

  return (
    <div className="rounded-card border border-amber/30 bg-amber-bg px-4 py-3.5 mb-4">
      <p className="text-[12.5px] font-semibold text-amber-text inline-flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>{t('completeness.heading')}</span>
      </p>

      <div className="mt-2.5 space-y-3 ps-5">
        {missingDob.length > 0 && (
          <div>
            <p className="text-[12.5px] text-ink leading-relaxed">
              {t('completeness.missingDob', { count: missingDob.length, total: onForm.length })}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {missingDob.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openSafetyAddStaffModal(m.id)}
                  className="text-[12px] text-sage hover:underline cursor-pointer font-medium"
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {directorGaps.map(({ member, role, needs }) => (
          <div key={member.id}>
            <p className="text-[12.5px] text-ink leading-relaxed">
              {t('completeness.directorAsks', {
                count: needs.length,
                role: t(`role.${role}`),
                needs: list.format(needs.map((n) => t(`need.${n}`))),
                name: member.name,
              })}
            </p>
            <button
              onClick={() => openSafetyAddStaffModal(member.id)}
              className="text-[12px] text-sage hover:underline cursor-pointer font-medium mt-1"
            >
              {t('completeness.fillIn', { name: member.name })}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
