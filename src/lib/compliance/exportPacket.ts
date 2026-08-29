import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { NY_FORMS, generateForm, type PacketCamp } from './nyPacket';
import type {
  ComplianceProfile, ComplianceRequirement, RequirementStatus, ComplianceDocument,
  CompliancePlanSection, ComplianceStatus, PlanSectionStatus, ComplianceAnswers,
} from '@/lib/types';

/**
 * The whole packet in one file: every NY form filled, every file the camp attached, an index
 * tying the two together, and the written plan as a document a person can read.
 *
 * A camp does not hand its county a folder of downloads collected one button at a time, and
 * the per-form download in FormsPanel leaves them to assemble that themselves. This builds the
 * thing that actually gets handed over.
 *
 * Two rules run through all of it. The cover sheet claims only that these are the camp's own
 * records as of today — the packet is not a certification, and nothing here should let a camp
 * or a reviewer read it as one. And a file that cannot be fetched is written into the index as
 * unretrieved rather than left out, because a quietly short packet is the one failure a camp
 * would not catch before submitting it.
 */

// ─── Progress ─────────────────────────────────────────────────────────────────
// Same shape as an upload's progress (stage, monotonic percent, label), because it is the same
// problem: a long job that is indistinguishable from a hang unless it reports real numbers.

export type ExportStage = 'cover' | 'forms' | 'evidence' | 'plan' | 'packaging' | 'done' | 'failed';

export interface ExportStatus {
  stage: ExportStage;
  /** 0–100. Monotonic within one attempt, so the bar never appears to go backwards. */
  percent: number;
  label: string;
}

export type ExportProgress = (status: ExportStatus) => void;

/** Evidence owns most of the bar because it is the only part that waits on the network. */
export const EXPORT_STAGE_CEILING: Record<Exclude<ExportStage, 'failed'>, number> = {
  cover: 8,
  forms: 40,
  evidence: 82,
  plan: 90,
  packaging: 97,
  done: 100,
};

export const EXPORT_STAGE_LABEL: Record<ExportStage, string> = {
  cover: 'Building the cover sheet',
  forms: 'Filling the forms',
  evidence: 'Collecting your files',
  plan: 'Writing the plan',
  packaging: 'Packing the zip',
  done: 'Done',
  failed: 'Failed',
};

function monotonic(sink: ExportProgress | undefined): ExportProgress {
  let high = 0;
  return (status) => {
    if (!sink) return;
    if (status.stage === 'failed') { sink(status); return; }
    high = Math.max(high, status.percent);
    sink({ ...status, percent: high });
  };
}

/** Percentage for a stage that is `fraction` (0–1) of the way through itself. */
function stagePercent(stage: Exclude<ExportStage, 'failed'>, fraction: number): number {
  const order: Exclude<ExportStage, 'failed'>[] = ['cover', 'forms', 'evidence', 'plan', 'packaging', 'done'];
  const i = order.indexOf(stage);
  const floor = i <= 0 ? 0 : EXPORT_STAGE_CEILING[order[i - 1]];
  const ceiling = EXPORT_STAGE_CEILING[stage];
  return Math.round(floor + (ceiling - floor) * Math.min(1, Math.max(0, fraction)));
}

// ─── Vocabulary ───────────────────────────────────────────────────────────────
// The words a camp already reads on screen. Mirrored here rather than reworded, so the packet
// and the app never describe the same requirement two different ways.

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  satisfied: 'Met',
  expiring: 'Expiring',
  partial: 'Partly done',
  missing: 'Not met',
  needs_answer: 'Needs an answer',
  not_applicable: 'Not applicable',
};

const PLAN_STATUS_LABEL: Record<PlanSectionStatus, string> = {
  not_started: 'Not started', drafted: 'Draft', complete: 'Complete', not_applicable: 'N/A',
};

const CATEGORY_LABEL: Record<string, string> = {
  TABLE_OF_CONTENTS: 'Table of contents',
  PERSONNEL: 'Personnel',
  FACILITY_OPERATION: 'Facility operation',
  FIRE_SAFETY: 'Fire safety',
  MEDICAL_PLAN: 'Medical plan',
  ACTIVITIES_SUPERVISION: 'Activities and supervision',
  STAFF_TRAINING: 'Staff training',
  CAMPER_ORIENTATION: 'Camper orientation',
  // The bathing-facility plan (DOH-2286). Prefixed because its components repeat the
  // camp plan's names: both have a Chain of Command and both have an evacuation route.
  BATHING_ORGANIZATION: 'Pool and beach: organisation',
  BATHING_INJURY_PREVENTION: 'Pool and beach: preventing injury',
  BATHING_EMERGENCY_PLAN: 'Pool and beach: emergencies',
};

