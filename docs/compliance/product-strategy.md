# The compliance home base — product thinking

Written 2026-08-31, after mapping every obligation a Westchester camp carries
(`westchester-obligation-map.md`), surveying all 70 pages of the packet
(`packet-contents-survey.md`), and inventorying what the platform already stores (§12 of the map).

This is a brainstorm, not a plan. Opinions are marked as such; the facts behind them are cited to
the map.

---

## 1 · What the pain actually is

Not "filling in forms". Camps have filled in forms for a century. Five things, in the order they
hurt:

**1. Nobody can enumerate their own obligations.** We spent a day with a regulation crawler and a
browser to build the list for one county, and we found duties that appear in no camp packet: the
county workshop is a **permit gate**, every employee needs **two written non-relative references
before starting**, a camp with horses looks like a **stable requiring its own permit**, the DCJS
check must be **repeated annually before arrival** and the web search doesn't satisfy it. If it
took us that to find them, a director running a camp cannot be expected to know them. **The map is
the product before the tracker is.**

**2. The knowledge lives in one person's head, and that person leaves.** Which office the
LDSS-3370 goes to (Mt. Kisco, not White Plains). That ACORD certificates are refused. That the
renewal clock is 60 days before *expiry*, not before opening. None of this is written down at the
camp. Turnover erases it.

**3. It accumulates all year and is assembled once, under time pressure.** The lifeguard's CPR card
arrives in April. The fire drill happens in July. The packet is built the following March by one
person in an empty camp, reconstructing what happened eight months ago from memory and a shoebox.

**4. The consequence is binary and existential.** Not a fine — a permit. The county says it plainly:
incomplete submissions "could delay proposed opening dates." No permit means no season, refunds to
families, broken staff contracts. The everyday version is a two-week delay; the extreme version is
below.

**5. It is judged in person, twice a year, by someone asking in their own order.** The camp is
inspected "twice yearly, including at least once before opening". The artefact that decides the
outcome is not the envelope — it is the pile of paper a sanitarian asks for while standing in the
office.

---

## 2 · Why now

Two things have changed the environment, and both are public record.

**The regulatory floor is rising, fast.** After the July 2025 Guadalupe River flood in which 27
campers and counselors died at Camp Mystic, Texas passed the **Youth CAMPER Act** and the
**Heaven's 27 Camp Safety Act**: annually updated written emergency plans, staff and volunteer
training, camper briefing, parent notification where property sits in a floodplain, consultation
with local emergency management, floodplain rules for cabin siting, and camp communication
requirements. In the state's own review of Camp Mystic's reopening application, regulators found
close to two dozen deficiencies in the emergency plan — maps that did not show cabins relative to
the floodplain among them.

The detail that matters commercially, and that should be stated soberly rather than sold:
**most Texas youth camps have received a notice-of-deficiency letter for their emergency plan**
under the new statutory requirements. An entire state's camps failed the same artefact at the same
time, because the standard moved and nobody told them what "sufficient" now meant.

That is the product's reason to exist, and it is not a hypothetical. New York has not had its
Camp Mystic moment. Its own machinery is already pointed the same way: NYSDOH publishes an annual
incident summary and says explicitly the data is used "to determine if amendments are needed to
Subpart 7-2". Change is coming to every state, and camps will be the last to hear about it.

**Nobody owns this side of the house.** CampMinder, CampBrain, CampDoc, CampSite are registration
and camper-health systems — enrolment, health histories, medications, allergies. That is the
camper side and it is crowded. None of them appears to be regulator-facing: none produces DOH-367,
knows Westchester wants thirteen items, or knows a DCJS check expires. *(Assessment from product
descriptions — worth confirming in the first customer calls.)*

---

## 3 · The thesis

> **A camp should be able to open the product and see, in one place, everything it owes, to whom,
> by when, and whether it can prove it — and be ready for an inspector without preparing.**

Three claims underneath it, each grounded in the map:

- The obligations are **knowable and enumerable**. 155 requirements, 22 documents, 6 authorities,
  one county. We have them.
