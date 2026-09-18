// The bundled translations. Static imports rather than import.meta.glob, because this module is
// also loaded by Playwright and Vitest under plain Node, where there is no Vite to expand a glob.
// Adding a namespace means a line per language here and a line in i18next.d.ts; the locale test
// fails if the three languages disagree about which namespaces exist.

import en_account from './locales/en/account.json';
import en_activity from './locales/en/activity.json';
import en_auth from './locales/en/auth.json';
import en_campground from './locales/en/campground.json';
import en_campgroundAdmin from './locales/en/campgroundAdmin.json';
import en_common from './locales/en/common.json';
import en_home from './locales/en/home.json';
import en_scan from './locales/en/scan.json';
import en_shell from './locales/en/shell.json';
import en_translation from './locales/en/translation.json';
import en_team from './locales/en/team.json';
import en_staff from './locales/en/staff.json';
import en_campInfo from './locales/en/campInfo.json';
import es_account from './locales/es/account.json';
import es_activity from './locales/es/activity.json';
import es_auth from './locales/es/auth.json';
import es_campground from './locales/es/campground.json';
import es_campgroundAdmin from './locales/es/campgroundAdmin.json';
import es_common from './locales/es/common.json';
import es_home from './locales/es/home.json';
import es_scan from './locales/es/scan.json';
import es_shell from './locales/es/shell.json';
import es_translation from './locales/es/translation.json';
import es_team from './locales/es/team.json';
import es_staff from './locales/es/staff.json';
import es_campInfo from './locales/es/campInfo.json';
import he_account from './locales/he/account.json';
import he_activity from './locales/he/activity.json';
import he_auth from './locales/he/auth.json';
import he_campground from './locales/he/campground.json';
import he_campgroundAdmin from './locales/he/campgroundAdmin.json';
import he_common from './locales/he/common.json';
import he_home from './locales/he/home.json';
import he_scan from './locales/he/scan.json';
import he_shell from './locales/he/shell.json';
import he_translation from './locales/he/translation.json';
import he_team from './locales/he/team.json';
import he_staff from './locales/he/staff.json';
import he_campInfo from './locales/he/campInfo.json';

export const resources = {
  en: { account: en_account, activity: en_activity, auth: en_auth, campground: en_campground, campgroundAdmin: en_campgroundAdmin, common: en_common, home: en_home, scan: en_scan, shell: en_shell, translation: en_translation, campInfo: en_campInfo, staff: en_staff, team: en_team },
  es: { account: es_account, activity: es_activity, auth: es_auth, campground: es_campground, campgroundAdmin: es_campgroundAdmin, common: es_common, home: es_home, scan: es_scan, shell: es_shell, translation: es_translation, campInfo: es_campInfo, staff: es_staff, team: es_team },
  he: { account: he_account, activity: he_activity, auth: he_auth, campground: he_campground, campgroundAdmin: he_campgroundAdmin, common: he_common, home: he_home, scan: he_scan, shell: he_shell, translation: he_translation, campInfo: he_campInfo, staff: he_staff, team: he_team },
} as const;