/** Why a requirement is not met, in the same sentence the requirement list gives on screen. */
function reasonFor(s: RequirementStatus | undefined): string {
  if (!s) return 'Nothing recorded yet';
  const d = s.detail;
  if (s.status === 'not_applicable') return (s.naReason || (d.reason as string)) ?? 'Does not apply to your camp';
  if (s.status === 'needs_answer') return 'We cannot tell yet whether this applies to you. Finish the setup questions.';
  if (typeof d.need === 'string') {
    if (typeof d.awaiting_feature === 'string') return `${d.need}. (Automatic tracking for this is not built yet.)`;
    return d.need;
  }
  if (d.complete !== undefined && d.sections !== undefined) return `${d.complete} of ${d.sections} sections written`;
  if (d.held !== undefined) return `${d.held} current certification${d.held === 1 ? '' : 's'} on file`;
  if (d.overdue !== undefined && Number(d.overdue) > 0) return `${d.overdue} of ${d.items} items overdue`;
  if (d.expires_on) return `On file, expires ${d.expires_on}`;
  if (d.next_due) return `On file, next due ${d.next_due}`;
  if (d.documents !== undefined) return `${d.documents} document${d.documents === 1 ? '' : 's'} attached`;
  if (d.completed !== undefined) return `${d.completed} completed`;
  if (d.entries !== undefined) return `${d.entries} entries logged`;
  if (d.readings !== undefined) return `${d.readings} readings logged`;
  if (d.assets !== undefined) return `${d.assets} on file`;
  return 'On file';
}

// ─── PDF plumbing ─────────────────────────────────────────────────────────────

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const BODY_W = PAGE_W - MARGIN * 2;
const INK = rgb(0.08, 0.14, 0.11);
const SOFT = rgb(0.38, 0.42, 0.40);
const RULE = rgb(0.82, 0.82, 0.80);

/**
 * The standard fonts encode WinAnsi only, and plan bodies are free text a person typed or
 * pasted. A smart quote thrown by the encoder halfway through would lose the whole packet, so
 * everything is folded to characters the font can actually draw before it reaches pdf-lib.
 */
function encodable(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\u2022/g, '-')
    .replace(/\t/g, '    ')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') { out.push(''); continue; }
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) { cur = next; continue; }
      if (cur) { out.push(cur); cur = ''; }
      // A single token wider than the line (a long path, a pasted URL) is broken rather than
      // left to run off the edge of the page.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let cut = w.length;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      cur = w;
    }
    out.push(cur);
  }
  return out;
}

interface Writer {
  text: (s: string, opts?: { size?: number; bold?: boolean; color?: typeof INK; indent?: number }) => void;
  /** The page the next block will land on, after making room for it. 1-based. */
  pageForNext: (h?: number) => number;
  heading: (s: string) => void;
  gap: (h: number) => void;
  rule: () => void;
  columns: (left: string, right: string, opts?: { bold?: boolean }) => void;
}