- The evidence is **already being generated** by the camp in the course of running the camp. §12
  measures it: **77 of 155 requirements are already backed by live platform data**, and **67 are
  `document` — where we hold nothing and ask for a file**.
- The work is **cyclical and dated**, so it can be scheduled rather than remembered.

---

## 4 · The shape

Seven components. The ordering is a claim about sequence, not a list of equals.

### 4.1 The Obligation Map — *the wedge*

The personalised, enumerated list of everything this camp owes, derived from ~15 setup answers.
Grouped by who asks. Each item says what proves it, when it is due, and what happens if it is not
done — we now have the penalties ($250 / $500 / misdemeanour).

This is the demo. A director answers fifteen questions and sees a list of 140 obligations, of
which they have never heard of a dozen. Nothing else on the market can produce that list, and
producing it is *immediately* useful even before anything is tracked.

It is also the honest lead magnet: a free **compliance scorecard** — fifteen questions, your
personal obligation list, and a count of how many you can't currently account for. Genuinely
useful, demonstrates the moat in ninety seconds, and disqualifies nobody.

### 4.2 Inspection Mode — *the moment of truth*

Twice a year someone walks in and asks. One screen, organised the way they ask, every record
either present with its date or honestly missing — and a printable fallback for the sanitarian who
wants paper.

Two upgrades that make this unbeatable:

- **The inspector's own checklist.** Westchester's item 12 is a *self-inspection form* it does not
  publish — that form is literally the county's inspection checklist. Getting it means we know
  exactly what is checked, in order.
- **Deficiency follow-through.** An inspection produces findings; findings must be corrected and
  the correction proved. That is a workflow — finding → owner → evidence → cleared — and nobody
  has it. It is also the moment a camp is most willing to pay.

### 4.3 The staff compliance passport — *where the volume is*

This is the biggest realisation from the map, and I think it reframes the product:

> **Camp compliance is mostly a hiring workflow.**

Look at what attaches to the act of hiring someone: two written non-relative references *before
they start* (§873.1804); a DCJS registry check *before their first day* and *annually before
arrival* (7-2.5(l)); the county's additional NSOPW search; working papers on file at the worksite
for anyone 14–17 (Labor Law §132); certifications with expiry, CPR "may not exceed one year";
Justice Center code of conduct signed at hire and annually, where that regime applies; training
attendance.

A camp with 60 seasonal staff is carrying **several hundred people-shaped obligations that reset
every single year**. That dwarfs the ~13-item packet in volume, and it is exactly the part that is
invisible until an inspector asks for one person's file.

If the product sits in the hiring flow — a checklist that must complete before someone's first day
— most of the year's compliance takes care of itself as a by-product. And the platform is already
half-way: `safety_staff` holds exactly the DOH-367a fields, `staff_certifications` holds provider,
issue date and expiry.

### 4.4 The safety plan, done the way the state intended

The largest single job, and the one Texas just proved is the highest-stakes artefact.

We found that the state publishes a **92-question fill-in-the-blank template** in six sections,
plus ten activity-specific plan templates, plus an appendix checklist — and that NYSDOH offers it
as an **alternative to DOH-2040**, not a companion. Our builder currently mirrors DOH-2040's 76-row
grid, which is a *checklist for a plan that already exists*, not a way to write one.

Rebuild it against the template. The questions are ticks and short answers with the guidance
inline. And note 7-2.4(c)(1): in any year the plan is not updated, the camp owes a **written
affirmation that it remains current** — so the plan is never zero work, and the product should
make the affirmation a one-click artefact.

### 4.5 The compliance calendar

The year with its anchors, scoped to this camp's own dates: per-hire triggers, the annual DCJS
re-check, the workshop, 60 days before opening, 60 days before permit expiry, pre-season
inspection, in-season daily and monthly logs, the 24-hour incident clocks, in-season inspection.

Unremarkable as a feature; indispensable as a spine. Everything else hangs off it.

### 4.6 Evidence that flows in, not evidence that is uploaded

