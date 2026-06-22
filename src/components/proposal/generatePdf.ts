import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase';

// ── Static letterhead content ────────────────────────────────────────────────

export const LICENSE_LINES: string[] = [
  'Arizona General Contractor License # B1-303364',
  'Arizona Electrical License # CR11-303365',
  'Arizona HVAC License # CR39-311534',
  'Arizona Plumbing License # CR37-317290',
  'California General Contractor License # 1025041',
  'Oregon General Contractor License # 227953',
  'Omaha, NE General Contractors License # 2101173',
  'Utah General Contractor License # B100-10601619-5501',
  'Utah Electrical Contractor License # B200-10601619-5501',
  'Washington General Contractor License # 604-274-684',
  'South Carolina Electrical Contractor License # CLM.116673',
  'North Carolina Electrical Contractor License # I.35329',
];

export const FOOTER_LINES: string[] = [
  'Innovative Technology Development Group, LLC',
  '12441 E Camino del Garanon, Tucson, Arizona  85747',
  'Phone: (520) 647-3862    Email: Dave@itdgconstruction.com',
  'ITDGConstruction.com',
];

// Exact standard exclusions from ITDG's current proposal format.
export const STANDARD_EXCLUSIONS =
  'Sales tax, permits, meters & fees, after hours work, prevailing wages, engineering, ' +
  'firestop labor or material, wiring, sewer taps, cutting, coring, removal & patching, ' +
  'import and export of fill material, shading or bedding of waste lines, trenching and ' +
  'installations over 5 ft. depth, barricades or flagging, trenching for Southwest Gas hpg ' +
  'to mtr., backflow prevention devices testing and certification.';

export const PRICE_GUARANTEE =
  'Because of several recent price increases and the threat of more to come we cannot ' +
  'guarantee these prices for more than 30 days.';

export const STANDARD_WARRANTY =
  'One year warranty on materials and two year warranty on workmanship.';

export const STANDARD_TERMS =
  'Net 30 days. Rough plumbing 40%; Top-out plumbing 40%, and; Trim plumbing 20%';

// ── Number → words ───────────────────────────────────────────────────────────

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest < 20) {
    if (rest) parts.push(ONES[rest]);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    parts.push(ones ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens]);
  }
  return parts.join(' ');
}

// Converts a dollar amount to the written form, e.g. 37200 -> "Thirty Seven
// Thousand Two Hundred Dollars". Cents render as ".. and 50/100 Dollars".
export function numberToWords(amount: number): string {
  const dollars = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - dollars) * 100);

  let words: string;
  if (dollars === 0) {
    words = 'Zero';
  } else {
    const groups: number[] = [];
    let remaining = dollars;
    while (remaining > 0) {
      groups.push(remaining % 1000);
      remaining = Math.floor(remaining / 1000);
    }
    const chunks: string[] = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i] === 0) continue;
      const chunk = threeDigitsToWords(groups[i]);
      chunks.push(SCALES[i] ? `${chunk} ${SCALES[i]}` : chunk);
    }
    words = chunks.join(' ');
  }

  const sign = amount < 0 ? 'Negative ' : '';
  if (cents > 0) {
    return `${sign}${words} and ${String(cents).padStart(2, '0')}/100 Dollars`;
  }
  return `${sign}${words} Dollars`;
}

export function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Logo loading (graceful) ──────────────────────────────────────────────────

let cachedLogo: string | null | undefined;

async function loadLogo(): Promise<string | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const res = await fetch('/itdg-logo.png');
    if (!res.ok) throw new Error(`logo ${res.status}`);
    const blob = await res.blob();
    cachedLogo = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

// ── Layout primitives ────────────────────────────────────────────────────────

const PAGE_W = 612; // US Letter pt
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_BOTTOM = 132; // y where body content may begin
const FOOTER_TOP = PAGE_H - 56;

interface PdfContext {
  doc: jsPDF;
  logo: string | null;
  y: number;
}

