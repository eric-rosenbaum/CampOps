#!/usr/bin/env node
// Upload demo photos into a camp's issue-photos folder and print their public URLs.
//
// No service-role key required, which is the point. The `issue-photos` INSERT policy is
// `is_camp_member(foldername[1])` for the `authenticated` role, and a /try/ anonymous session
// is made a camp member by join_demo_with_token — so an anonymous sign-in plus the demo token
// is enough to write. Everything here uses the anon key already in .env.local.
//
//   node demo/upload-photos.mjs <share-token> <dir-of-images>
//
// Prints a `filename  ->  public URL` table; paste the URLs into the module seed SQL.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const [, , token, dir] = process.argv;
if (!token || !dir) {
  console.error('usage: node demo/upload-photos.mjs <share-token> <dir-of-images>');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) { console.error('anonymous sign-in failed:', authErr.message); process.exit(1); }

const { data: joined, error: joinErr } = await supabase.rpc('join_demo_with_token', { p_token: token });
if (joinErr) { console.error('join failed:', joinErr.message); process.exit(1); }
if (joined?.error) { console.error('join refused:', joined.error); process.exit(1); }

const campId = joined.camp_id;
console.error(`joined ${joined.camp_name} (${campId}) as ${auth.user.id}\n`);

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const files = readdirSync(dir).filter(f => MIME[extname(f).toLowerCase()]).sort();
if (!files.length) { console.error(`no images in ${dir}`); process.exit(1); }

for (const file of files) {
  // Deterministic path keyed on the source filename: re-running replaces rather than
  // accumulating, so the URLs already pasted into seed SQL keep working.
  const path = `${campId}/demo-${basename(file, extname(file))}${extname(file).toLowerCase()}`;
  const body = readFileSync(join(dir, file));
  const opts = { contentType: MIME[extname(file).toLowerCase()], upsert: false };

  let { error } = await supabase.storage.from('issue-photos').upload(path, body, opts);

  // upsert:true is not an option here — it makes storage check for an existing row, and
  // issue-photos has INSERT/UPDATE/DELETE policies but no SELECT one, so the lookup is denied
  // and the whole write fails as an RLS violation. Deleting first stays inside the policies we
  // do have, and keeps re-runs idempotent.
  if (error && /exists/i.test(error.message)) {
    await supabase.storage.from('issue-photos').remove([path]);
    ({ error } = await supabase.storage.from('issue-photos').upload(path, body, opts));
  }
  if (error) { console.error(`✗ ${file}: ${error.message}`); continue; }
  const { data } = supabase.storage.from('issue-photos').getPublicUrl(path);
  console.log(`${file}\t${data.publicUrl}`);
}
