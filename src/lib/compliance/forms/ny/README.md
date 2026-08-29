# NY DOH form coordinate maps

Eight of the nine New York children's-camp forms carry **no AcroForm fields** — they are flat
PDFs with a text layer. Values therefore have to be *drawn* at measured positions rather than
set into form fields. These maps are those positions.

Each map was built by anchoring to the form's own printed labels (`page.search_for(label)` →
`Rect`), placing the value just past the label box, and clamping to the next vertical rule so a
long value cannot run into the neighbouring cell. Dates are split into month/day/year and
centred in the gaps between the form's **pre-printed** slashes — we never draw a separator.

Every map was verified by rendering the filled form to PNG and looking at it. A map that
parses is not a map that is correct.

| File | Form | Version | Fields |
|---|---|---|---|
| `doh-367.map.json`  | Facility & Staff Description | 1/12 | 280 |
| `doh-367a.map.json` | Additional Staff Qualifications | 5/07 | 262 |
| `doh-2040.map.json` | Written Plan Checklist | 12/05 | 474 |
| `doh-2271.map.json` | Director Certified Statement | 3/06 | 44 |
| `doh-2286.map.json` | Pool & Beach Safety Plan Checklist | 3/06 | 168 |

## Traps

- **`coordinate_origin` is top-left.** PyMuPDF and pdf-lib disagree here; mixing them silently
  puts values in the wrong place with no error. Convert deliberately.
- **DOH-367a has `/Rotate 90`.** Its coordinates are in *display* space and its map carries
  `page_rotation: 90` plus the exact transform a rotation-ignoring renderer needs. Getting this
  wrong renders every value sideways across the instructions block.
- **Narrow year blanks.** Where the printed rule is ~12.7pt a four-digit year does not fit at
  any legible size; those fields are noted as two-digit.
- **No overflow room.** More than 10 sessions, 3 pool operators, 11 lifeguards or 7 first-aid
  staff has nowhere to go on the printed form — use an attached sheet.

## Re-verifying after a form version changes

Download the new blank, re-run the mapping, fill every field with its own key, render each page
and compare against the proofs in `docs/compliance/proofs/`. Never assume a version bump kept
the geometry.