function drawLetterhead(ctx: PdfContext): void {
  const { doc, logo } = ctx;

  if (logo) {
    // ~180px wide at 96dpi -> 135pt; keep aspect with a fixed box.
    try {
      doc.addImage(logo, 'PNG', MARGIN, 40, 150, 54);
    } catch {
      /* ignore bad image */
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(20, 90, 120);
    doc.text('ITDG', MARGIN, 64);
  }

  // License block, right-aligned, ~7pt.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(70, 70, 70);
  let ly = 44;
  for (const line of LICENSE_LINES) {
    doc.text(line, PAGE_W - MARGIN, ly, { align: 'right' });
    ly += 8;
  }

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, HEADER_BOTTOM - 8, PAGE_W - MARGIN, HEADER_BOTTOM - 8);

  doc.setTextColor(0, 0, 0);
}

function drawFooter(ctx: PdfContext): void {
  const { doc } = ctx;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, FOOTER_TOP - 6, PAGE_W - MARGIN, FOOTER_TOP - 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  let fy = FOOTER_TOP + 4;
  for (const line of FOOTER_LINES) {
    doc.text(line, PAGE_W / 2, fy, { align: 'center' });
    fy += 9;
  }
  doc.setTextColor(0, 0, 0);
}

function startPage(ctx: PdfContext, isFirst = false): void {
  if (!isFirst) ctx.doc.addPage();
  drawLetterhead(ctx);
  drawFooter(ctx);
  ctx.y = HEADER_BOTTOM;
}

// Ensures `needed` pt of vertical space remain; starts a new page otherwise.
function ensureSpace(ctx: PdfContext, needed: number): void {
  if (ctx.y + needed > FOOTER_TOP - 12) {
    startPage(ctx);
  }
}

function writeParagraph(
  ctx: PdfContext,
  text: string,
  opts: { size?: number; bold?: boolean; gap?: number; indent?: number } = {},
): void {
  const { doc } = ctx;
  const size = opts.size ?? 10;
  const indent = opts.indent ?? 0;
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, CONTENT_W - indent) as string[];
  const lineH = size * 1.35;
  for (const line of lines) {
    ensureSpace(ctx, lineH);
    doc.text(line, MARGIN + indent, ctx.y);
    ctx.y += lineH;
  }
  ctx.y += opts.gap ?? 6;
}

// ── Proposal data ─────────────────────────────────────────────────────────────

export interface ProposalData {
  date: string;
  recipientName: string;
  recipientCompany: string;
  recipientAddress: string;
  recipientEmail: string;
  projectName: string;
  projectAddress: string;
  salutationFirstName: string;
  planRef: string;
  planDate: string;
  amount: number;
  amountWords: string;
  topExclusions: string[];
  priceGuarantee: string;
  materials: { label: string; value: string }[];
  fixtures: string;
  salesTaxNote: string;
  standardExclusions: string;
  warranty: string;
  terms: string;
  signer: string;
}

export interface ChangeOrderData {
  company: string;
  project: string;
  changeOrderNumber: string;
  date: string;
  description: string;
  scheduleNoChange: boolean;
  scheduleExtendedDays: string;
  additionalMaterials: number;
  additionalLabor: number;
  rep: string;
}

// ── Proposal PDF ──────────────────────────────────────────────────────────────

