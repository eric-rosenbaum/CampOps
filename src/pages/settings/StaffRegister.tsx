import { useMemo } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { CERT_TYPE_LABELS, useSafetyStore } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { RosterCompleteness } from '@/components/safety/RosterCompleteness';
import { FORM_ROLES, CERTS_ON_367A } from '@/lib/compliance/formRoles';
import type { SafetyStaff, StaffCertification } from '@/lib/types';

/**
 * The camp's people and their certifications.
 *
 * Reference data, not a compliance record. Safety reads it for drills and certifications, the
 * permit forms read it for the three directors they name, and the pool module reads it for
 * lifeguards -- so it belongs next to the rest of the camp's settings rather than inside any one
 * of the modules that consume it. It lived inside Safety & Compliance because that was the last
 * module standing after the safety pages were folded in, which made one consumer look like the
 * owner.
 *
 * What stays behind in Compliance is the part that is genuinely about the forms: which person
 * each printed role resolves to, and why. See FormNamesCard.
 */
export function StaffRegister() {
  const staff = useSafetyStore((s) => s.staff);
  const certifications = useSafetyStore((s) => s.certifications);
  const openSafetyAddStaffModal = useUIStore((s) => s.openSafetyAddStaffModal);
  const { can } = useAuth();

  // The permit columns are readable only by a camp admin, through an admin-gated function.
  // Everyone else holds nulls that mean "not yours to see", which is not the same as "blank",
  // so nothing below tells a non-admin that a person's record is incomplete.
  const seesPersonal = can('manageSafetyStaff');
  const canManage = can('manageSafetyStaff');

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

  const roles = useMemo(() => FORM_ROLES.map((role) => {
    const matches = active.filter((m) => role.match.test(m.title));
    return { ...role, printed: matches[0] ?? null };
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
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Staff & certifications"
        subtitle="The people at your camp, and what they are qualified to do"
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="bg-white rounded-card border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-dark flex items-start justify-between gap-4">
              <p className="text-[12.5px] text-ink-soft leading-relaxed min-w-0">
                One list, read by several parts of the platform: drills and certification tracking
                in Safety, the three directors named on your permit forms, and lifeguard cover in
                Pool Manager. Change someone once and they change everywhere.
              </p>
              {canManage && (
                <Button size="sm" variant="ghost" className="flex-shrink-0"
                        onClick={() => openSafetyAddStaffModal()}>
                  Add a person
                </Button>
              )}
            </div>

            {/* Named, counted and tied to the form that is waiting. Renders nothing when nothing
                is missing, and nothing for someone who cannot see the personal columns. */}
            {seesPersonal && (
              <div className="px-5 pt-4">
                <RosterCompleteness />
              </div>
            )}

            {active.length === 0 ? (
              <p className="px-5 py-6 text-[12.5px] text-ink-faint">
                No active staff yet. Add the people who work at your camp and their certifications.
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
                      {canManage && (
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
              <p className="px-5 py-3 border-t border-cream-dark text-[11.5px] text-ink-faint leading-relaxed">
                Dates of birth and the other details the permit forms ask about a person are kept
                for camp admins only, so they are not shown here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
