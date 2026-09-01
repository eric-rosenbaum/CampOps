# Everything a Westchester children's camp owes

Every compliance obligation a children's camp in Westchester County carries, by regulator,
regardless of whether this product tracks it today. Built 2026-08-31 to close the gaps named in
§16 of `packet-contents-survey.md`.

**Every line says where it came from and how well it is verified.** Three states:

- **[V]** verified this session against a primary source, cited inline
- **[C]** carried from the existing catalog, itself sourced from the regulation
- **[?]** believed to apply, not yet verified against a primary source — do not show a camp a
  requirement in this state without checking it first

Sources fetched 2026-08-31: the county's camp-operator page; **Westchester County Sanitary Code
Chapter 873, "FINAL VERSION APPROVED 8-5-25"** (PDF created 2025-08-05, supp. 44, 285 pp — the
first time this code has been read); NYSDOH *Sex Offender Registry Search Procedures for
Children's Camps* (3/2013); NYSDOH *Amusement Devices and Similar Equipment at Children's Camps*
(3/2014); NYSDOH *2025 Children's Camp Incident Summary Report*; Cornell LII for 10 NYCRR 7-2.4,
7-2.8, 7-2.25 and the Subpart 7-2 section list.

**Second pass, same day, through a real browser** (Claude in Chrome): the sites that refuse
automated requests — `health.ny.gov`, `ny.gov`, `dol.ny.gov` — were read directly, and every item
they settle is now **[V]**. `regs.health.ny.gov`, `nyc.gov` and `municode` still refused; Cornell
LII (`law.cornell.edu/regulations/new-york/10-NYCRR-<section>`) serves the same regulation text and
is the working route to it.

---

## 0 · The document library

**Every document named anywhere in this register is saved in `docs/compliance/sources/`** — 71
files, 23 MB, downloaded 2026-08-31 from the issuing body (a browser User-Agent is required;
plain automated requests get 403). The nine official camp forms we already ship stay where they
are, in `public/forms/ny/`, and are not duplicated here.

The sha256 column is the point, not decoration: it is the baseline a "what changed this year"
check diffs against. Re-download, re-hash, and anything whose hash moved is a document that
changed.

### `sources/nysdoh/` — NYSDOH — New York State Department of Health

| File | What it is | Size | Pages | sha256 (first 16) |
|---|---|---:|---:|---|
| `17371.pdf` | Prevent the spread of mumps at summer camp | 255 KB | 1 | `b57631480c97864d` |
| `17372.pdf` | Prevent the spread of whooping cough at summer camp | 247 KB | 1 | `c8c81d02df29b589` |
| `17373.pdf` | Prevent the spread of chickenpox at summer camp | 262 KB | 1 | `a4d5f496ac9c9feb` |
| `17450.pdf` | Prevent the spread of chickenpox (Spanish) | 264 KB | 1 | `ec2b35b7c6480003` |
| `17451.pdf` | Prevent the spread of mumps (Spanish) | 247 KB | 1 | `90552f6a92c27de3` |
| `17452.pdf` | Prevent the spread of whooping cough (Spanish) | 254 KB | 1 | `92fe060ce3efeec9` |
| `2218.pdf` | Prevent the spread of measles at summer camp | 251 KB | 1 | `ef768a8fc82222af` |
| `2219.pdf` | Prevent the spread of measles at summer camp (Yiddish) | 1830 KB | 1 | `6410f9c77783be90` |
| `2220.pdf` | Prevent the spread of measles at summer camp (Spanish) | 252 KB | 1 | `54dfb0b3e90fc6f5` |
| `3022.pdf` | Bat awareness tips | 243 KB | 2 | `a561ea7dadd0d357` |
| `3602.pdf` | Required Reporting for Injury and Illness (pub 3602) | 668 KB | 1 | `1838d47a0f87dd41` |
| `amuse.pdf` | Amusement devices and similar equipment at children’s camps (DOH/DOL MOU) | 26 KB | 2 | `19ded5e1f43b9a26` |
| `aquacert.pdf` | Fact sheet — aquatic certifications | 88 KB | 4 | `6c4f1cdace71a6ce` |
| `boating_fact_sheet.pdf` | Fact sheet — supervision of boating activities | 233 KB | 2 | `b78faf8927f3f97f` |
| `bunk_bed_guardrails.pdf` | Fact sheet — bunk bed guardrail requirements | 1350 KB | 3 | `eacb458805d0c781` |
| `cad.pdf` | Fact sheet — camp aquatics director | 27 KB | 1 | `b17b6cf7ea8f580d` |
| `campers_dd_faq.pdf` | Requirements for campers with disabilities — FAQ | 81 KB | 4 | `d653a4b851452f98` |
| `camps_aed_guide.pdf` | AED guide for children’s camps | 149 KB | 2 | `f9fb342024ed03bd` |
| `camps_dd_guide.pdf` | Requirements for camps for children with developmental disabilities | 228 KB | 6 | `f2cda94bd5430f6b` |
| `camps_incident_report.pdf` | 2025 Children’s Camp Incident Summary Report | 2231 KB | 16 | `e1ab7d3e26533d79` |
| `camps_polio_letter.pdf` | Polio guidance for camp operators (April 2023) | 74 KB | 3 | `1b7833686a753353` |
| `camps_swim_safety_notes.pdf` | Children’s camps swimming safety — speaker notes | 2953 KB | 17 | `eab05445d1eb8b95` |
| `camps_swim_safety_slides.pdf` | Children’s camps swimming safety — slides | 1053 KB | 17 | `b56023527a5b248a` |
| `cc_safety_plan_archery.docx` | Activity plan template — archery | 44 KB | — | `92e66933407a20ec` |
| `cc_safety_plan_boating.docx` | Activity plan template — boating | 65 KB | — | `500b68fd2c0db7be` |
| `cc_safety_plan_camp_trip_swimming.docx` | Activity plan template — camp trip swimming | 82 KB | — | `ab148776678d2624` |
| `cc_safety_plan_camp_trips.docx` | Activity plan template — camp trips | 51 KB | — | `6d3c9c84dc535ca6` |
| `cc_safety_plan_challenge_course.docx` | Activity plan template — rope/challenge course | 63 KB | — | `fc78969496ba6b16` |
| `cc_safety_plan_generic_activity.docx` | Generic Activity Plan template | 50 KB | — | `5469e193c7081436` |
| `cc_safety_plan_horseback_riding.docx` | Activity plan template — horseback riding | 52 KB | — | `86042f2abcc76510` |
| `cc_safety_plan_riflery.docx` | Activity plan template — riflery | 51 KB | — | `e9c795c917f4bd00` |
| `cc_safety_plan_sports.docx` | Activity plan template — sports | 58 KB | — | `eee733e710e86c29` |
| `cc_safety_plan_spray_grounds.docx` | Activity plan template — spray grounds | 57 KB | — | `393d2b11d907604a` |
| `cc_safety_plan_swimming.docx` | Activity plan template — swimming | 136 KB | — | `0848d27900e8fc5f` |
| `childrens_camp_safety_plan.docx` | Children’s Camp Safety Plan Template — main body, 92 questions | 281 KB | — | `2c66f8731c3b82f9` |
| `cpr.pdf` | Fact sheet — CPR certification | 32 KB | 1 | `1b87f4edab0ebcf7` |
| `doh-2135.pdf` | DOH-2135 Corporation Officers and Partners | 333 KB | 1 | `a36fe07293a66be1` |
| `doh-2249.pdf` | DOH-2249 Plan Review Fee Determination Schedule | 57 KB | 1 | `c62825eba43ef3f3` |
| `doh-3915.pdf` | DOH-3915 Application for a Permit to Operate (state camp permit application) | 48 KB | 4 | `be9ccaa4a5db1f76` |
| `firstaid.pdf` | Fact sheet — first aid certifications | 40 KB | 3 | `41d4ef30e182eb93` |
| `learn_to_swim.pdf` | Fact sheet — learn-to-swim programs | 20 KB | 1 | `b02bad7655a109fb` |
| `measles_immunization_record_template.pdf` | Measles immunization records summary template | 128 KB | 2 | `d4010e3783ff0f24` |
| `measles_infirmary_poster.pdf` | Recognizing measles — infirmary flyer | 547 KB | 1 | `2c34a8e3da93b4a8` |
| `measles_reference_guide_camp_operators.pdf` | Measles reference guide for camp operators | 265 KB | 2 | `4147833e11b8e8e7` |
| `parent_polio_guidance.pdf` | Polio guidance for parents (April 2023) | 62 KB | 1 | `38c7ef07bd0a858d` |
| `park_sign_order_form.pdf` | Wild animals caution signs — order form | 116 KB | 1 | `a12bc2df8efb28dc` |
| `psi.pdf` | Fact sheet — progressive swimming instructor | 21 KB | 1 | `3ff08ed549345dd2` |
| `pub-3601-families.htm` | Regulated Children’s Camps: What Families Need to Know (pub 3601) | 34 KB | — | `963be8499514c078` |
| `pub-3603-requirements.htm` | Requirements for Children’s Camps in New York State (rev. April 2024) — staffing matrix + required submissions | 45 KB | — | `0dddc5e3cee5bbfc` |
| `site_field_assessment_tool.pdf` | Wilderness swimming site field assessment tool | 21 KB | 1 | `91bf6d5952cdcabf` |
| `swim_fact_sheet.pdf` | Fact sheet — swimming | 126 KB | 4 | `7f0b956ede3a3380` |
| `trip_swimming.pdf` | Fact sheet — camp trip swimming program safety certifications | 25 KB | 1 | `148d82b825177ee6` |
| `vaccine.pdf` | Procedures for handling vaccine-preventable diseases at camp | 190 KB | 1 | `240548c9e8b60e5d` |
| `vpd_camp_letter.pdf` | Letter to camp operators on vaccine-preventable diseases — 30 March 2026 | 207 KB | 4 | `73d02e771f1e90ab` |
| `water_startup.pdf` | Acceptable annual water supply start-up procedures for seasonal public water systems | 123 KB | 6 | `37c8c5dd15bff271` |