export async function buildProposalPdf(data: ProposalData): Promise<jsPDF> {
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const ctx: PdfContext = { doc, logo, y: 0 };
  startPage(ctx, true);

  // Date
  writeParagraph(ctx, data.date, { size: 10, gap: 10 });

  // Recipient block
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const line of [
    data.recipientName,
    data.recipientCompany,
    data.recipientAddress,
    data.recipientEmail,
  ].filter(Boolean)) {
    ensureSpace(ctx, 13);
    doc.text(line, MARGIN, ctx.y);
    ctx.y += 13;
  }
  ctx.y += 8;

  // Re: + Dear
  writeParagraph(ctx, `Re:  ${data.projectName} – ${data.projectAddress}`, { bold: true, gap: 8 });
  writeParagraph(ctx, `Dear ${data.salutationFirstName}:`, { gap: 8 });

  writeParagraph(
    ctx,
    `We propose to furnish the necessary labor and material to install the Plumbing on ` +
      `the above referenced project in accordance with the plan by ${data.planRef} dated ` +
      `${data.planDate}, and this proposal is for the sum of:`,
    { gap: 10 },
  );

  // Amount — big numeric + written.
  ensureSpace(ctx, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(formatCurrency(data.amount), PAGE_W / 2, ctx.y + 6, { align: 'center' });
  ctx.y += 26;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bolditalic');
  const wlines = doc.splitTextToSize(`(${data.amountWords})`, CONTENT_W) as string[];
  for (const line of wlines) {
    ensureSpace(ctx, 15);
    doc.text(line, PAGE_W / 2, ctx.y, { align: 'center' });
    ctx.y += 15;
  }
  ctx.y += 10;

  // Top exclusions
  doc.setFont('helvetica', 'normal');
  for (const ex of data.topExclusions.filter(e => e.trim())) {
    writeParagraph(ctx, `*  ${ex}`, { size: 10, gap: 2, indent: 10 });
  }
  ctx.y += 6;

  // Price guarantee
  writeParagraph(ctx, data.priceGuarantee, { size: 10, gap: 10 });

  // Materials
  writeParagraph(ctx, 'MATERIALS:', { bold: true, gap: 4 });
  for (const m of data.materials) {
    writeParagraph(ctx, `${m.label}:  ${m.value}`, { size: 10, gap: 2, indent: 10 });
  }
  ctx.y += 6;

  // Fixtures
  writeParagraph(ctx, 'FIXTURES:', { bold: true, gap: 4 });
  writeParagraph(ctx, data.fixtures, { size: 10, gap: 8, indent: 10 });

  // Page 2 content — Excluding the following / sales tax / standard exclusions
  writeParagraph(ctx, 'Excluding the following:', { bold: true, gap: 6 });
  if (data.salesTaxNote.trim()) {
    writeParagraph(ctx, data.salesTaxNote, { size: 10, gap: 8 });
  }
  writeParagraph(ctx, data.standardExclusions, { size: 10, gap: 10 });

  // Warranty + Terms
  writeParagraph(ctx, 'WARRANTY:', { bold: true, gap: 4 });
  writeParagraph(ctx, data.warranty, { size: 10, gap: 8 });
  writeParagraph(ctx, 'TERMS:', { bold: true, gap: 4 });
  writeParagraph(ctx, data.terms, { size: 10, gap: 12 });

  // Closing
  writeParagraph(
    ctx,
    'Thank you for the opportunity of presenting this proposal. We look forward to ' +
      'working with you on this project.',
    { gap: 12 },
  );
  writeParagraph(ctx, 'Sincerely,', { gap: 26 });
  writeParagraph(ctx, data.signer, { bold: true, gap: 4 });
  writeParagraph(ctx, 'Innovative Technology Development Group, LLC', { size: 9, gap: 16 });

  // Acceptance block
  ensureSpace(ctx, 90);
  writeParagraph(
    ctx,
    'This proposal is accepted this ______ day of ____________ 20____, as tendered and ' +
      'the undersigned authorizes the work to proceed.',
    { size: 10, gap: 20 },
  );
  const sigY = ctx.y;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const labelPairs = ['By: ______________________', 'Signature: ______________________'];
  doc.text(labelPairs[0], MARGIN, sigY);
  doc.text(labelPairs[1], PAGE_W / 2, sigY);
  ctx.y = sigY + 24;
  doc.text('Title: ______________________', MARGIN, ctx.y);
  doc.text('Name: ______________________', PAGE_W / 2, ctx.y);
  ctx.y += 24;
  doc.text('Company: ______________________', MARGIN, ctx.y);

  return doc;
}

// ── Change Order PDF ──────────────────────────────────────────────────────────