function makeWriter(pdf: PDFDocument, font: PDFFont, bold: PDFFont): Writer {
  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  // 1-based, the way a person counts pages and the way DOH-2040 wants them written.
  let pageNo = 1;

  function room(h: number) {
    if (y - h < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      pageNo += 1;
    }
  }

  function text(s: string, opts: { size?: number; bold?: boolean; color?: typeof INK; indent?: number } = {}) {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const indent = opts.indent ?? 0;
    const lines = wrapText(encodable(s), f, size, BODY_W - indent);
    for (const line of lines) {
      room(size * 1.45);
      y -= size * 1.45;
      if (line) page.drawText(line, { x: MARGIN + indent, y, size, font: f, color: opts.color ?? INK });
    }
  }

  return {
    text,
    /**
     * The page the next line will land on.
     *
     * This is what makes DOH-2040 fill itself. The checklist asks which page of the plan covers
     * each component, and because we render the plan we can answer instead of asking the camp
     * to count. Called before writing a section, so it reports where that section starts.
     */
    pageForNext: (h = 24) => { room(h); return pageNo; },
    heading: (s) => { room(30); y -= 8; text(s, { size: 12, bold: true }); y -= 2; },
    gap: (h) => { room(h); y -= h; },
    rule: () => {
      room(10);
      y -= 6;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: RULE });
      y -= 4;
    },
    columns: (left, right, opts = {}) => {
      const size = 10;
      const f = opts.bold ? bold : font;
      room(size * 1.6);
      y -= size * 1.6;
      const rt = encodable(right);
      const rtW = f.widthOfTextAtSize(rt, size);
      // The left label gives way rather than running under the right-hand value.
      let lt = encodable(left);
      const room4 = BODY_W - rtW - 12;
      while (lt.length > 1 && f.widthOfTextAtSize(lt, size) > room4) lt = lt.slice(0, -1);
      page.drawText(lt, { x: MARGIN, y, size, font: f, color: INK });
      page.drawText(rt, { x: PAGE_W - MARGIN - rtW, y, size, font: f, color: INK });
    },
  };
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface PacketExportInput {
  camp: PacketCamp;
  /** The season the packet covers, as the camp named it. */
  seasonName: string | null;
  /** The compliance packages switched on for this camp and season. */
  profiles: ComplianceProfile[];
  /** Every requirement belonging to those packages. */
  requirements: ComplianceRequirement[];
  statusFor: (requirementId: string) => RequirementStatus | undefined;
  /** Everything the camp has attached, linked or not. All of it goes in the zip. */
  documents: ComplianceDocument[];
  planSections: CompliancePlanSection[];
  /** The camp's setup answers; several forms are filled from them. */
  answers: ComplianceAnswers;
  /** Section code to the checklist row it fills. Catalog data, never derived from a title. */
  planRowKeys: Record<string, string>;
  /** Signed read URL for a private compliance-files path. */
  signUrl: (bucketPath: string) => Promise<string | null>;
  /**
   * The party this packet is for, when it is for one.
   *
   * Handing the fire department the full county packet is the thing the reviewer-shaped
   * structure exists to stop. When this is set, `requirements` is already filtered to that
   * party by the caller, and the cover sheet and file name say who it is for.
   */
  authorityName?: string;
  /** The forms that belong in this packet. Defaults to all of them. */
  forms?: typeof NY_FORMS;
}

export interface EvidenceFailure {
  title: string;
  fileName: string;
  reason: string;
}