### `sources/wcdoh/` — WCDOH — Westchester County Department of Health

| File | What it is | Size | Pages | sha256 (first 16) |
|---|---|---:|---:|---|
| `CHAPTER_873_APPROVED_8-5-25.pdf` | Westchester County Sanitary Code Chapter 873 — approved 5 Aug 2025 | 2003 KB | 285 | `9ce992b7d28ad799` |
| `Camp-Measles-Cover-Memo-2019.pdf` | Measles cover memo (2019) | 120 KB | 2 | `46c465246e416c27` |
| `Camp-VPD-Measles--Letter-2019-FINAL.pdf` | Vaccine-preventable disease / measles letter (2019) | 412 KB | 5 | `7903bb93a8e26845` |
| `CampNYSChildSafetyAct.pdf` | NYS sex offender registry search procedures for children’s camps | 12 KB | 1 | `8b6e9c32e44b878d` |
| `Camp_FecalIncidentResponse2010.pdf` | Fecal incident response procedure | 1452 KB | 4 | `4787de3a1f9914b1` |
| `WCDH_Reportable_Disease_Poster10-2025.pdf` | Communicable disease reporting at camp (rev. Oct 2025) | 172 KB | 1 | `9fdebc608c06a8cc` |
| `Water_Contam_Response_Log.pdf` | Water contamination response log | 9 KB | 1 | `e18a552aedca26e5` |
| `camp_templateletter_meningococcal.pdf` | Overnight camp parent letter template — meningococcal (PHL 2167) | 21 KB | 2 | `fb0d4b2dc568bcb8` |
| `creditcardpaymentauthform.pdf` | Credit card payment authorization form | 223 KB | 1 | `ae02b8bfee62a2b8` |

### `sources/other/` — Incident report forms (state forms, hosted by other counties/NYC)

| File | What it is | Size | Pages | sha256 (first 16) |
|---|---|---:|---:|---|
| `camp-alleg-of-abuse-rptform.pdf` | NYS-61 Allegation of abuse report | 327 KB | 2 | `78798d93b49c670e` |
| `camp-epine-admin-rptform-DOH-61e.pdf` | DOH-61e Epinephrine administration report | 288 KB | 2 | `372ddc04316f71b9` |
| `camp-fire-rptform.pdf` | NYS-61 Fire report | 180 KB | 1 | `fae7f1beeade9ec8` |
| `camp-ill-outbk-rptform.pdf` | DOH-61b Illness outbreak report | 279 KB | 3 | `e48a3d5f9e4c57cd` |
| `camp-injury-rptform.pdf` | DOH-61a Children’s camp injury report | 327 KB | 3 | `72cd7f5cd51f4b5a` |
| `camp-mvInjury-rptform.pdf` | NYS-61h Multiple victim injury report | 351 KB | 3 | `0fa28de0be9f893c` |
| `camp-pot-rabies-exp-rptform.pdf` | NYS-61 Potential rabies exposure report | 402 KB | 3 | `493f31b301d0abad` |


### `sources/regulations/` — the regulations themselves, section by section

Downloaded from **regs.health.ny.gov**, the Department's own publication (not a mirror), one HTML
file per section plus each subpart's index. **331 files.** The effective date is the stamp the
publisher shows for the subpart — this is the "as of" a re-verification compares against.

| Directory | Subpart | Sections | Effective date | Size |
|---|---|---:|---|---:|
| `subpart-14-1/` | 10 NYCRR Subpart 14-1 — Food Service Establishments | 91 | 03/20/2019 | 1384 KB |
| `subpart-5-1/` | 10 NYCRR Subpart 5-1 — Public Water Supplies | 72 | — | 1422 KB |
| `subpart-5-4/` | 10 NYCRR Subpart 5-4 — Operator Certification | 8 | 02/14/2001 | 255 KB |
| `subpart-6-1/` | 10 NYCRR Subpart 6-1 — Swimming Pools | 31 | 07/06/2011 | 533 KB |
| `subpart-6-2/` | 10 NYCRR Subpart 6-2 — Bathing Beaches | 20 | 07/06/2011 | 340 KB |
| `subpart-6-3/` | 10 NYCRR Subpart 6-3 — Recreational Aquatic Spray Grounds | 24 | 03/28/2007 | 390 KB |
| `subpart-7-2/` | 10 NYCRR Subpart 7-2 — Children's Camps | 25 | 06/22/2016 | 413 KB |

### `sources/webpages/` — the pages that change between seasons

| File | Size | sha256 (first 16) |
|---|---:|---|
| `dol-amusement-device-permitting.htm` | 36 KB | `23a742812ff9d626` |
| `nys-sexual-harassment-training.htm` | 53 KB | `c8781f3f27941949` |
| `nysdoh-camps-operators-page.htm` | 54 KB | `031742a96503edff` |
| `nysdoh-sor-search-procedures.htm` | 26 KB | `e59c3725280ac508` |
| `nysed-working-papers.htm` | 63 KB | `8c9f0ab8f15c6454` |
| `wcdoh-camp-operator-page.htm` | 58 KB | `2d24a3519ad79dad` |

Also held: `docs/compliance/proofs/wc-chapter-873-2025.pdf` (the county code, 285 pp) and the nine
official forms in `public/forms/ny/` with provenance in that directory's `SOURCES.md`.

**Nothing in this register now rests on a link alone.** Every regulation, form, fact sheet,
template and guidance letter cited below is a file in this repository.

**Known gap in the library:** the *Children's Camp Self-Inspection Form* (item 12 of both county
packets) is published nowhere — not on the county page, not in either packet, not by the state.
It has to be obtained from the county by phone.

---

## 1 · Westchester County DOH — the camp permit

The permit-issuing official. Inspects **at least twice annually** (county page; 7-2.5(p)(2)).

### 1.1 The application itself

| # | Obligation | When | Evidence | Source |
|---|---|---|---|---|
| 1 | Apply for the permit | **60 days** before the first day of operation | The 13-item package | 7-2.4 **[V]** |
| 2 | Non-refundable fee **$200** (charitable and municipal operations exempt) | With the application | Cheque, money order or the county card form | 7-2.4 (fee set 4/1/2011); county packet **[V]** |
| 3 | Permit expires one year from issuance, at season close, **on change of operator**, on a stipulated date, or on revocation | — | — | 7-2.4 **[V]** |
| 4 | **Post the permit conspicuously on the premises** | While operating | The posted permit | 7-2.4 **[V]** |
| 5 | The 13 documents surveyed in `packet-contents-survey.md` §12 | With the application | — | County packet **[V]** |

A completed, certified **self-inspection** may substitute for one of the official's inspections,
at the official's election (7-2.4(d)(2)(ii)) **[V]**. This is the county's item 12, the form that
is named in both packets but published nowhere — see the survey.

### 1.2 County-only duties — Chapter 873, Article XVIII

**None of these five were in the catalog before today.** They are county law, additional to
Subpart 7-2, and three of them are things a camp can fail without ever touching a form.

| Obligation | Detail | Cadence | Source |
|---|---|---|---|
| **Nonswimmer identification** | A camper assessed as a nonswimmer must be "readily distinguishable from an intermediate or swimmer" by a conspicuously coloured **bathing cap, headband, wrist tag** or other WCDOH-acceptable alternative. Waivable in writing by the commissioner. | Continuous | §873.1800 **[V]** |
| **Annual camp workshop attendance** | The camp director, assistant director **or** operator must attend the county's annual children's camp workshop. Failure is a code violation, carries a **penalty**, and requires attending a **video presentation** of the workshop. **A permit will be denied** on failure to attend the video and pay the penalty. | Annual, before permit | §873.1801 **[V]** |
| **Off-site swimming: lifeguard identification** | Camp lifeguards at off-site pools or beaches must have **garments identified with the camp's name**. | Every off-site swim | §873.1802(1) **[V]** |
| **Off-site swimming: lifeguard ratio** | One qualified lifeguard per **25 bathers**, at exclusive-use camp water and at off-site facilities owned by others. | Every swim | §873.1802(2) **[V]** |
| **Off-site swimming: counselors in the water** | Counselors must be **in the water** directly supervising nonswimmers at **1:10** over age 8, **1:8** under 8, **1:6** under 6. | Every off-site swim | §873.1802(3) **[V]** |
| **Two written references per employee** | The director/operator must **obtain, review and evaluate at least two written references for every prospective employee before employment begins**. Neither may be a relative. A written record of satisfactory completion is kept on file for department review. | Per hire | §873.1804 **[V]** |