export async function buildChangeOrderPdf(data: ChangeOrderData): Promise<jsPDF> {
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const ctx: PdfContext = { doc, logo, y: 0 };
  startPage(ctx, true);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('JOB SITE CHANGE ORDER', PAGE_W / 2, ctx.y + 6, { align: 'center' });
  ctx.y += 30;

  // Field grid
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const fieldRows: [string, string][] = [
    ['Company:', data.company],
    ['Project:', data.project],
    ['Change Order #:', data.changeOrderNumber],
    ['Date:', data.date],
  ];
  for (const [label, value] of fieldRows) {
    ensureSpace(ctx, 16);
    doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN, ctx.y);
    doc.setFont('helvetica', 'normal');
    doc.text(value || '', MARGIN + 110, ctx.y);
    ctx.y += 16;
  }
  ctx.y += 8;

  // Description
  writeParagraph(ctx, 'Description of Change:', { bold: true, gap: 4 });
  writeParagraph(ctx, data.description || '—', { size: 10, gap: 12 });

  // Schedule impact
  writeParagraph(ctx, 'Impact on Schedule:', { bold: true, gap: 4 });
  const noBox = data.scheduleNoChange ? '[X]' : '[  ]';
  const extBox = !data.scheduleNoChange ? '[X]' : '[  ]';
  writeParagraph(ctx, `${noBox} No change to completion date`, { size: 10, gap: 2, indent: 10 });
  writeParagraph(
    ctx,
    `${extBox} Completion date extended by ${data.scheduleExtendedDays || '____'} days`,
    { size: 10, gap: 12, indent: 10 },
  );

  // Financial adjustment
  writeParagraph(ctx, 'Financial Adjustment (Includes sales tax and freight):', {
    bold: true,
    gap: 8,
  });

  const total = data.additionalMaterials + data.additionalLabor;
  const rowH = 20;
  const tableX = MARGIN;
  const tableW = CONTENT_W;
  const valX = tableX + tableW - 8;
  const finRows: [string, number][] = [
    ['Additional Materials', data.additionalMaterials],
    ['Additional Labor', data.additionalLabor],
  ];
  doc.setFontSize(10);
  doc.setDrawColor(150, 150, 150);
  for (const [label, val] of finRows) {
    ensureSpace(ctx, rowH);
    doc.rect(tableX, ctx.y - 12, tableW, rowH);
    doc.setFont('helvetica', 'normal');
    doc.text(label, tableX + 8, ctx.y + 2);
    doc.text(formatCurrency(val), valX, ctx.y + 2, { align: 'right' });
    ctx.y += rowH;
  }
  ensureSpace(ctx, rowH);
  doc.rect(tableX, ctx.y - 12, tableW, rowH);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Change Order Amount', tableX + 8, ctx.y + 2);
  doc.text(formatCurrency(total), valX, ctx.y + 2, { align: 'right' });
  ctx.y += rowH + 16;

  // Authorization
  writeParagraph(
    ctx,
    'The above change is hereby authorized. The contract amount and/or schedule will be ' +
      'adjusted as stated above. All other terms and conditions of the original contract ' +
      'remain in full force and effect.',
    { size: 10, gap: 24 },
  );

  ensureSpace(ctx, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Client Signature: ______________________', MARGIN, ctx.y);
  doc.text('Date: ______________', PAGE_W - MARGIN - 130, ctx.y);
  ctx.y += 30;
  doc.text('Innovative Technology Development Group LLC.', MARGIN, ctx.y);
  ctx.y += 14;
  doc.text(`Rep: ${data.rep}`, MARGIN, ctx.y);

  return doc;
}

// ── Save: download (always) + best-effort storage upload ──────────────────────

export interface SaveResult {
  downloaded: boolean;
  uploaded: boolean;
  storageNote: string;
}

export async function savePdf(
  doc: jsPDF,
  fileName: string,
  bidId: string | undefined,
): Promise<SaveResult> {
  // 1) Download always — this must never fail silently.
  doc.save(fileName);

  // 2) Best-effort upload to the 'proposals' storage bucket (mirrors blueprints).
  let uploaded = false;
  let storageNote = '';
  try {
    const blob = doc.output('blob') as Blob;
    const key = `${bidId ? `${bidId}---` : ''}${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
    const { error } = await supabase.storage
      .from('proposals')
      .upload(key, blob, { contentType: 'application/pdf', upsert: false });
    if (error) {
      storageNote = `Saved download only — storage upload failed (${error.message}). ` +
        `Create a 'proposals' bucket in Supabase to archive PDFs.`;
    } else {
      uploaded = true;
      storageNote = `Archived to 'proposals' bucket as ${key}.`;
    }
  } catch (err) {
    storageNote =
      'Saved download only — storage unavailable ' +
      `(${err instanceof Error ? err.message : 'unknown error'}).`;
  }

  return { downloaded: true, uploaded, storageNote };
}
