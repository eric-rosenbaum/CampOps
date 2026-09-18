// Every language ships the same keys, the same {{variables}}, and the plural forms its own
// grammar needs. A missing key falls back to English at runtime, which is survivable; a
// Hebrew string that drops {{name}} tells a crew member "assigned to" and nobody, which is not.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', 'locales');
const LANGS = readdirSync(ROOT);
const PLURAL = /_(zero|one|two|few|many|other)$/;

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

function load(lang: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const f of readdirSync(join(ROOT, lang))) {
    if (!f.endsWith('.json')) continue;
    out[f.replace(/\.json$/, '')] = flatten(JSON.parse(readFileSync(join(ROOT, lang, f), 'utf8')));
  }
  return out;
}

const vars = (s: string) => [...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();

/** Keys with their plural suffix removed — a plural is one message whatever its forms. */
const bases = (flat: Record<string, string>) => new Set(Object.keys(flat).map((k) => k.replace(PLURAL, '')));

const en = load('en');

describe('locale files', () => {
  it('ships English, Spanish and Hebrew', () => {
    expect(LANGS.sort()).toEqual(['en', 'es', 'he']);
  });

  for (const lang of LANGS.filter((l) => l !== 'en')) {
    const other = load(lang);
    const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;

    it(`${lang}: has the same namespaces as English`, () => {
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    });

    for (const ns of Object.keys(en)) {
      const e = en[ns];
      const o = other[ns] ?? {};

      it(`${lang}/${ns}: same messages as English, nothing extra`, () => {
        expect([...bases(o)].sort()).toEqual([...bases(e)].sort());
      });

      it(`${lang}/${ns}: keeps every {{variable}}`, () => {
        const bad: string[] = [];
        for (const base of bases(e)) {
          const enForms = Object.keys(e).filter((k) => k === base || k.replace(PLURAL, '') === base);
          const want = new Set(enForms.flatMap((k) => vars(e[k])));
          // `count` may legitimately be spelled out in a singular form ("un día"), so it is
          // required somewhere in the message, not in every form.
          const forms = Object.keys(o).filter((k) => k === base || k.replace(PLURAL, '') === base);
          const have = new Set(forms.flatMap((k) => vars(o[k])));
          for (const v of want) if (!have.has(v)) bad.push(`${base} missing {{${v}}}`);
          for (const v of have) if (!want.has(v)) bad.push(`${base} has unknown {{${v}}}`);
        }
        expect(bad).toEqual([]);
      });

      it(`${lang}/${ns}: plurals cover the language's own forms`, () => {
        const bad: string[] = [];
        for (const k of Object.keys(e)) {
          if (!k.endsWith('_other')) continue;
          const base = k.replace(PLURAL, '');
          for (const c of categories) {
            // i18next resolves a missing form to the key itself, so every category the
            // language uses needs a string. "many" is Spanish for 1,000,000 and Hebrew's
            // older rules; supplying it costs one line.
            if (!(`${base}_${c}` in o)) bad.push(`${base}_${c}`);
          }
        }
        expect(bad).toEqual([]);
      });

      it(`${lang}/${ns}: nothing left untranslated or empty`, () => {
        const empty = Object.entries(o).filter(([, v]) => !v.trim()).map(([k]) => k);
        expect(empty).toEqual([]);
      });
    }
  }
});