§873.1803 (parental notification) was **repealed 5-15-2008** and is reserved — worth recording so
it is never re-added from an old source **[V]**.

### 1.3 County permit machinery — Chapter 873, Article III

General to every county permit, read today **[V]**:

| Obligation | Detail | Source |
|---|---|---|
| **Renewal deadline** | A renewal application must be submitted **not later than 60 days before the permit expires** — a separate clock from 7-2.4's 60-days-before-operation | §873.301(2) |
| **Posting** | The permit is **kept on the premises it covers**, posted conspicuously, **clearly visible to the public**, and available for inspection at all times | §873.301(4) |
| **Conditions** | The permittee must comply with the conditions written into the permit, not only the code | §873.301(3) |
| **Ownership** | The permit remains department property and is surrendered on demand at expiry, suspension or revocation | §873.301(5) |
| **Not transferable** | — | §873.303 |

### 1.3b County food service and water system permits

Two more county permits a camp can need, both separate from the camp permit **[V]**:

- **§873.441** — "No person shall operate or maintain a **food service establishment** in the
  county without first having made application for, and obtaining, a permit from the department."
  A camp kitchen is a food service establishment; fees are in §873.2103.
- **§873.710** — a camp running its **own water supply system** must have it under the supervision
  of a **qualified water supply system operator** (state certificate of the proper grade), keep
  **complete daily records** of treatment and disinfection on department-approved forms, **forward
  a copy to the department within ten days of each month's end**, and hold a **permit to operate
  the water system**. NYSDOH publishes *Acceptable Annual Water Supply Start-up Procedures for
  Seasonal Public Water Systems* (`water_startup.pdf`) for exactly this case.

### 1.4 County communicable disease reporting — Article IV

| Obligation | Deadline | Source |
|---|---|---|
| The person in charge of a camp must report a case of any presumably communicable disease when no physician is in attendance | **24 hours** of knowledge | §873.407 **[V]** |
| The person in charge of a camp must report a group of illnesses believed due to spoiled or poisonous food | **Immediately** | §873.409 **[V]** |

The county publishes a *Communicable Disease Reporting at Camp* poster (rev. 10-2025) and a
*Fecal Incident Response* procedure; neither is in the catalog **[V]**.

### 1.5 Three required state forms we had never seen

The state's own *Requirements for Children's Camps in New York State* (**revised April 2024**,
saved as `pub-3603-requirements.htm`) lists the required submissions. Three are forms absent from
the catalog, from the county packets, and from every previous survey **[V]**:

| Form | What it is | When |
|---|---|---|
| **DOH-3915** | *Application for a Permit to Operate* — the **state's** permit application, covering every facility type. For a children's camp, "capacity" means the maximum campers approved at one time. 4 pp | Every application. Westchester substitutes its own county application, so **confirm whether the county still wants DOH-3915** |
| **DOH-2135** | *Corporation Officers and Partners* — "complete only if the camp is operated or owned by private corporation(s) or partnership(s)" | With the application, when incorporated |
| **DOH-2249** | *Plan Review Fee Determination Schedule* — "complete only for new building or bathing facility construction or major renovations". Carries its own exemption for religious, educational, philanthropic and municipal operators | With construction plans |

Plus a **Children's Camp Fee Determination Schedule Form**, named in the same list, for which the
page gives no link **[?]**.

The same page states the deadline in operational terms worth quoting to a camp: submissions go in
**at least 60 days before children and staff arrive**, the LHD then "will review your submissions
and arrange a preseason inspection", and "if submissions are incomplete, items requiring
additional information will be identified for correction and resubmission, **which could delay
proposed opening dates**."

### 1.6 The staffing and ratio matrix — the authoritative version

From the same April 2024 publication **[V]**. This is the single most useful table the state
publishes and nothing in the catalog holds it in this form.

| Role | Minimum ratio | Qualifications |
|---|---|---|
| **Camp director** | 1 required | Bachelor's degree, **or** ≥25 (overnight) / ≥21 (day); **24 weeks** administrative or supervisory camping experience; submits **LDSS-3370 and DOH-2271** |
| **Camp health director** | 1 required, **on-site** | Physician, NP, PA, RN, LPN (all NYS-licensed), EMT, or other person acceptable to the permit-issuing official. A designee named in the medical component of the plan may be on-site instead |
| **First aid staff** | **1:200** | In addition to the health director or on-site designee (overnight); the ratio *includes* them at day camps |
| **CPR staff** | **1:200** | On-site aquatic staff with appropriate CPR may count |
| **Camp aquatics director** | 1 required where there is an on-site bathing facility | ≥21; one season as a NYS camp aquatics director, **or** 2 seasons totalling ≥12 weeks as a camp lifeguard where more than one guard supervised, **or** 18 weeks as such a lifeguard |
| **Progressive swimming instructor** | 1 required for swim assessment, **on-site and off-site** | Assesses every camper's swimming ability |
| **Lifeguard** | **1:25** at on-site facilities and on camp trips where the off-site facility provides no guards | ≥17 (up to **50% may be 16**); **wilderness swimming guards ≥18**; each guard supervises no more than **3,400 sq ft of pool** or **50 yards of beach front** |
| **Camp trip swimming staff** | **1:75** where the off-site facility does provide qualified guards | Lifeguard certification or acceptable camp-trip-swimming-program-safety training |
| **Counselors during swimming** | **1:10 on-site / 1:8 off-site** (age 8+); **1:8 / 1:8** (ages 6–7); **1:6 / 1:6** (under 6) | Poolside, beachfront **or in the water**, providing visual surveillance |
| **Trip leader** | 1 per trip | ≥18; has participated in **≥3 similar out-of-camp trips** as camp staff, or equivalent training |
| **Counselors on trips** | **1:8** (6+), **1:6** (under 6) | At least one counselor accompanies the trip leader on every trip |
| **Vehicle staff** | **1:12** | May also be the driver. **Driver ≥18** with a licence appropriate to the vehicle |
| **Activity leader** | 1 per on-site activity | Competent in the activity; **≥18** for hiking, camping, rock climbing, horseback riding, bicycling, swimming or boating |
| **Counselors** | **1:10** overnight (8+), **1:8** overnight (under 8), **1:12** day camps | Overnight **≥18 (20% may be 17)**; day **≥16**; experience in camping and supervising children or acceptable training. **"Camp operator must verify prospective counselor's background and character through inquiries, including character references"** |
| **Counselors-in-training** | May fill at most **10% of the staff positions** needed to meet ratios | ≥16 overnight / ≥15 day; **2 seasons prior camping experience**; supervised as campers; **may not independently supervise campers** |

That counselor reference-check line is the **state** basis for Westchester's §873.1804, which
turns "inquiries, including character references" into a hard **two written non-relative
references, before employment, on file**.

---

## 2 · NYSDOH — Subpart 7-2, the operating rules

78 requirements are already encoded **[C]**; see `ny-subpart-7-2-extraction-notes.md`. Verified
today: the subpart still has its original **25 sections**, and Cornell shows no version prior to
the text we extracted **[V]**. What is worth pulling out here is the part that is *reporting*
rather than *operating*, because the module has the rules but none of the forms.

### 2.1 Reportable incidents — 7-2.8(d), within **24 hours**, to the permit-issuing official **[V]**

- Camper or staff injury/illness resulting in **death**, or requiring **resuscitation**,
  **hospital admission** (an ER visit is not admission), or **administration of epinephrine**
- **Eye, head, neck or spine** injuries requiring referral to a hospital or other facility
- **Bone fractures or dislocations**
- **Lacerations requiring sutures, staples or medical glue**
- **Second or third degree burns to 5% or more** of body surface
- **Animal exposures** potentially infected with rabies
- **Physical or sexual abuse allegations**
- **Suspected water-, food- or air-borne illness**

Staff injuries are reportable only at the death/resuscitation/admission level.

All injuries, illnesses and reportable diseases — not only the reportable ones — go to the camp
health director and into the **medical log**; suspected communicable disease requires isolation.

**The eight forms this is filed on are not in the catalog** (survey §16A): DOH-61a injury, DOH-61b
illness outbreak, NYS-61 abuse allegation, NYS-61 fire, NYS-61h multiple-victim injury, NYS-61
rabies, NYS-61e/DOH-61e epinephrine, plus the county's water contamination response log.

The state aggregates these into an annual **Children's Camp Incident Summary Report** — 1,113
reportable incidents across 2,465 camps in 2025 — and says explicitly that the data is used "to
determine if amendments are needed to Subpart 7-2" **[V]**. That report is a leading indicator of
regulatory change and a good thing for a compliance product to watch.

### 2.2 Camper health records — 7-2.8(c) **[V]**

A current **confidential medical history** per camper including an **immunization record** with
dates for diphtheria, *Haemophilus influenzae* type b, hepatitis B, measles, mumps, poliomyelitis,
rubella, tetanus and varicella; parent/guardian **emergency contact information on file and
updated annually**.

> Personal health data. Belongs under the module's `holds_personal_records` rule — the camp keeps
> it where it is, and the platform tracks only that the duty exists.

### 2.3 Sex offender registry — 7-2.5(l) and PHL Article 13-B **[V]**

From the NYSDOH fact sheet (3/2013):

- Applies to **all** children's camps (day, traveling day, overnight) and **all prospective
  employees and volunteers** "regardless of their job title/responsibilities or employment status
  (full or part-time)"
