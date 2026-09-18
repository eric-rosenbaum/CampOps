/**
 * The sign-in errors a person actually sees, in their language.
 *
 * Supabase Auth, the auth store and the invitation/join RPCs all answer in English sentences, and
 * those sentences are also what the store's own mapping logic tests against (`/expired/i`), so
 * they stay English at the source. This is the last step before the screen: recognise the known
 * shapes and re-say them. Something nobody taught this file is shown exactly as it arrived —
 * English, but never a wrong translation of it.
 */
import type { TFunction } from 'i18next';

type AuthKey =
  | 'invalidCredentials' | 'emailNotConfirmed' | 'alreadyRegistered' | 'rateLimited'
  | 'noAccount' | 'codeExpired' | 'codeWrong' | 'timeout' | 'network'
  | 'currentPasswordWrong' | 'samePassword' | 'notSignedIn' | 'updateFailed'
  | 'passwordTooShortServer' | 'weakPassword' | 'badEmail'
  | 'inviteDifferentEmail' | 'inviteInvalid' | 'alreadyMember' | 'platformAdmin'
  | 'signInToAccept' | 'joinCodeInvalid' | 'generic';

const SHAPES: [RegExp, AuthKey][] = [
  [/invalid login credentials/i, 'invalidCredentials'],
  [/email not confirmed/i, 'emailNotConfirmed'],
  [/already (been )?registered|user already exists/i, 'alreadyRegistered'],
  [/rate limit|too many requests|only request this after/i, 'rateLimited'],
  [/signups? not allowed/i, 'noAccount'],
  [/code has expired|token has expired/i, 'codeExpired'],
  [/code isn.t right|token.*invalid|invalid.*(otp|token)/i, 'codeWrong'],
  [/timed out/i, 'timeout'],
  [/failed to fetch|network ?error|load failed/i, 'network'],
  [/current password isn.t right/i, 'currentPasswordWrong'],
  [/different from the old password/i, 'samePassword'],
  [/need to be signed in to change/i, 'notSignedIn'],
  [/could not update your password/i, 'updateFailed'],
  [/password should be at least/i, 'passwordTooShortServer'],
  [/weak|pwned|leaked|compromised/i, 'weakPassword'],
  [/unable to validate email|invalid format/i, 'badEmail'],
  [/different email address/i, 'inviteDifferentEmail'],
  [/invalid or expired invitation|invitation link is invalid/i, 'inviteInvalid'],
  [/already a member/i, 'alreadyMember'],
  [/platform admin/i, 'platformAdmin'],
  [/sign in to accept/i, 'signInToAccept'],
  [/invalid or expired join code/i, 'joinCodeInvalid'],
  [/something went wrong/i, 'generic'],
];

export function authErrorMessage(t: TFunction<'auth'>, raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return t('errors.generic');
  for (const [re, key] of SHAPES) if (re.test(raw)) return t(`errors.${key}`);
  return raw;
}