export interface PacketExportResult {
  blob: Blob;
  fileName: string;
  /** Files that could not be fetched. The zip still built; every one is named in the index. */
  failures: EvidenceFailure[];
  counts: Record<ComplianceStatus, number>;
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return (s || 'camp').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** The name the file had when it was uploaded, recovered from the timestamped storage key. */
function originalName(doc: ComplianceDocument): string {
  const base = doc.bucketPath.split('/').pop() ?? '';
  const stripped = base.replace(/^\d{10,}-/, '');
  return stripped || base || `${slug(doc.title)}.file`;
}

function csvCell(v: string): string {
  const s = v.replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function coverSheet(
  input: PacketExportInput, counts: Record<ComplianceStatus, number>, generatedOn: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = makeWriter(pdf, font, bold);

  w.text(input.authorityName ? `Compliance packet for ${input.authorityName}` : 'Compliance packet',
         { size: 20, bold: true });
  w.gap(4);
  w.text(input.camp.campName, { size: 13, bold: true });
  if (input.camp.address) w.text(input.camp.address, { size: 10, color: SOFT });
  w.rule();

  const season = [
    input.seasonName,
    input.camp.openDate && input.camp.closeDate ? `${input.camp.openDate} to ${input.camp.closeDate}` : null,
  ].filter(Boolean).join(', ');
  w.columns('Season', season || 'Not recorded');
  w.columns('County', input.camp.county);
  w.columns('Generated', generatedOn);

  w.heading('Packages in force');
  if (input.profiles.length === 0) {
    w.text('None. Compliance setup has not been run for this season.', { size: 10, color: SOFT });
  } else {
    for (const p of input.profiles) {
      w.text(`${p.name} (${p.code})`, { size: 10, indent: 10 });
    }
  }

  w.heading('Requirements');
  const order: ComplianceStatus[] = ['satisfied', 'expiring', 'partial', 'missing', 'needs_answer', 'not_applicable'];
  w.columns('Status', 'Count', { bold: true });
  for (const st of order) w.columns(STATUS_LABEL[st], String(counts[st]));
  w.rule();
  w.columns('Total requirements', String(input.requirements.length), { bold: true });

  w.heading('What this packet is');
  w.text(
    `This packet is a copy of what ${input.camp.campName} has recorded in CampCommand as of `
    + `${generatedOn}. It is not a certification of compliance, and it has not been reviewed or `
    + 'approved by any health department, accreditor or insurer.',
    { size: 10 },
  );
  w.gap(4);
  w.text(
    'Each status below is calculated from the records entered in CampCommand and the files '
    + 'attached to them. Anything the camp holds outside CampCommand does not appear here, and '
    + 'anything shown as met means a record exists, not that the record has been inspected.',
    { size: 10 },
  );

  w.heading('What is in this zip');
  w.text('00-cover-sheet.pdf, this page.', { size: 10, indent: 10 });
  w.text('forms, the New York State forms filled from camp data. Check each one before filing it.', { size: 10, indent: 10 });
  w.text('evidence, every file attached in CampCommand, under its original name.', { size: 10, indent: 10 });
  w.text('evidence-index.csv, one row per requirement, with the files attached to it.', { size: 10, indent: 10 });
  w.text('written-plan.pdf, the written safety plan section by section.', { size: 10, indent: 10 });

  return pdf.save();
}

/**
 * The plan document, and a map of which page each section starts on.
 *
 * The page map is the point. DOH-2040 asks the camp to write a page number against every one of
 * seventy-three components, which is the kind of clerical work nobody finishes accurately. We
 * render the plan, so we already know the answer.
 */
async function writtenPlan(
  input: PacketExportInput, generatedOn: string,
): Promise<{ bytes: Uint8Array; pageBySectionCode: Record<string, string> }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = makeWriter(pdf, font, bold);

  w.text('Written safety plan', { size: 20, bold: true });
  w.gap(4);
  w.text(`${input.camp.campName}${input.seasonName ? `, ${input.seasonName}` : ''}`, { size: 12, bold: true });
  w.text(`As recorded in CampCommand on ${generatedOn}.`, { size: 10, color: SOFT });
  w.rule();

  const groups = new Map<string, CompliancePlanSection[]>();
  for (const s of input.planSections) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
  const ordered = [...groups.entries()]
    .map(([category, sections]) => ({ category, sections: [...sections].sort((a, b) => a.sortOrder - b.sortOrder) }))
    .sort((a, b) => (a.sections[0]?.sortOrder ?? 0) - (b.sections[0]?.sortOrder ?? 0));

  const pageBySectionCode: Record<string, string> = {};

  if (ordered.length === 0) {
    w.gap(8);
    w.text('No plan sections have been laid down for this season.', { size: 10, color: SOFT });
    return { bytes: await pdf.save(), pageBySectionCode };
  }

  for (const g of ordered) {
    w.heading(CATEGORY_LABEL[g.category] ?? g.category);
    for (const sec of g.sections) {
      w.gap(4);
      // Ask before writing, with room for the heading and a line of body, so a section that
      // would spill onto the next page is recorded on the page it actually starts.
      pageBySectionCode[sec.sectionCode] = String(w.pageForNext(40));
      w.text(sec.title, { size: 11, bold: true });
      const meta = [
        PLAN_STATUS_LABEL[sec.status],
        // The camp types its own page reference, usually already carrying "p." or "page", so
        // prefixing another one reads as "page p. 3-4".
        sec.pageRef ? sec.pageRef : null,
      ].filter(Boolean).join(' · ');
      w.text(meta, { size: 9, color: SOFT });
      if (sec.status === 'not_applicable') {
        // Kept in the document on purpose: a reviewer needs to see that the camp considered
        // this component and ruled it out, not find a gap where it should have been.
        w.text(sec.naReason
          ? `Marked not applicable. ${sec.naReason}`
          : 'Marked not applicable to this camp.', { size: 10, indent: 10 });
      } else if (sec.body && sec.body.trim()) {
        w.text(sec.body.trim(), { size: 10, indent: 10 });
      } else {
        w.text('Not written yet.', { size: 10, color: SOFT, indent: 10 });
      }
    }
    w.gap(6);
  }

  return { bytes: await pdf.save(), pageBySectionCode };
}

// ─── The export ───────────────────────────────────────────────────────────────

export async function exportCompliancePacket(
  input: PacketExportInput, onProgress?: ExportProgress,
): Promise<PacketExportResult> {
  const report = monotonic(onProgress);
  const step = (stage: Exclude<ExportStage, 'failed'>, fraction: number) =>
    report({ stage, percent: stagePercent(stage, fraction), label: EXPORT_STAGE_LABEL[stage] });

  try {
    const generatedOn = new Date().toISOString().slice(0, 10);
    const zip = new JSZip();

    const counts: Record<ComplianceStatus, number> = {
      satisfied: 0, expiring: 0, partial: 0, missing: 0, needs_answer: 0, not_applicable: 0,
    };
    for (const r of input.requirements) {
      const st = input.statusFor(r.id);
      // A requirement with no computed row is counted as not met, the same way the packages
      // on screen count it. Silence is never read as met.
      counts[st?.status ?? 'missing']++;
    }

    step('cover', 0);
    zip.file('00-cover-sheet.pdf', await coverSheet(input, counts, generatedOn));
    step('cover', 1);

    // ── forms ──
    // The plan is rendered first even though it is written to the zip later: DOH-2040's page
    // column is filled from where each section actually landed, so the forms cannot be built
    // until the plan exists.
    const plan = await writtenPlan(input, generatedOn);

    const forms = input.forms ?? NY_FORMS;
    const formsDir = forms.length > 0 ? zip.folder('forms') : null;
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      step('forms', i / Math.max(forms.length, 1));
      const bytes = await generateForm(
        form, input.camp, input.planSections, input.answers,
        input.planRowKeys, plan.pageBySectionCode,
      );
      formsDir?.file(`${form.code}.pdf`, bytes);
    }
    step('forms', 1);

    // ── evidence ──
    const evidenceDir = zip.folder('evidence');
    const failures: EvidenceFailure[] = [];
    /** documentId → the name it ended up under in the zip, or the note that it is not there. */
    const placed = new Map<string, string>();

    for (let i = 0; i < input.documents.length; i++) {
      const doc = input.documents[i];
      step('evidence', input.documents.length === 0 ? 1 : i / input.documents.length);
      const name = `${String(i + 1).padStart(3, '0')}-${originalName(doc)}`;
      try {
        const url = await input.signUrl(doc.bucketPath);
        if (!url) throw new Error('no download link was issued');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`the download failed (${res.status})`);
        evidenceDir?.file(name, await res.arrayBuffer());
        placed.set(doc.id, name);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'the download failed';
        failures.push({ title: doc.title, fileName: name, reason });
        placed.set(doc.id, `${name} (not in this packet: ${reason})`);
      }
    }
    step('evidence', 1);