- Checked against the **DCJS** Sex Offender Registry **before the first day of work** and
  **annually thereafter prior to arrival at camp**
- **The DCJS website search does not satisfy the requirement** — it returns only Level 2 and 3
  offenders. Submit by email, CD, fax, mail or telephone
- **Documentation:** the list submitted to DCJS and the DCJS response letter kept on file at camp
  and available at inspection. Telephone screening requires recording the date, the response and
  the **DCJS screener ID number**

**The county goes further than the state**, and this is not encoded anywhere: the county's page
requires the check for "all camp staff, volunteers, **and persons that frequent the camp**", and
separately through the **Dru Sjodin National Sex Offender Public Website advanced search**, with
"evidence of such search maintained on-site" **[V]**.

Catalog today: NY-0504 covers the state rule only.

### 2.4 The state publishes the plan — and it is not DOH-2040

The most consequential thing found today for the plan builder. The state's required-submissions
list reads: *"Written Plan Checklist (**DOH-2040**) **or** Health Department Safety Plan
Template"* **[V]**. The template is an **alternative to the checklist**, not a companion to it.

`childrens_camp_safety_plan.docx` is a fill-in-the-blank Word document of **92 numbered questions
in six sections** — not 76 tick boxes:

| Section | Questions | Topics |
|---|---|---|
| I. Personnel | 1–4 | Chain of command · staff descriptions · procedure for verification of staff qualifications |
| II. Facility operation and maintenance | 5–23 | Potable water supply · water samples · sewage treatment · transportation · housing and grounds · food protection · waterfront physical facility maintenance |
| III. Fire safety | 24–47 | Evacuation · fire prevention · coordination with local fire officials · alarm and detection · extinguisher type, location and maintenance · inspection and maintenance of exits · **campfire safety** · fire drills · electrical safety |
| IV. Medical requirements | 48–74 | Health centre · health director · first aid/CPR staff · camper confidential medical histories · **individual treatment, care and behavioural plans** · initial health screening · daily health surveillance · medical, nursing and EMS provisions · location and use of supplies · **preventing child abuse** · storage and administration of medicines · injury and illness prevention · medical log · universal precautions · reporting of incidents · supervising sanitation |
| V. Supervision and activity safety | 75–88 | Camper supervision · emergencies · activity safety · **weather conditions** · **incidental water immersion** |
| VI. Orientation and training | 89–92 | Staff training · camper orientation |

It ships with an **appendix checklist** — camp map (labelled with buildings, bunks, activity
areas, emergency meeting area, on-site water supplies, septic systems), camper health history
form, chain of command schematic, emergency response procedure, evacuation route, **PAD
collaborative agreement for the AED**, sketch of staff positioning during sleeping/rest hours —
and **ten activity-specific plan templates**: archery, boating, camp trips, camp trip swimming,
horseback riding, riflery, rope/challenge courses, sports, spray grounds, swimming. A **generic
activity plan** covers the rest, and the template names which activities need one: aquatic theme
parks, arts and crafts, bicycling, cooking, go-carts, gymnastics, hiking, ice skating, mountain
boarding, nature study, organized games, petting zoo, roller skating, skate boarding, tubing,
whittling/woodcarving.

The questions are not bare prompts. The weather section, for example, supplies the lightning and
heat-index background, then asks **who** monitors conditions (Camp Director / Program Director /
other), by what **means of notification** (direct verbal contact / cell phone / portable radios /
public address), **which activities** are suspended, which **buildings are designated shelters**,
what instructions are given to those caught away from shelter, and confirms the thirty-minute
rule before outdoor activity resumes.

> Every one of those is a *tick or a short answer*, not an essay. This is the shape a camp can
> actually complete, published free by the regulator, and it is a far better model for the plan
> builder than DOH-2040's 76-row page-number grid — which is a **checklist for a plan that already
> exists**, not a way to write one.

### 2.5 This season's live guidance

`vpd_camp_letter.pdf`, dated **30 March 2026**, is the current letter to camp operators **[V]**.
It carries one hard duty: *"Camp operators are **required to immediately report any suspected or
confirmed vaccine-preventable disease** to the permit-issuing official and the city or county
health department."* It also confirms that Subpart 7-2 requires camps to **maintain immunization
records for all campers but does not specify which vaccines are required for attendance** —
individual camps may set their own policy, and the state recommends the school-entry schedule
under PHL art. 21, tit. 6, §2164.

An annual letter like this, plus the county workshop, is where a camp's year actually changes.

### 2.6 The annual affirmation nobody had noticed

7-2.4(c)(1), read in the official text **[V]**, ends with a duty the catalog does not hold:

> "The plan must be reviewed **annually** by the camp operator and updated as required to maintain
> compliance with current standards. Plans that are updated must be submitted to the
> permit-issuing official. **In any year in which an update is not required, the camp operator must
> submit written affirmation to the permit-issuing official that the approved plan remains
> up-to-date and complete.**"

So there is no year in which a camp files nothing about its plan: either the updated plan, or a
written affirmation. That is exactly what DOH-367's "previously submitted on \_\_/\_\_/\_\_ and this
plan remains up to date and complete" box **is** — the affirmation, in a tick box. The same
subdivision also requires a fresh application "when the name, ownership or operator of the camp is
changed."

---

## 3 · NYS Justice Center + OCFS — camps for children with developmental disabilities

7-2.25(b), applying to a "children's camp for children with developmental disabilities" as defined
in 7-2.2. **Confirmed: 7-2.2 defines it as "a children's camp with 20 percent or more enrollment of
campers with a developmental disability"** **[V]** — word for word the question DOH-367 already
asks, so the trigger is a form answer we already collect.

> This resolves the over-firing bug in the catalog: NY-2508/2509/2510 currently fire on
> `enrolls_campers_with_disabilities`, which is a much wider class. The correct trigger is already
> collected as a form answer.

| Obligation | Detail | Source |
|---|---|---|
| Director qualifications | Bachelor's in physical education, recreation, education, social work, psychology, rehabilitation or a related field, **plus** specialised training or one year of experience with developmental disabilities | 7-2.25(b) **[V]** |
| Director not excluded | Director must not be on the Justice Center **staff exclusion list** | **[V]** |
| Staff screening — **three** registries | Justice Center **SEL**; OCFS **State Central Register**; **sexual abuse registry** | **[V]** |
| Mandated reporter training | Per Social Services Law article 11 | **[V]** |
| Code of conduct | Justice Center code of conduct issued **at initial employment and annually**, with **documented acknowledgment** | **[V]** |
| Incident reporting | **Immediate** report of abuse, neglect and significant incidents to the permit-issuing official **and** the Justice Center's **Vulnerable Persons' Central Register** | **[V]** |
| Investigation | Begin within **5 business days**; **written report within 45 days** | **[V]** |
| Corrective action | Plan submitted within **45 days**, implemented within **90 days** | **[V]** |
| Incident review committee | Required unless exempted | **[V]** |
| Staffing | An additional counselor in vehicles transporting these campers; health director must be a physician, PA, RN or LPN and **on-site** during operation | **[V]** |

---

## 4 · Westchester County DOH — the bathing facility, if there is water

A camp pool or beach is a regulated bathing facility in its own right. The camp application ticks
"Children's Camp Swimming Pool / Bathing Beach / Aquatic Spray Ground", so the permit normally
rides on the camp permit — but the county code imposes duties either way.

| Obligation | Detail | Source |
|---|---|---|
| **Permit to operate** | No pool (6-1) or beach (6-2) may operate without a county permit | §873.1200, §873.1201 **[V]** |
| **Qualified pool treatment operator** | Any pool **over 1,000 sq ft** or **disinfected with gas chlorine** must be maintained by an operator holding a NYSDOH **Water Treatment Plant Operator Certification Type A or B**, or an adequate equivalent course | §873.1202 **[V]** |
| **AED required** | Every pool and beach operator (except homeowner pools) must acquire and operate an **AED under a written collaborative agreement with an emergency health care provider**; **file a copy with NYSDOH** and notify the regional council of the AED's existence, location and type **before operating it**; protocols to maintain and test to manufacturer standards; **signage at the main entrance**; an implementation plan covering placement, **at least one person present trained within the preceding 24 months**, maintenance records, an equipment checklist and a cardiac emergency protocol | §873.1204 **[V]** |
| **Life-saving equipment** | §873.1203(1): by pool size — e.g. pools under 5 ft deep and ≤2,000 sq ft need two USCG-approved ring buoys ≥18 in, readily accessible near the deck, kept in good repair | §873.1203 **[V]** |
| **Additional aquatic supervisory staff** | The permit-issuing official **may require more** aquatic supervisory staff, on nine named factors including **use by children under 18**, congregate activities such as pool parties, pool shape, diving board use, patron decorum, alcohol, **facilities primarily used by individuals with developmental disabilities**, and glare | §873.1203(2) **[V]** |
| **Pool signage and access rules** | A separate sign at **all entrances and within the pool area**, red letters **≥4 in high and ≥1.5 in wide**: "ATTENTION ALL! CHILDREN DROWN SILENTLY AND SWIFTLY. PLEASE WATCH THEM IN AND AROUND THE WATER AT ALL TIMES." Children **under 14 accompanied by an adult**. A **free, readily accessible telephone in the pool area** for 911, with posted instructions in characters ≥3 in, contrasting colour | §873.1203(3) **[V]** |
| **Spray features** | Own section with its own definitions | §873.1220 **[?]** |

