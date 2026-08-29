# The compliance module

What it does, what it deliberately refuses to do, and where the liability sits.

## What a camp sees

A camp answers eighteen setup questions. Those answers switch on the regulatory packages that
apply to them and hide the rules that do not, so a camp with no rifle range never reads a word
about rifle ranges. Today there are two packages, both New York:

| Package | Requirements | Source |
|---|---|---|
| NY-STATE | 78 | 10 NYCRR Subpart 7-2, the children's camp code |
| NY-WESTCHESTER | 13 | The Westchester County permit packet checklist |
| NY-POOL | 36 | 10 NYCRR Subpart 6-1, swimming pools |
| NY-BEACH | 28 | 10 NYCRR Subpart 6-2, bathing beaches |

A camp with water is a regulated bathing facility as well as a camp. It does not file a
separate permit for it: 6-1.3(b) and 6-2.3(b) exempt a children's camp facility from the permit
sections, which is why the county application has pool and beach checkboxes on it.

For each requirement the camp gets a status, a plain-language reason for that status, a link to
the rule text where we have verified it, and somewhere to attach the evidence. They also get the
DOH-2040 written safety plan as 76 editable sections, the official New York forms filled from
their own data, and a single zip to hand their county.

## The one rule the engine follows

**A requirement may only count evidence that is evidence for that requirement.**

This sounds obvious. It is also the thing this module got wrong first and had to be rebuilt
around, so it is worth stating plainly.

The engine reads live platform data — staff certifications, the safety register, drills,
temperature logs, pool chemistry, vehicle paperwork, plan sections — and each requirement
declares an `evidence_rule` saying which slice of that data speaks to it. Early on, a
requirement with no rule was treated as matching *everything*. The results looked great and
meant nothing: all five certification requirements reported the same four certificates, so the
health director's first aid card was reading as proof that the aquatics director was qualified.
Eighteen inspection requirements reported the same five safety items, so "set up the archery
range" showed identical progress to "smoke alarm in every sleeping unit."

Now, a branch that cannot identify its own evidence counts none of it and asks the camp to
attach the record by hand. A requirement scoped to the `fire` category of the safety register
can narrow further on item `type`, because extinguishers and smoke alarms share that category
and one is not evidence for the other. An asset with no registration expiry recorded counts
against the requirement rather than for it.

Under-claiming is safe. Over-claiming is the bug. Requirements deliberately left unscoped are
listed with their reasons in `20260829190000_compliance_inspection_rules.sql`.

## Three-valued applicability

`compliance_applicability(answers, applies_when)` returns `yes`, `no`, or `unknown`.

The distinction that matters is between "you told us you have no rifle range" and "we never
asked." Both used to render as *does not apply to your camp*, which is a claim the product
cannot support for the second one — and the second one happens every time we add a question a
camp answered before it existed.

Unknown now produces a distinct `needs_answer` status that names the missing question, sorts to
the top of the list, and stays in the percentage denominator. Only a requirement the camp has
actually ruled out leaves the denominator.

`applies_when` keys are AND'd. The reserved `any_of` key is OR'd, for rules that fire on either
of two facts (a camp gets the aquatics rules if it has a pool *or* a waterfront). Inside an
`any_of`, one definite hit settles the group even if a sibling is unanswered.

## Where the numbers come from

Status is computed in Postgres by `compute_camp_compliance(camp, season)`, not in the browser.
The client hydrates fourteen stores asynchronously, and a completeness score built from whatever
happened to have loaded is not a number anyone should file a permit on.

Every status carries a `detail` object explaining itself. A camp is never told "missing" without
being told missing what.

## What this module does not do

The `ScopeNote` component states this in the product, next to the percentage, because a
percentage invites people to stop looking. In summary:

- These are the state camp code and the county's permit checklist. **Swimming pools and bathing
  beaches are regulated separately** from the camp code in New York, as are food service,
  building and fire code, vehicle and driver licensing, and employment law. A camp can be at
  100% here and still owe paperwork elsewhere.
- It is a record of what the camp has entered, not a legal opinion and not a clearance to
  operate. The permit is issued by the local health department and their reading of a rule is
  the one that counts.
