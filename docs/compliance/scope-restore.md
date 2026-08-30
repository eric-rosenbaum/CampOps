# Bringing the parked reviewers and documents back

The module is currently narrowed to **one reviewing party and one document**: Westchester County
Department of Health, and DOH-367. That is a working decision, taken so one flow can be traced
end to end (the form, what fills it, where that data is collected, the finished download)
without four regulatory packages and twenty-two documents in the way.

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

| Parked | Count |
|---|---|
| Reviewing parties | 5: NY State DOH, fire department, State Central Register, county Emergency Services, Justice Center |
| Documents | 21, including DOH-367a, DOH-2040, DOH-2271, DOH-2286 and the county application packet |
| Requirements travelling with a parked party | 6 |

## What this does NOT park

The four regulatory packages (NY-STATE, NY-WESTCHESTER, NY-POOL, NY-BEACH) are all still
enabled, so the county still shows 136 requirements and the written plan still has 96 sections.
Those are camp-level choices made in the setup interview, not catalog state, so they are turned
off there rather than here.

## Where this is enforced

- `compliance_authorities.is_active` — the loader only reads active rows, so a parked party
  disappears from Reviewers, Records, Overview and the hand-off list together.
- `compliance_authority_forms.is_active` — the same, and `activeFormCodes()` in the store
  filters the bundled `NY_FORMS` list, so a parked document cannot be downloaded or land in a
  packet either.
- The Records coverage audit expects requirements only from **active** authorities. Without
  that, parking the fire department would make its one requirement look like a gap, which is
  the opposite of what that check is for.
