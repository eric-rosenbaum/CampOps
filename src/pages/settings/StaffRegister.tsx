import { useMemo, useState } from 'react';
import { Upload, ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import { CERT_TYPE_LABELS, useSafetyStore } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { AddStaffModal } from '@/components/safety/AddStaffModal';
import { useAuth } from '@/lib/auth';
import { RosterCompleteness } from '@/components/safety/RosterCompleteness';
import { StaffImportModal } from '@/components/safety/StaffImportModal';
import { StaffIntakePanel } from '@/components/settings/StaffIntakePanel';
import { FORM_ROLES, CERTS_ON_367A } from '@/lib/compliance/formRoles';
import type { SafetyStaff, StaffCertification } from '@/lib/types';

/**
 * The camp's people and their certifications.
 *
 * Reference data, not a compliance record. Safety reads it for drills and certifications, the
 * permit forms read it for the three directors they name, and the pool module reads it for
 * lifeguards -- so it belongs next to the rest of the camp's settings rather than inside any one
 * of the modules that consume it. It lived inside the Safety module because that was the last
 * one standing after those pages were folded into Compliance, which made one consumer look like
 * the owner.
 *
 * What stays behind in Compliance is the part that is genuinely about the forms: which person
 * each printed role resolves to, and why. See FormNamesCard.
 */
export function StaffRosterTab() {
  const staff = useSafetyStore((s) => s.staff);
  const certifications = useSafetyStore((s) => s.certifications);
  const openSafetyAddStaffModal = useUIStore((s) => s.openSafetyAddStaffModal);
  // The modal is opened from a store flag, so the page that raises the flag has to be the page
  // that renders it. This one raised it and never rendered it, which made every "Add a person"
  // and "Edit" on this page do nothing at all.
  const isSafetyAddStaffModalOpen = useUIStore((s) => s.isSafetyAddStaffModalOpen);
  const [importing, setImporting] = useState(false);
  // Only shown to somebody who arrived from Compliance. A camp that came here from the
  // sidebar has no "back" to offer, and a link to a tab they were not on reads as a detour.
  const [params] = useSearchParams();
  const cameFromCompliance = params.get('from') === 'compliance';
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
    <div className="px-4 sm:px-7 py-4 sm:py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {cameFromCompliance && (
          <Link to="/compliance?tab=staff"
            className="text-[12.5px] font-semibold text-sage hover:text-forest inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to staff clearance
          </Link>
        )}
          <div className="bg-white rounded-card border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-dark flex items-start justify-between gap-4">
              <p className="text-[12.5px] text-ink-soft leading-relaxed min-w-0">
                One list, read by several parts of the platform: drills and certification tracking
                in Safety, the three directors named on your permit forms, and lifeguard cover in
                Pool Manager. Change someone once and they change everywhere.
              </p>
              {canManage && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
                    <Upload className="w-3.5 h-3.5" /> Import a roster
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openSafetyAddStaffModal()}>
                    Add a person
                  </Button>
                </div>
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

        {canManage && <StaffIntakePanel />}
      </div>
      {isSafetyAddStaffModalOpen && <AddStaffModal />}
      {importing && <StaffImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}
