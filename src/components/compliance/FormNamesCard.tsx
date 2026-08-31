import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { useSafetyStore } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { FORM_ROLES } from '@/lib/compliance/formRoles';

/**
 * Which person each printed role resolves to, and why.
 *
 * All that is left in Compliance of what used to be a full staff list. The list itself is
 * reference data and now lives under Settings; what belongs here is the one thing you cannot
 * learn anywhere else -- that the form picks its three directors by the wording of a title, so
 * editing a title is how you change who prints.
 */
export function FormNamesCard() {
  const staff = useSafetyStore((s) => s.staff);
  const openSafetyAddStaffModal = useUIStore((s) => s.openSafetyAddStaffModal);
  const { can } = useAuth();
  const canManage = can('manageSafetyStaff');

  const active = useMemo(() => staff.filter((m) => m.isActive), [staff]);

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

  return (
    <div id="compliance-roster" className="bg-white rounded-card border border-border overflow-hidden scroll-mt-4">
      <div className="px-5 py-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-forest inline-flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-ink-faint" /> Who the forms name
          </p>
          <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
            DOH-367 asks for three people by role. Nothing here is a setting: each one is picked
            by the wording of a title, so editing a title is how you change who prints.
          </p>
        </div>
        <Link to="/settings/staff"
              className="text-[12px] text-sage hover:text-forest inline-flex items-center gap-1 flex-shrink-0">
          Staff &amp; certifications <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="px-5 pb-4 space-y-2">
        {roles.map((r) => (
          <div key={r.label} className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11.5px] text-ink-faint w-[112px] flex-shrink-0">{r.label}</span>
            <div className="min-w-0">
              {r.printed ? (
                <p className="text-[12.5px] text-ink">
                  {canManage ? (
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
                  is the one that prints, as the first match on the roster.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
