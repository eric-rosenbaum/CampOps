#!/usr/bin/env python3
"""
Does the database run the functions the migration files say it runs? (CLAUDE.md trap 7.)

For every function defined in the given migration files, takes the LAST definition in file order
and compares its body, whitespace-normalised, to pg_proc.prosrc on the linked STAGING project.

    python3 scripts/check-function-drift.py supabase/migrations/2026091*.sql
    python3 scripts/check-function-drift.py $(git diff --name-only main -- supabase/migrations)

Exit 1 on any function that is missing or differs.
"""
import json, os, re, subprocess, sys

files = sorted(sys.argv[1:])
if not files:
    sys.exit(__doc__)
last = {}
hdr = re.compile(r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\(', re.I)
for f in files:
    txt = open(f).read()
    for m in hdr.finditer(txt):
        rest = txt[m.end():]
        t = re.search(r'\bas\s+(\$[A-Za-z_]*\$)', rest, re.I)
        if not t:
            continue
        tag = t.group(1)
        last[m.group(1).lower()] = (f, rest[t.end():rest.index(tag, t.end())])

names = sorted(last)
if not names:
    print('no functions in those files'); sys.exit(0)
q = "select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname in (%s)" % \
    ",".join("'%s'" % n for n in names)
out = subprocess.check_output(['scripts/staging-sql.sh', '-c', q], env={**os.environ, 'OUT': 'json'}).decode()
db = {}
for r in json.loads(out[out.index('['):]):
    db.setdefault(r['proname'], []).append(r['prosrc'])
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
bad = 0
for n in names:
    f, body = last[n]
    if n not in db:
        print('MISSING in database:', n, '(', f, ')'); bad += 1
    elif not any(norm(x) == norm(body) for x in db[n]):
        print('DIFFERS from file:', n, '(', f, ')'); bad += 1
print(f'{len(names)} functions checked, {bad} problems')
sys.exit(1 if bad else 0)