§873.1203(4) — staff training every two months, three-year records, and a written patron safety
notice — applies to pools at **Temporary Residences and Campgrounds** as defined in Part 7, **not**
to children's camps **[V]**. Do not encode it against a camp.
| **Fees** | Annual: pool ≥50 persons **$670**, pool <50 **$330**, spa/whirlpool **$330**, wading pool **$330**, bathing beach **$330**. Construction approval: pool **$830/pool**, wading pool **$670/pool** | §873.2105 **[V]** |
| Safety plan currency | File the *Certification that Bathing Facility Safety Plans Are Up-To-Date* instead of resubmitting plans, when nothing has changed | County form **[V]** |
| Daily/monthly operating reports | DOH-1323 pool (3 disinfectant readings/day, mailed monthly); DOH-2287 beach (daily, mailed monthly) | Survey §6–7 **[V]** |
| Engineering reports | DOH-1309 (pool) / DOH-2436 (beach) — **PE or architect signed**, for new construction or alteration | Survey §8–9 **[V]** |

Catalog today: 36 pool + 28 beach requirements from Subparts 6-1/6-2 **[C]**; none of the county's
Article XII additions.

---

## 5 · NYS DOL — amusement devices

From the DOH/DOL **Memorandum of Understanding** and the statewide **Applicable Variance** from
Labor Law art. 27 and 12 NYCRR Part 45 (fact sheet, 3/2014) **[V]**:

**Covered devices** (regulated by the health department instead of DOL, no individual DOL
application needed): zip lines, high rope courses, **climbing walls with mechanical belays**,
canopy tours, euro bungees, **water slides 20 ft or taller**, giant swings, and similar
non-motorized devices.

**Not amusement devices at all** (no DOL rules, no MOU conditions): low rope courses, climbing
walls **without** mechanical belays, water slides **under** 20 ft, water trampolines.

**Still DOL's, and still needing a DOL permit:** motorized devices — **bumper boats, go-carts,
carnival rides**. DOL permitting runs through MPWR, annually, **at least 10 days before first
use**, with proof of liability, workers' compensation and disability insurance **[V, via DOL
guidance]**.

Conditions a camp must meet for every covered device:

1. Built, installed and maintained per manufacturer recommendations; the **operations manual kept
   on site**; **records documenting compliance** with its inspection schedule
2. Devices **manufactured on site** must be designed by a **NYS-licensed professional engineer**;
   **engineering plans filed with the local health department**; a **PE's written statement
   certifying construction matches the design** filed on completion
3. Construction by an **ACCT Professional Vendor Member** or equivalent is recommended
4. **Annual inspection before use each year** by an ACCT-accredited professional vendor member, a
   NAARSO-certified person, a PE, or other qualified third-party inspector; **every deficiency
   corrected before use**
5. **Annually before use**, proof to the LHD of liability insurance of **not less than $1,000,000
   per occurrence**, or a bond of **not less than $2,500,000** in the aggregate
6. **Serious injuries from covered devices reported immediately to DOL District Offices**, in
   addition to the LHD report — "serious injury" here means death, dismemberment, significant
   disfigurement, compound or comminuted fracture, permanent loss of an organ/member/function, or
   loss of consciousness resulting in hospitalisation

This is what HD-91's "amount of liability insurance coverage" and "DOL permit (Yes/No)" columns are
really asking about, and it is an **annual, dated, evidence-backed cycle** the module has nothing
for.

---

## 6 · Other regulators

| Regulator | Obligation | Status |
|---|---|---|
| **OCFS State Central Register** | LDSS-3370 for the director, **spouse, children and every other person in the home**, 28 years of address history, all maiden/alias names; signature **not more than 6 months old** or the SCR rejects it | **[V]** survey §12 |
| **Westchester DES / OEM** | Camp contact form: pre-season and two 24-hour season contacts, camp statistics, **bus company and mobilisation/dismissal times** | **[V]** survey §12 |
| **Local fire department** | The written plan's fire safety section must be **submitted to the local fire department**; fires reported within 24 hours | **[C]** NY-0516 |
| **NYS Workers' Compensation Board** | Coverage proof on one of CE-200 / C-105.2 / U-26.3 / SI-12 / GSI-105.2 and DB-120.1 / DB-155. **ACORD certificates are refused.** | **[V]** |
| **NYS Tax** | FEI or SS number on the application (§5 NY Tax Law) | **[V]** |
| **County food service** | The camp application has its own **Children's Camp Food Service** and **Frozen Dessert** permit ticks, a **food manager's certification** (course, certificate number, date) and **food allergen certification** (count and names of certified staff). **7-2.19 verified**: "(a) Kitchens, dining areas and food service shall comply with **Part 14** of this Title. (b) When food is provided by the camp, it shall be of sufficient quantity and quality for the nutritional needs of each child." County fees §873.2103 run **$420–$1,420** by eating-place class and seat count; frozen dessert manufacturer **$25**; caterer **$520**; mobile food unit **$320** | 7-2.19 and fees **[V]**; the Part 14 duties themselves **[?]** |
| **Employment — minors** | **All students aged 14–17 must hold an employment certificate ("working papers")**, issued by the school district; 14–15 and 16–17 are different certificates. Narrow exceptions (caddy, babysitting, yard work, household chores) do not cover camp employment. **Labor Law §132**: the employer must obtain the certificate **before hiring** and **file it at the place of employment, readily accessible to anyone authorised by law to examine it**. Failing to produce it triggers an illegal-employment investigation and can expose the employer to **double compensation** for an injured minor | **[V]** |
| **Employment — harassment** | **Every** New York employer must adopt a sexual harassment prevention policy meeting eight stated minimum standards and **including a complaint form**, and must provide **interactive** prevention training **to every employee annually**, a duty running since **9 October 2018**. Model policy, complaint form, training script, slide deck and an answer sheet are published by the state | ny.gov **[V]** |
| **Drinking water** | A camp on its own well is very likely a **public water system in its own right**: 10 NYCRR 5-1.1 defines one as a system with **at least 5 service connections** *or* that **regularly serves an average of at least 25 individuals daily at least 60 days a year**. A summer camp on a well clears that easily, making it a **noncommunity** system (a **nontransient** noncommunity system if it serves 25+ of the same people 4+ hours a day, 4+ days a week, 26+ weeks a year — most seasonal camps will not reach 26 weeks). Subpart 5-1 monitoring then sits **on top of** 7-2.6 | thresholds **[V]**; how the county administers the overlap for camps **[?]** |
| **Building / fire code** | **7-2.12 verified, and it is a three-step chain**: (1) "No person shall modify, develop or convert a property for use as a children's camp without first notifying the permit-issuing official **at least 60 days before construction commences**", giving the property name and location, a description of planned facilities and contact details; (2) "**Construction shall not start prior to the required approval of the plans or sketches** by the permit-issuing official and other appropriate regulatory official"; (3) "A written statement signed by a **registered architect or professional engineer** certifying construction compliance with the Uniform Code shall be submitted to the permit-issuing official **prior to occupancy** of all new construction." The catalog dropped all three as construction duties | 7-2.12 **[V]** |
| **Transportation** | 7-2.10 duties are encoded (4 requirements); DOT bus inspection and Article 19-A driver qualification are outside them | **[C]** / **[?]** |

---

## 6a · Food service, water and animals — the three regimes now read in full

### Food service — 10 NYCRR Subpart 14-1 (effective 03/20/2019)

Read in full **[V]**. A camp kitchen is a food service establishment and is **not exempt**: the
exemption in 14-1.190(g) reaches adult care facilities, day care centres, hospitals, nursing homes
and state-owned facilities, and no further.

| Obligation | Detail | Source |
|---|---|---|
| **Permit required** | "A valid permit issued by the permit-issuing official having jurisdiction is required for lawful operation of a food service establishment" | 14-1.190(a) |
| **Display** | The permit is **prominently displayed where the consumer can see it** | 14-1.190(a) |
| **Apply 21 days ahead** | "Not less than **21 days** before starting operation… an application for a permit is to be submitted" | 14-1.190(c) |
| **Operating while waiting** | Unlawful to operate during those 21 days; from the **22nd day** operation may begin without the permit until the official inspects | 14-1.190(e) |
| **Frozen desserts** | A **$25** permit fee under PHL §225(5)(s), paid with the other food fees, and the permit must state the facility may manufacture and sell retail frozen desserts | 14-1.190(a) |
| **County permit too** | "No person shall operate or maintain a food service establishment in the county without first having made application for, and obtaining, a permit from the department" | §873.441 **[V]** |
| **County fees** | $420–$1,420 by eating-place class and seat count; caterer $520; mobile food unit $320; frozen dessert manufacturer $25 | §873.2103 **[V]** |

The camp application's **food manager's certification** and **food allergen certification** questions
are county-administered; the specific certification standard behind them is the one remaining
food-service **[?]**.

### Water — Subparts 5-1 and 5-4, and county Article VII

The threshold question is settled **[V]**: a camp on its own well serving 25+ people for 60+ days
is a **public water system**. What follows from that, read in full:

| Obligation | Detail | Source |
|---|---|---|
| **Annual start-up procedure** | "For each operational period, **before serving water to the public, all seasonal systems must demonstrate completion of a State approved start-up procedure**" — the approved procedure is the NYSDOH document saved as `water_startup.pdf` | 5-1.25(b) **[V]** |
| **State operator certification** | Applies to **community and nontransient noncommunity** systems serving 15+ connections or 25+ persons. A seasonal summer camp is usually a **transient** noncommunity system (under 26 weeks), so **Subpart 5-4 certification does not reach it** | 5-4.2(a)(1) **[V]** |
| **County operator requirement — broader** | The county requires **every** public *and private* water supply system to be "under the supervision of at least one water supply system operator" meeting department qualifications | §873.710(1) **[V]** |
| **Daily records, monthly filing** | Complete **daily records** of treatment/disinfection on department-approved forms, with **a copy forwarded to the department within ten days of each month's end**, and produced on inspection | §873.710(2) **[V]** |
| **County water system permit** | "No person shall operate a public or private water system without a valid permit issued by the commissioner" | §873.710(3) **[V]** |

> Note the asymmetry, because it is the kind of thing that catches a camp: the **state's** operator
> certification probably does not apply to a seasonal camp, but the **county's** operator
> requirement, daily records and separate water-system permit do.

### Animals — county Article XIX

Not previously considered, and it reaches two activities that are ticked on DOH-367 **[V]**.

"Animal facility" is defined to include any "place of public exhibition or amusement, **stable**…
where live animals are sold, offered for sale, given away, exchanged, bartered, sheltered,
boarded, **stabled, exhibited, bred, trained** or groomed" other than a private home, zoological
park, aquarium, laboratory or educational/scientific institution (§873.1901).

- **§873.1903** — "No animal vendor or person who owns, leases or otherwise engages in the business
  of maintaining an animal facility shall do so **without a permit issued by the commissioner**."
- **§873.2108** — annual fees: **stable $120**, animal trainer $120, kennel $120, pet shop $240,
  mobile animal $200, animal shelter no fee.

A camp with **horses on site** looks like a stable, and a camp with a **petting zoo** looks like a
place of public exhibition of live animals. Both are DOH-367 activities. **Whether the county
actually permits camp stables and petting zoos separately is the question to put to them** **[?]**
— the code's text plainly reaches them.

**Rabies (§873.1700)** — "every physician or **person in charge of an institution**… shall
**immediately** report to the department the full name, age, address and telephone number of any
person who has been bitten by an animal and the date of biting or contact with the saliva of such
animal." A camp director is a person in charge of an institution **[V]**.

**Public function (§873.1120)** — a camp holding an event that meets Part 18's mass-gathering
definition needs a further county permit **[V]**; fees at §873.2107.

**Penalties (§873.218)** — non-compliance is a violation: first offence a fine up to **$250** or
15 days, second and subsequent up to **$500** or 15 days; wilfully violating an order of the board
or commissioner is a **misdemeanour**. The board may also impose civil penalties (§873.219)
**[V]**. This is the answer to "what happens if we don't", which every compliance product is asked
and few can answer.

---

## 6b · What the state itself publishes — checked in the browser

Two findings from reading `health.ny.gov/environmental/outdoors/camps/operators.htm` directly.

**Our bundle is the complete official form set.** The state's own Forms section lists exactly nine
camp forms — DOH-367, 367a, 2040, 2271, 2286, 1309, 1323, 2287, 2436 — and we hold all nine **[V]**.
The DOH-61/NYS-61 incident forms are *not* published there; they reach camps through county pages
(Westchester links copies hosted by nyc.gov and Tompkins County), which is why they were missed and
why they need their own sourcing.

**The state publishes the safety plan the camp is supposed to write.** Free templates, directly
relevant to the plan builder **[V]**:

- *Children's Camp Safety Plan Template — Main Body*, and a *Generic Activity Plan*
- Activity plan templates: **Archery · Boating · Camp Trips · Horseback Riding · Riflery · Rope and
  Challenge Courses · Sports · Spray Grounds · Swimming (on-site) · Swimming (off-site and
  wilderness)**
- *Wilderness Swimming Guidance* and a *Wilderness Swimming Site Field Assessment Tool*
- Eight **staff certification fact sheets** — aquatic certifications, camp aquatics director, camp
  trip swimming program, CPR, counselors-in-training, first aid, learn-to-swim programs,
  progressive swimming instructor
- Health guidance: measles reference guide, infirmary flyer, an immunization-records summary
  template, polio guidance (2023), vaccine-preventable disease and outbreak procedures
- *Required Reporting for Injury and Illness* (publication 3602), which restates the 7-2.8(d) list
  as a one-page poster: "Children's camp operators must notify the local health department **within
  24 hours** of the following occurrences…" **[V]**

The state page also confirms two things our copy asserts: the permit "must be displayed in a
conspicuous place on the premises", and camps are "inspected twice yearly, **including at least
once before opening** and during the time the camp is operating" **[V]**.

**A live example of source drift**, and the argument for hashing sources: the county's hosted copy
of the sex offender registry fact sheet gives the DCJS number as (518) 457-3167; the state's own
current page gives **(518) 417-3384**. Same fact sheet, same March 2013 date, different contact.
Whichever a camp phones, one of them is stale.

---

## 7 · What "show me what changed this year" actually requires

Nothing in the product would currently notice any of the above changing. The mechanism has three
parts, and none of them exist yet:

1. **A checked-on date and a content hash per source.** Every requirement, document and fee needs
   `source_url`, `source_checked_on`, and a hash of the fetched bytes. "What changed" is then a
   diff, not a memory. The county code alone proves the need: the copy we now hold is stamped
   **approved 5 August 2025**, and until today the module had never read it.
2. **A watch list of the ten pages that actually change.** The county camp-operator page (which
   changes its packet links each season), Chapter 873, Subpart 7-2, Subparts 6-1/6-2, the DOL
   amusement device fact sheet, the incident report forms index, and the county fee schedule.
   Several of these 403 automated fetches, so the watcher needs either a browser-grade fetch or a
   human step — say so in the design rather than discovering it in production.
3. **A seasonal diff surface.** Camps do not want a changelog; they want "three things are
   different for you this year" scoped to *their* setup answers. A camp with no rifle range does
   not care that the riflery form changed.

The annual county workshop (§873.1801) is the strongest argument for the whole feature: attendance
is a **permit gate**, the county runs it once a year, and the workshop is where the year's changes
are announced. A product that tracked nothing else but "the workshop is on this date, here is what
changed, here is your attendance record" would already be worth having.

---

## 8 · Still to close

Ordered by how likely we are to be telling a camp something wrong today.

**Closed in the first pass:** §873.1203 in full; the 20% definition in 7-2.2; food service traced
to Part 14; working papers, harassment training, public water thresholds, the 7-2.12 construction
chain.

**Closed in the second pass:** the whole document library downloaded and hashed; **DOH-3915,
DOH-2135, DOH-2249** discovered; the staffing and ratio matrix; the **state safety plan template**;
all seven incident forms; county Article III, §873.441 and §873.710.

**Closed in the third pass — the regulations themselves are now in the repository:**

- **331 section files** covering Subparts 7-2, 6-1, 6-2, 6-3, 14-1, 5-1 and 5-4, from the
  Department's own publisher, each subpart carrying its **effective date**
- **Part 14 read**: a camp kitchen needs a permit, displayed to the consumer, applied for 21 days
  ahead; camps are **not** in the exemption list
- **Water read**: the annual seasonal start-up procedure (5-1.25(b)); state operator certification
  reaches CWS/NTNC only, so a seasonal camp usually escapes it while the **county's** operator,
  daily-record and permit duties still apply
- **County Article XIX**: a camp **stable** or **petting zoo** appears to need an animal facility
  permit ($120 for a stable)
- **County rabies reporting**: the person in charge must report any animal bite immediately
- **Penalties quantified**: $250 first offence, $500 thereafter, misdemeanour for wilfully
  violating an order
- **Working papers closed** via Labor Law §132
- **7-2.4(c)(1)**: the annual written affirmation that the plan remains current — the duty behind
  DOH-367's middle tick box

**Still open — nine items, and none of them is a regulation we have not read:**

Four are questions only the county can answer, and they should go in one email or phone call:

1. Does Westchester want **DOH-3915** alongside its own application, or instead of it?
2. Where does a camp obtain the **Children's Camp Self-Inspection Form** (item 12 of both packets,
   published nowhere)?
3. Is there a **Children's Camp Fee Determination Schedule** form we should hold?
4. Does the county permit camp **stables and petting zoos** as animal facilities in practice?

**Both product bugs are now fixed** (2026-08-31):

5. ~~Aquatics under-fire~~ — **this was already fixed and I was wrong to list it.** NY-0510,
   NY-0511 and NY-1101–1104 already carry
   `{"any_of": {"has_pool": "true", "has_waterfront": "true"}}`, and
   `compliance_applicability()` has an `any_of` branch written for exactly this case. The
   extraction notes described the original state; somebody had since fixed the data, and I
   repeated the stale claim without checking. Verified today: a camp with
   `has_pool=false, has_waterfront=true` returns `yes` for the aquatics rules.