The strategic number is **67 of 155 requirements are `document`**. Every one we move from "upload a
file" to "computed from what you already recorded" is a form field a camp never fills and a piece
of proof that cannot be forgotten.

The five tables §12 says are missing are the ones that would move the most:
**incidents** (there is no incident table at all, against a 24-hour clock and eight forms),
**training attendance**, **background-check dates** (the date is not personal data even though the
result is), **insurance policies**, and wiring up **`safety_licenses`**, which already has exactly
the right shape for a permit register and is not connected to compliance.

### 4.7 What changed this year

Now buildable, because §0 of the map gives every source a sha256. Re-download, re-hash, diff — and
show a camp only what changed *for them*, scoped to their setup answers. A camp with no rifle range
does not care that the riflery form was revised.

The county workshop is the anchor: attendance is a permit gate, it happens once a year, and it is
where the year's changes are announced. A product that knew the date, tracked who attended, and
summarised what changed would be doing something no folder can.

---

## 5 · Why this is defensible

**The map is expensive to build and it decays.** One county took a day of concentrated work with
tooling most people do not have. It then rots — packets are reissued each season, the county code
was amended in August 2025, forms carry revisions from 1993 to 2025. That combination — costly to
create, continuously decaying — is the textbook shape of something worth subscribing to rather
than building in-house.

**And it amortises far better than it looks.** Of the 155 requirements, **142 are state-level**
(Subpart 7-2, plus the pool and beach subparts) and only **13 are Westchester-specific**. The state
layer is reusable for every camp in New York; the county layer is a thin overlay. The second
county in New York is a day's work, not another month. That is a real economic moat and it should
shape the roadmap: **depth in one state, then counties within it** — not breadth across states.

---

## 6 · Lines not to cross

The module's existing posture is right and will come under commercial pressure. Write it down now.

- **Never say "you are compliant."** Say what is recorded and what is not. The permit-issuing
  official's reading is the only one that counts, and `ScopeNote` already says so.
- **Never store the personal screening data.** LDSS-3370 carries 28 years of address history for a
  director's spouse, children and roommates; DOH-2271 is a criminal-history statement; the county
  card form wants a CVV. The product should track *that a check was done and when* — which is what
  an inspector asks — and never the result. Being the compliance product that visibly refuses to
  hold this is a **trust asset**, not a limitation.
- **Don't drift into camper health records.** It is a different, crowded market with a much heavier
  regulatory burden, and the platform has deliberately stayed out (§12.2).
- **Don't promise electronic submission.** There is no endpoint. The output is a correctly
  assembled envelope, and pretending otherwise sets up a failure the camp discovers at the county
  counter.

---

## 7 · What I would build first

If the goal is the fastest path to something a camp would pay for and talk about:

1. **The obligation map, personalised, with the gap count.** It already mostly exists. Make it the
   front door and make it shareable.
2. **The staff passport**, because it is the highest-volume, highest-frequency, most
   inspector-visible surface, and it hooks into hiring — where the work actually happens.
3. **Inspection mode**, because it is the moment of truth and the moment of willingness to pay.
4. **Incidents**, because the clock is 24 hours, the forms exist, and we have nothing.

Then the plan rebuild, then the change feed.

---

## 8 · Open questions I cannot answer from research

These need camps, not more reading:

1. **Who actually does this work** — director, assistant director, office manager? The buyer and
   the user may be different people.
2. **What they use now.** ACA tells camps to use a cloud folder; is that what Westchester camps do,
   or is it still a binder?
3. **What broke last year.** The single best question: "what did the county ask for that you
   couldn't produce?"
4. **Whether the fear is the permit or the inspection.** They imply different first screens.
5. **Whether ACA accreditation is a bigger driver than the state permit** for the camps we would
   sell to. It is voluntary, but it has its own 26-standard documentation review due 1 April, and
   camps that carry it maintain two evidence sets against two calendars.
6. **Would a camp pay for the map alone**, before any tracking? If yes, the product is smaller and
   sharper than we think.
