import type { CertType, SafetyStaff } from '@/lib/types';

/**
 * The three roles DOH-367 asks about by name.
 *
 * These patterns are the ones the form builder uses to fill the form. Shared from here rather
 * than copied, because a screen that explains the matching while matching differently is a
 * screen that lies about the form.
 */
export const FORM_ROLES: {
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
export const CERTS_ON_367A: CertType[] = ['lifeguard', 'first_aid', 'cpr_aed', 'wsi'];
