# Bringing the parked reviewers and documents back

**Nothing is parked as of 2026-08-31.** All six reviewing parties and all twenty-two documents are
active again (migration `20260902120000`), because the next decision is about the shape of the
whole packet — what every document asks for, where that data should live, and how a camp should
get it in — and that cannot be answered from four documents. What every document contains is
surveyed page by page in `packet-contents-survey.md`.

The history is worth keeping, because the narrowing worked and may be worth repeating. The module
was cut to one party and one document (`20260901140000`) so that one flow could be traced end to
end: the form, what fills it, where that data is collected, the finished download. DOH-367a came
back first (`20260902110000`) — the continuation sheet of the same filing, drawn from the same
roster — and bringing it back is where the checklist below came from.

**Nothing was deleted.** Every authority, form, requirement and plan component is still in the
database with its history intact. Two boolean columns decide what is on screen.

## Restore everything

```sql
update compliance_authorities     set is_active = true;
update compliance_authority_forms set is_active = true;
```

That is the whole restore. Reload the page and all six reviewers and all twenty-two documents
are back.

## Restore one thing at a time

```sql
-- One party, with its requirements
update compliance_authorities set is_active = true where code = 'FIRE-DEPT';

-- One document
update compliance_authority_forms set is_active = true where designation = 'DOH-2040';

-- Every document a party issues
update compliance_authority_forms f set is_active = true
  from compliance_authorities a
 where a.id = f.authority_id and a.code = 'WESTCHESTER-OEM';
```

## What is parked right now

Nothing. Six parties, twenty-two documents, 155 requirements.

| Party | Visits site | Documents |
|---|---|---:|
| Westchester County Department of Health | yes | 20 |
| New York State Department of Health | no | 0 |
| Your local fire department | yes | 0 |
| NYS OCFS, State Central Register | no | 1 |
| Westchester County Department of Emergency Services | no | 1 |
| NYS Justice Center | no | 0 |

To park again, invert the restore: `update compliance_authority_forms set is_active = false where
designation is distinct from 'DOH-367';` and the matching statement on `compliance_authorities`.

## What this does NOT park

The four regulatory packages (NY-STATE, NY-WESTCHESTER, NY-POOL, NY-BEACH) are all still
enabled, so the county still shows 136 requirements and the written plan still has 96 sections.
Those are camp-level choices made in the setup interview, not catalog state, so they are turned
off there rather than here.

## What bringing a form back actually takes

Setting `is_active` is the last step, not the only one. Everything that prints only on a parked
form has been **dormant**: `applicableQuestions` hides a question whose every render targets a
parked document, so none of it has been exercised by anyone using the module. Unparking is
therefore the moment its bugs arrive, all at once, on a government form. **Every restored form
still needs this pass**; only DOH-367a has had one. Each of these was real on DOH-367a:

1. **Questions sitting in the wrong group.** The riflery instructor's date of birth was in the
   `key_staff` group, whose block on DOH-367 is headed "Camp director, health director and
   aquatics director" and is built by listing that group. Switching DOH-367a on would have put
   the rifle range instructor under a camp's directors, on the form it does not print on.
2. **Mapped fields with no question at all.** The map had four riflery cells; only the date of
   birth was ever asked. A camp with a range would have printed a birthday under a blank name,
   which is worse than an empty section because a half-filled row reads as a filled one. Check
   every `fields[].key` in the map against the questions and the builder.
3. **Applicability nobody has exercised.** The counselor table's first row is printed
   "16 (Day camps only)" and both of its cells were asked of every camp, so an overnight camp
   would have carried two required answers it must leave blank.
4. **Render it and look at it.** Not "the values are present" — where they land. See
   `__tests__/README.md`; DOH-367a is the form carrying `/Rotate 90`.

The form also needs a readiness function in `formReadiness.ts`, registered in the `READINESS` map
in `usePacketCamp.ts`. Without one it still downloads and still lands in the packet, but it gets
a plain row rather than a detail page — which is the honest state for a form we have not yet
described block by block, and is why that map is opt-in rather than a default.

## Where this is enforced

- `compliance_authorities.is_active` — the loader only reads active rows, so a parked party
  disappears from Reviewers, Records, Overview and the hand-off list together.
- `compliance_authority_forms.is_active` — the same, and `activeFormCodes()` in the store
  filters the bundled `NY_FORMS` list, so a parked document cannot be downloaded or land in a
  packet either.
- The Records coverage audit expects requirements only from **active** authorities. Without
  that, parking the fire department would make its one requirement look like a gap, which is
  the opposite of what that check is for.
