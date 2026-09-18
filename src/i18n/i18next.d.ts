// Types every `t('ns:key')` call against the English files. A key that does not exist in
// English fails `tsc -b`; Spanish and Hebrew are held to the same key set by
// src/i18n/__tests__/locales.test.ts.
import 'i18next';
import type account from './locales/en/account.json';
import type activity from './locales/en/activity.json';
import type auth from './locales/en/auth.json';
import type campground from './locales/en/campground.json';
import type campgroundAdmin from './locales/en/campgroundAdmin.json';
import type common from './locales/en/common.json';
import type home from './locales/en/home.json';
import type scan from './locales/en/scan.json';
import type shell from './locales/en/shell.json';
import type translation from './locales/en/translation.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      account: typeof account;
      activity: typeof activity;
      auth: typeof auth;
      campground: typeof campground;
      campgroundAdmin: typeof campgroundAdmin;
      common: typeof common;
      home: typeof home;
      scan: typeof scan;
      shell: typeof shell;
      translation: typeof translation;
    };
  }
}