    // ── written plan ──
    step('plan', 0);
    zip.file('written-plan.pdf', plan.bytes);
    step('plan', 1);

    // ── index ──
    const rows: string[] = ['req_code,label,status,due_date,evidence_files,reason'];
    for (const r of input.requirements) {
      const st = input.statusFor(r.id);
      const files = input.documents
        .filter((d) => d.requirementIds.includes(r.id))
        .map((d) => placed.get(d.id) ?? originalName(d));
      const status = st?.status ?? 'missing';
      rows.push([
        r.reqCode,
        r.label,
        STATUS_LABEL[status],
        st?.dueOn ?? '',
        files.join('; '),
        status === 'satisfied' ? '' : reasonFor(st),
      ].map(csvCell).join(','));
    }

    // Files nobody linked to a requirement are still in the zip, so they are still named here.
    // An unexplained file in evidence/ is a question the reviewer has to ask.
    const unattached = input.documents.filter((d) => d.requirementIds.length === 0);
    for (const d of unattached) {
      rows.push([
        '', d.title, 'Not linked to a requirement', '',
        placed.get(d.id) ?? originalName(d),
        'Attached in CampCommand but not linked to any requirement.',
      ].map(csvCell).join(','));
    }

    if (failures.length > 0) {
      rows.push('');
      rows.push(csvCell(
        `${failures.length} file${failures.length === 1 ? '' : 's'} could not be retrieved and `
        + 'are not in this packet. They are named in the rows above.',
      ));
    }
    zip.file('evidence-index.csv', `${rows.join('\n')}\n`);

    step('packaging', 0.2);
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE' },
      (meta) => step('packaging', meta.percent / 100),
    );

    report({ stage: 'done', percent: 100, label: EXPORT_STAGE_LABEL.done });

    return {
      blob,
      fileName: input.authorityName
        ? `${slug(input.authorityName)}-packet-${slug(input.camp.campName)}-${generatedOn}.zip`
        : `compliance-packet-${slug(input.camp.campName)}-${generatedOn}.zip`,
      failures,
      counts,
    };
  } catch (e) {
    report({ stage: 'failed', percent: 0, label: EXPORT_STAGE_LABEL.failed });
    throw e instanceof Error ? e : new Error('The packet did not build.');
  }
}