6. **Justice Center over-fire — fixed** (migration `20260902130000`). 7-2.25 has two subdivisions
   and two populations: **(a)** reaches a camp that *enrols* campers with disabilities (NY-2501
   through NY-2507, correctly tagged all along), while **(b)** reaches only a "camp for children
   with developmental disabilities" — 7-2.2's **20 percent or more** threshold — which is where
   the Justice Center screening, the code of conduct and the incident clocks live (NY-2508/2509/
   2510). All ten were tagged `enrols any`, so a camp with one camper with a disability was being
   told it owed the whole Justice Center apparatus.

   The threshold *was* being collected, as a DOH-367 form answer — but applicability reads the
   setup interview, not form answers, so the fact sat in a table the engine cannot see. It is now
   a setup question (`is_dd_camp`), existing answers were carried across before the duplicate form
   question was retired, and DOH-367's two boxes are drawn from setup by `facilityValues()` like
   every other tick on that page. Verified: at the threshold `yes`, under it `no`, unasked
   `unknown` → `needs_answer`, and Pine Ridge kept its existing answer rather than being asked
   again.

Three are narrow confirmations:

7. The **food manager / allergen certification** standard behind the county's questions.
8. How the county administers **Subpart 5-1** for a camp well in practice.
9. **DOL permit mechanics for motorized devices** (go-carts, bumper boats) — the fact sheet
   confirms DOL keeps them; the dol.ny.gov permit page is a dead link.

And one product decision, not a research gap: **DOH-2040's 76 components or the state's
92-question template** for the plan builder. They are alternatives; the template is the one a camp
can finish.

---

## 10 · Where camps keep this today, and where they send it

Researched 2026-08-31. Marked **[V]** where a primary source says it, **[S]** where the only
source is a search-result snippet from a page that blocks us (acacamps.org returns 403 even to a
browser User-Agent), and **[inference]** where it follows from the evidence but nobody has said it
to us. **No camp operator has been interviewed. Everything marked [inference] is a hypothesis for
customer conversations, not a finding.**

### 10.1 Submission is an envelope handed to a person

Nothing in 70 pages of packet, the county page, or the state page names a portal **[V]**:

- Westchester: "**SUBMIT ALL REQUIRED DOCUMENTS PRIOR TO OPERATION TO:** Westchester County Health
  Department, Bureau of Public Health Protection, 11 Martine Avenue, White Plains, NY 10606"
- Payment is "check or money order… **OR** by credit card with the attached authorization form.
  Cash payments are **NOT** accepted"
- The LDSS-3370 goes "directly to Westchester County Health Department, **Mt. Kisco Office**" —
  a different address from the rest of the packet
- NYC, for comparison, takes applications "**in person** (or 90 days **by mail**)" against a
  60-day in-person deadline **[V]**
- DOH-1323 and DOH-2287 say "at the end of each month, **mail** completed report to…"

So the product's output is not an API call. It is **a correctly assembled envelope**, and the
county's own failure mode is stated: "if submissions are incomplete, items requiring additional
information will be identified for correction and resubmission, **which could delay proposed
opening dates**."

### 10.2 The evidence never leaves the camp

This is the more important half, and it is unambiguous in the sources **[V]**. Over and over, the
regulation says the record is kept *at the camp* and produced *on inspection*:

| Record | Where it lives |
|---|---|
| DCJS registry results and the list submitted | "kept on file at camp and available for review during Health Department inspections" |
| Staff certification copies | "must be maintained on file at the camp" |
| The written safety plan | "kept onsite and available for discussion with the Westchester County Health Department upon request" |
| Two written references per employee | "maintained on file by the camp director for review by the department" |
| Water system daily records | "readily available and produced for inspection" |
| Most recent pool inspection report | "available at the pool" |
| Amusement device operations manual | "maintained on site at the camp" |
| Camper medical histories and immunization records | held by the camp health director |
| Sex offender search evidence (county) | "evidence of such search must be maintained on-site" |

And the camp is **inspected twice a year, at least once before opening** **[V]**. So the artefact
that actually decides whether a camp passes is not the envelope — it is **the pile of paper a
sanitarian asks for while standing in the office**.

### 10.3 What camps use for it now

The strongest evidence we have is what the accrediting body tells camps to do: ACA "strongly
encourages all camps to prepare ALL written documentation in a **digital format, and organize it
in a cloud file storage space (Google Drive, Dropbox, BOX, etc.)**" **[S]**. That is the state of
the art being recommended in 2025: a folder.

Camp software exists and is mature, but it is aimed somewhere else **[inference from product
descriptions]**. CampMinder, CampBrain, CampDoc, CampSite and their peers are **registration and
camper-health** systems: online enrolment, camper health histories, medications, allergies,
dietary needs, some staff certification tracking. That is the camper side of the house, and it is
a crowded market.

None of them appears to be **regulator-facing**. Nothing in their descriptions produces DOH-367,
knows that Westchester wants thirteen items, tracks that the county workshop is a permit gate, or
knows that a DCJS check expires annually. **This is the gap, and it should be validated in the
first three customer conversations rather than assumed.**

### 10.4 The parallel regime nobody should forget

Many camps also carry **ACA accreditation**, which is voluntary but is its own compliance year:
a Written Documentation Review of 26 standards, due **1 April**, before an on-site visit **[S]**.
A camp doing both is maintaining two evidence sets against two calendars with heavy overlap —
which is an argument for the product holding evidence **once**, tagged by which regime asks for it.

---

## 11 · The workflow that would actually be worth paying for

Read off the obligations above, not invented. Four observations decide the shape.

**a. The year has fixed anchors, and they are not the ones a camp remembers.** Ordered, with the
things that make each one bite:

| When | What |
|---|---|
| Rolling, per hire | Two written references **before** the employee starts (§873.1804); working papers on file for anyone 14–17 (Labor Law §132); DCJS registry check before the first day |
| Annually, before arrival | DCJS re-check for **every** employee and volunteer; county SOR + NSOPW checks including "persons who frequent the camp" |
| Annual, before the permit | **The county workshop.** Miss it and the permit is denied |
| 60 days before opening | The application packet — 13 items |
| 60 days before permit expiry | The **renewal** application (a different clock, §873.301(2)) |
| Before construction | 60-day notice, plan approval, PE certificate before occupancy (7-2.12) |
| Before use each season | Amusement device inspection + $1M insurance proof to the LHD; water system start-up procedure; pool/beach permits |
| Pre-season | Inspection #1 |
| Continuously in season | Daily pool chemistry ×3, daily beach log, medical log, fire drills, temperature logs |
| Within 24 hours | Reportable incidents — eight forms |
| Immediately | Rabies exposure; suspected vaccine-preventable disease; abuse allegations; serious amusement-device injury to **DOL** |
| Monthly | DOH-1323 / DOH-2287 mailed; water system records to the county within 10 days |
| In-season | Inspection #2 |

**No camp holds that calendar in its head.** A product that simply *owned this calendar*, scoped
to one camp's own answers, would earn its place before it filled in a single form.

**b. The evidence is accumulated all year and assembled once.** Every item a sanitarian asks for
is generated months before the ask, by someone who is not the person assembling the packet. The
lifeguard's CPR card arrives in April; the packet is built in March; the inspector asks in June.

**The platform already holds half of it.** §12 measures this: of 155 requirements, 77 are backed
by live platform data — inspections, drills, temperature logs, pool chemistry, certifications,
asset expiry, plan sections, roster — and **67 are `document`, meaning we hold nothing and ask for
a file.** That ratio is the whole product strategy in one number. We are not asking camps to type
their compliance in; we are asking them to keep running the camp, and the packet falls out. Every
requirement moved from `document` to a computed evidence type is a form field a camp never fills.

**c. The moment of truth is the inspection, not the filing.** Twice a year someone stands in the
office and asks to see things, in their own order. The highest-value screen in this product is
probably not the packet builder — it is an **inspection view**: every record an inspector can ask
for, grouped the way they ask, each either present with its date or honestly missing. That is also
the screen a camp would open the night before, which is when they will find out what is missing
while there is still time.

**d. Renewal is a correction pass.** The county's own instruction — "**Change any information that
is incorrect**" — is the strongest design signal in the whole survey. The right model is a
**standing record corrected each season**, not a form filled each season. Which means the
year-over-year diff is not a nice-to-have; it *is* the renewal workflow.

### The shape this suggests

1. **A compliance calendar** that knows the camp's own dates and answers, and surfaces only what
   this camp owes. Everything needed to build it is in §1–§6.
2. **Evidence that flows in from the modules already running**, tagged with which obligation it
   satisfies — rather than a document store the camp has to remember to feed.
3. **Inspection mode** — what the sanitarian will ask for, present or missing, with dates.
4. **Packet assembly as an output, not an input** — the envelope falls out of the year.
5. **A season diff** — "here is what changed since last year, and here are the four things you
   need to correct."
6. **A hard boundary around what we never hold**: LDSS-3370 household and address history,
   DOH-2271 criminal history, card numbers, camper medical records. The product should be able to
   say *"this exists, it is your job, keep it where it is"* and count it as done.

> The single sharpest feature in the list, on the evidence: **the county workshop is a permit
> gate, held once a year, and it is where the year's changes are announced.** A product that knew
> the date, tracked who attended, and told a camp what changed at it would be doing something no
> spreadsheet does.

---

## 12 · What the platform stores today