- A requirement reads as met because the record exists. That is not the same as the underlying
  work having been done correctly.
- Eight of the 78 state requirements are drawn from our reading of the regulation and have not
  been confirmed against the published text. They are marked `needs_verification`, shown without
  a citation link, and counted out loud in the scope note. **Regulatory wording is never quoted,
  only linked, and only when verified.**

## Who reviews a camp

The module is organised twice over the same 91 requirements: by regulation (which package a
rule comes from) and by **authority** (who receives or checks it). The second is what the tabs
are built on, because it is the question a director actually asks.

For a Westchester camp the honest shape is **one inspector and five recipients**:

| Party | Attends? | What they get |
|---|---|---|
| Westchester County DOH | Yes, pre-opening and at least once operating | Everything: permit packet, plan, records |
| Fire department | Municipality's choice | The fire safety plan section |
| NYS DOH | No | Writes the code, publishes the forms; the county enforces |
| State Central Register (OCFS) | No | LDSS-3370 clearances |
| County Emergency Services | No | A camp contact form |
| Justice Center | No | Staff exclusion checks, disability camps only |

`visits_site` is a real column and the UI reads it, because calling five of those six an
"inspection" would misrepresent them. **There is no federal camp inspector.**

## Personal records stay where they are

Nine requirements are satisfied by holding records that are somebody else's personal data:
camper medical histories and care plans, immunisation responses, and staff clearances against
the child abuse register and sex offender registry. Their evidence hints accurately describe
those records, and they sit next to an Upload button.

`holds_personal_records` marks them. The UI tells the camp to keep those where they keep them
and attach a confirmation instead. An inspector checks those records in the health office; a
second copy in a general document store is pure downside. **If you add a requirement whose
evidence names camper health data or a background check result, set this flag.**

## Two plans, and why the row keys are data

There are two written plans, both structured by the state's own checklist: the camp safety plan
(76 components, DOH-2040) and the bathing facility safety plan (24 components, DOH-2286). In
both cases the camp writes the sections here, we render the plan, and the checklist fills from
it, including the page numbers, because we know what page each section landed on.

**Which checklist row a component fills is stored, never derived.** It used to be computed by
slugifying the component title, and that lost seven components whose titles contain an
ampersand: the slugifier collapsed "&" to an underscore, the coordinate map spelled it out, and
a camp that had *written* those sections printed blank rows on the form it files. Three of the
bathing components would have been lost the same way. Two curated data sets joined on a guess
will drift again, so `compliance_plan_templates.form_row_key` holds the link and the test suite
fails if any component lacks one.

The same episode removed ACT-18 "Waterfront Swimming Supervision", which is not a DOH-2040
component at all. We had invented a plan section New York does not ask for.

## The forms

Eight of the nine New York forms carry no AcroForm fields — they are flat PDFs. So values are
not "set", they are drawn at coordinates measured from each form's own printed labels, over the
unmodified official page. A sanitarian recognises these forms and an altered layout reads as a
forgery.

Two traps are handled in `formFiller.ts` because getting either wrong fails silently: the maps
are in top-left origin while pdf-lib draws in bottom-left, and DOH-367a carries `/Rotate 90`
which `drawText` ignores. **Verify form changes by rendering to PNG and looking at them.** Text
being present is not the same as text being in the right cell; that mistake has already shipped
once.

## Adding a jurisdiction

A jurisdiction is data, not code. Adding a county is a seed migration: one row in
`compliance_profiles`, its requirements in `compliance_requirements`, and the answer keys those
requirements switch on added to the setup interview if they are new. No schema change.

If you add a requirement that switches on a new answer key, existing camps will show it as
`needs_answer` until they answer. That is the intended behaviour, not a regression.

## Tests

`supabase/tests/compliance_engine_test.sql` — 36 assertions, hermetic, wrapped in a transaction
that rolls back. Run it against staging:

```
STAGING_DB_URL='postgresql://...' npm run test:compliance
```

The runner refuses a connection string that looks like production, and exits non-zero when an
assertion raises, so it works in CI.

It covers applicability (including the three-valued cases and quoted answers), expired documents
not satisfying, camp-declared N/A outranking the evaluators, and a guard for each over-claiming
defect described above.