Read out of `src/lib/types.ts`, the fifteen zustand stores and all 153 migrations, 2026-08-31.
**105 tables and 9 storage buckets.** Almost everything is keyed by `camp_id`; **only the
compliance tables carry `season_id`**, which matters — every other module is a continuous record,
while compliance is the one thing that resets each year.

### 12.1 The modules, in one table

| Module | Tables | What it holds |
|---|---|---|
| **Camps / seasons** | `camps`, `seasons`, `organizations`, `profiles` | Camp identity, address, `camp_type`, capacity, **`facility_code` (the NYS DOH code)**, account type/status/plan; `seasons.opening_date`, `closing_date`, `aca_inspection_date` |
| **Access control** | `camp_members`, `staff_groups`, `camp_invitations`, `camp_join_codes`, `platform_admins` | Login accounts, roles, department, module permissions, `can_view_camper_health` |
| **Safety register** | `safety_staff`, `staff_certifications`, `safety_items`, `safety_inspection_log`, `safety_drills`, `safety_temp_logs`, `safety_licenses` | The compliance-facing roster and the evidence trail |
| **Pool / waterfront** | `pools`, `pool_chemical_readings`, `pool_equipment`, `pool_service_log`, `pool_inspections`, `pool_inspection_log`, `pool_seasonal_tasks` | Waterfront is `pools.type='waterfront'`, not its own table |
| **Locations** | `locations` (nestable tree), `location_categories`, `building_details`; legacy `buildings`, `building_rooms` | One tree per camp; every row has a `qr_token` |
| **Building systems** | `building_components`, `building_circuits`, `building_seasonal_tasks` | Electrical and plumbing by room, panel schedules |
| **Issues / checklists** | `issues`, `issue_activity`, `checklist_tasks`, `checklist_activity`, `public_report_throttle` | Maintenance tracker + pre/post-camp task lists |
| **Assets** | `camp_assets`, `asset_checkouts`, `asset_service_records`, `asset_maintenance_tasks` | Vehicles and watercraft, with `registration_expiry`, `uscg_registration_expiry`, `hull_id`, `lifejacket_count` |
| **Commissary** | 27 tables | Inventory in base units, recipes, menus, production, purchasing, vendors, `campers` + `camper_restrictions` |
| **Retreats** | 22 tables | Group rentals, guest roster, housing, invoices, **e-signed documents** |
| **Compliance** | 17 tables | 7 global catalog + 10 per-camp-per-season |
| **Admin** | `audit_log`, `implementation_files` | Audit trail incl. `view_camper_health` and `export_data` |

### 12.2 The five things that matter most for compliance

**1. There are two unlinked notions of "staff", and the forms need the second one.**
`camp_members` is login accounts. `safety_staff` is the compliance register — and **they are not
joined**. The person holding the lifeguard certificate and the person who logs in are separate
rows with no key between them.

`safety_staff` holds exactly what DOH-367 and DOH-367a ask for, which is not a coincidence:

```
name, title, is_active, date_of_birth, sex, education,
qualifying_experience, professional_license_number
```

Its five personal columns are **revoked from `authenticated` at the column level** and served only
through the security-definer RPC `get_camp_staff_personal(camp_id)`, which raises unless the caller
is a camp admin. That is the right handling and it should not be loosened.

**2. We hold certification *data* but not the certificate.**
`staff_certifications`: `cert_type` (`cpr_aed | mandatory_reporter | lifeguard | first_aid | wsi |
other`), `cert_name`, `issued_date`, `expiry_date`, `provider`, `notes`. That fills DOH-367a's
three tables directly. But **there is no file column** — no scan of the card. The regulation is
explicit that "copies of all required certifications must be maintained on file at the camp"
(§2 above), and an inspector asks to see the copies. We hold the index, not the evidence.

**3. Camper health is deliberately absent, and that is correct.**
`campers` holds only `name, cabin, session`; `camper_restrictions` holds allergen/dietary and
severity. **No date of birth, no medical history, no immunization record, no emergency contacts.**
Migration `20260830140000` makes that a stated policy via
`compliance_requirements.holds_personal_records`, flagging NY-0805, NY-0806, NY-2502–2504 and the
screening codes NY-0502, NY-0504, NY-2508, WC-06: the product asks the camp to **attest** it holds
these rather than upload them. §2.2's immunization requirement therefore stays an attestation, and
should.

**4. Roughly half the compliance catalog already reads live platform data.** Of 155 requirements:

| Evidence type | Count | Backed by |
|---|---:|---|
| `document` | **67** | An uploaded file — nothing computed |
| `inspection` | 36 | `safety_items` + `safety_inspection_log` |
| `roster` | 12 | `safety_staff` |
| `plan_section` | 11 | `compliance_plan_sections` |
| `certification` | 9 | `staff_certifications` |
| `screening` | 5 | Attestation only |
| `water_sample` | 4 | Not implemented in the engine |
| `attestation`, `manual`, `training` | 2 each | Attestation only |
| `asset_expiry` | 2 | `camp_assets` expiry dates |
| `pool_log`, `drill`, `temp_log` | 1 each | `pool_chemical_readings`, `safety_drills`, `safety_temp_logs` |

The engine implements seven branches — `certification, inspection, drill, temp_log, pool_log,
asset_expiry, plan_section`. **`document`, at 43% of the catalog, is the single biggest bucket and
it is the one where we hold nothing.** Every one of those is a place a camp is asked to upload a
file we could in principle already know about.

**5. Three storage buckets are public.** `issue-photos`, `public-report-photos` and `strip-photos`
are readable by URL without authentication. Not a camp-permit issue, but it is the kind of thing a
compliance product should not be caught doing, and `implementation_files` accepts a `'campers'` or
`'staff'` category — the one path by which a raw roster spreadsheet can enter the system as an
opaque blob.

### 12.3 What the obligations need and we do not have

Measured against §1–§6, in order of how often it comes up.

| Missing | What needs it | Notes |
|---|---|---|
| **Incident / injury / illness records** | 7-2.8(d) 24-hour reporting; the eight forms; the medical log; NY-0807, NY-0808, NY-2509; the Justice Center clocks (5 days / 45 days / 90 days) | **There is no incident table of any kind.** `issues` is a maintenance tracker with no person-harmed field. This is the largest single gap in the platform against the obligations |
| **Training / orientation attendance** | DOH-2040's "Training Attendance Documentation" and "Orientation Attendance Documentation"; 7-2.25(b)'s annual code-of-conduct acknowledgment; mandated reporter training | No training table. `staff_certifications` holds certificates, not course attendance |
| **Background check tracking** | DCJS annually per employee and volunteer; NSOPW; **two written references per employee** (§873.1804); LDSS-3370; Justice Center SEL | Nothing tracks *that a check happened on a date* — only the never-store rule for the results themselves. The date and the fact are exactly what an inspector asks for, and they are not personal data |
| **Insurance policies** | Amusement devices ($1M/occurrence, annually to the LHD); workers' comp and disability | No insurance table. `retreat_documents.doc_type='coi'` covers renting groups only |
| **Permits as tracked objects** | Camp permit, food service, bathing facility, water system, animal facility, DOL amusement | `safety_licenses` exists with the right shape (`license_type` already includes `health_permit`, `food_service`, `boating`, `aca_accreditation`, `issuing_authority`, `license_number`, `issued_date`, `expiry_date`) and is **underused** — this is the nearest thing to a permit register and it is not wired to compliance |
| **Certificate files** | "Copies of all required certifications maintained on file at the camp" | `staff_certifications` has no file column |
| **A staff↔user link** | Anything that wants "who did this" on a compliance record | `camp_members` and `safety_staff` are unjoined |
| **Water sampling results** | 7-2.6 sampling; the `water_sample` evidence type (4 requirements) | Evidence type exists; no table and no engine branch |
| **Camper counts by session for DOH-367** | Already solved — `compliance_session_capacity` holds the twelve age/sex bands per session | The one place the platform models a form's table directly |

### 12.4 The honest summary

The platform is strong exactly where the *evidence* lives — inspections, drills, temperature logs,
pool chemistry, certifications, assets — and that is why half the catalog computes rather than
asks. It is weak exactly where the *paperwork* lives: incidents, training attendance, background
check dates, insurance, permits. Those five are not hard tables. They are the difference between a
module that scores a camp and a module that files for it.

---

## 13 · How to re-verify, mechanically

Everything above is reproducible. The three things that made it work:

```bash
# 1. Government sites 403 plain automated requests. A browser User-Agent is all it takes.
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
curl -sL -A "$UA" -o out.pdf https://www.health.ny.gov/forms/doh-3915.pdf

# 2. Re-hash the library and diff against this file to find what changed.
cd docs/compliance/sources && shasum -a 256 */* | sort
```

Regulation text: **Cornell LII** at `law.cornell.edu/regulations/new-york/10-NYCRR-<section>`
answers where `regs.health.ny.gov` refuses. County code: the county publishes Chapter 873 as one
PDF, and the filename carries its approval date — the current one is
`CHAPTER 873 FINAL VERSION APPROVED 8-5-25.pdf`.

The three pages that actually move year to year, and should be watched first:
`health.westchestercountyny.gov/forms-and-permits/camp-operator` (packet links change each
season), `health.ny.gov/environmental/outdoors/camps/operators.htm` (the operator letter and
guidance), and the county code PDF (its filename changes when the Board of Health amends it).
