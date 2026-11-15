// Materials list for the full 4-page takeoff. Line items live inside
// project_bids.takeoff_data, so printing and deleting use this document
// rather than child tables.

import {
  calcPage1,
  calcPage1a,
  calcPage2,
  calcPage2Section,
  calcPage3,
  calcSummary,
  fixtureRowTotal,
  lineTotal,
  money,
} from './calc.ts';
import type { BidDocument, FixtureRow, LineItem } from './types.ts';

/** Company line on the takeoff materials print sheet and its PDF. */
export const TAKEOFF_PRINT_COMPANY = 'ITDG Plumbing';

export type TakeoffRole = 'owner' | 'office' | 'crew';

/**
 * Full Bid Takeoff is owner-only in the sidebar and AppLayout.
 * project_bids RLS policy owner_only_bids (ALL) also requires is_owner().
 * Crew may edit jobs, but they cannot edit or delete these estimates.
 */
export function canMutateFullTakeoff(role: TakeoffRole | null): boolean {
  return role === 'owner';
}

export type DeleteOutcome = 'deleted' | 'blocked' | 'failed';

/** Map a PostgREST delete result. RLS denials come back as zero rows and no error. */
export function interpretTakeoffDelete(
  errorMessage: string | null,
  deletedIds: readonly string[],
): DeleteOutcome {
  if (errorMessage !== null) return 'failed';
  if (deletedIds.length === 0) return 'blocked';
  return 'deleted';
}

export function formatTakeoffDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso.trim();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(n);
}

export type TakeoffPrintScope = 'materials' | 'summary' | 'both';

export const TAKEOFF_PRINT_OPTIONS: { scope: TakeoffPrintScope; label: string }[] = [
  { scope: 'materials', label: 'Materials (Pages 1-3)' },
  { scope: 'summary', label: 'Summary (Page 4)' },
  { scope: 'both', label: 'Both' },
];

export function takeoffPrintTitle(scope: TakeoffPrintScope): string {
  switch (scope) {
    case 'materials':
      return 'Takeoff materials';
    case 'summary':
      return 'Takeoff summary';
    case 'both':
      return 'Takeoff materials & summary';
    default: {
      const neverScope: never = scope;
      return neverScope;
    }
  }
}

function projectSlug(project: string): string {
  const slug = project
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'takeoff';
}

export function takeoffPdfFilename(project: string, scope: TakeoffPrintScope): string {
  const suffix = scope === 'materials'
    ? 'materials'
    : scope === 'summary'
      ? 'summary'
      : 'materials-summary';
  return `${projectSlug(project)}-${suffix}.pdf`;
}

export function materialsPdfFilename(project: string): string {
  return takeoffPdfFilename(project, 'materials');
}

export interface SummaryTextLine {
  key: string;
  label: string;
  value: string;
}

export interface SummaryAmountLine {
  key: string;
  label: string;
  amount: number;
  strong?: boolean;
}

/** Page 4 as the estimate sheet shows it. Dollar totals come from calcSummary. */
export interface TakeoffSummaryPrint {
  labor: SummaryTextLine[];
  markups: SummaryTextLine[];
  subs: SummaryAmountLine[];
  siteWorkLine: number;
  adders: SummaryTextLine[];
  waterfall: SummaryAmountLine[];
  finalBid: number;
  notes: string;
}

export function collectTakeoffSummary(doc: BidDocument): TakeoffSummaryPrint {
  const inputs = doc.summary;
  const totals = calcSummary(doc);
  return {
    labor: [
      ...inputs.laborHours.map((hour, index) => ({
        key: `hour-${index}`,
        label: hour.label,
        value: formatQty(hour.hours),
      })),
      { key: 'rate', label: 'Rate ($/hr)', value: formatQty(inputs.laborRate) },
      { key: 'hours', label: 'Total hours', value: formatQty(totals.laborHours) },
      { key: 'labor-cost', label: 'Labor cost', value: `$${money(totals.laborCost)}` },
    ],
    markups: [
      { key: 'overhead-pct', label: 'Overhead (decimal)', value: formatQty(inputs.overheadPct) },
      { key: 'profit-pct', label: 'Profit (decimal)', value: formatQty(inputs.profitPct) },
    ],
    subs: inputs.subs.map((sub, index) => ({
      key: `sub-${index}`,
      label: sub.label,
      amount: sub.amount,
    })),
    siteWorkLine: inputs.siteWorkLine,
    adders: [
      { key: 'prelien', label: 'Pre-lien', value: `$${money(inputs.preLien)}` },
      { key: 'travel', label: 'Travel', value: `$${money(inputs.travel)}` },
      { key: 'engineering', label: 'Engineering', value: `$${money(inputs.engineering)}` },
      { key: 'tax-rate', label: 'Sales tax rate (decimal)', value: formatQty(inputs.salesTaxPct) },
      {
        key: 'tax-base',
        label: 'Tax base override (blank = material)',
        value: inputs.taxBaseOverride == null ? 'material' : `$${money(inputs.taxBaseOverride)}`,
      },
      { key: 'factor', label: 'Bid factor (÷, default 1)', value: formatQty(inputs.bidFactor) },
    ],
    waterfall: [
      { key: 'pg1', label: 'Page 1 (H81 + I79)', amount: totals.pg1 },
      { key: 'pg2', label: 'Page 2 (F74)', amount: totals.pg2 },
      { key: 'pg3', label: 'Page 3 (P58)', amount: totals.pg3 },
      { key: 'totalMaterial', label: 'TOTAL MATERIAL', amount: totals.totalMaterial, strong: true },
      { key: 'labor', label: `Labor (${totals.laborHours} hrs × $${inputs.laborRate})`, amount: totals.laborCost },
      { key: 'i16', label: 'Material + Labor', amount: totals.i16 },
      { key: 'overhead', label: `Overhead (${(inputs.overheadPct * 100).toFixed(0)}%)`, amount: totals.overhead },
      { key: 'i18', label: 'Subtotal', amount: totals.i18 },
      { key: 'profit', label: `Profit (${(inputs.profitPct * 100).toFixed(0)}%)`, amount: totals.profit },
      { key: 'i20', label: 'Subtotal', amount: totals.i20 },
      { key: 'subs', label: 'Site work subs (×1.15)', amount: totals.subsTotal },
      { key: 'base', label: 'BASE BID', amount: totals.baseBid, strong: true },
      { key: 'i28', label: '+ Pre-lien', amount: totals.i28 },
      { key: 'i31', label: '+ Travel + Engineering', amount: totals.i31 },
      { key: 'tax', label: `Sales tax (${(inputs.salesTaxPct * 100).toFixed(1)}%)`, amount: totals.salesTax },
    ],
    finalBid: totals.finalBid,
    notes: (inputs.notes ?? '').trim(),
  };
}

export type MaterialKind = 'material' | 'pipe' | 'fixture';

export interface MaterialLine {
  id: string;
  size: string;
  item: string;
  qty: number;
  unitPrice: number;
  mult: number;
  total: number;
  fixture: number;
  trim: number;
  trim2: number;
  misc: number;
  hookup: boolean;
}

export interface MaterialAdjustment {
  label: string;
  amount: number;
}

export interface MaterialSection {
  key: string;
  title: string;
  kind: MaterialKind;
  lines: MaterialLine[];
  adjustments: MaterialAdjustment[];
  totalLabel: string;
  total: number;
}

export interface MaterialTotal {
  label: string;
  amount: number;
  strong: boolean;
}

export interface TakeoffMaterialsSheet {
  project: string;
  customer: string;
  dateLabel: string;
  sections: MaterialSection[];
  totals: MaterialTotal[];
  notes: string;
}

function entered(qty: number): boolean {
  return Number.isFinite(qty) && qty !== 0;
}

function materialLine(line: LineItem): MaterialLine {
  return {
    id: line.id,
    size: line.size ?? '',
    item: line.item,
    qty: line.qty,
    unitPrice: line.price,
    mult: line.mult,
    total: lineTotal(line),
    fixture: 0,
    trim: 0,
    trim2: 0,
    misc: 0,
    hookup: false,
  };
}

function fixtureLine(row: FixtureRow): MaterialLine {
  return {
    id: row.id,
    size: '',
    item: row.item,
    qty: row.qty,
    unitPrice: row.fixture,
    mult: 1,
    total: fixtureRowTotal(row),
    fixture: row.fixture,
    trim: row.trim,
    trim2: row.trim2,
    misc: row.misc,
    hookup: row.hookup === true,
  };
}

function formatPct(fraction: number): string {
  const pct = fraction * 100;
  if (!Number.isFinite(pct)) return '0';
  const rounded = Math.round(pct * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function collectTakeoffMaterials(doc: BidDocument): TakeoffMaterialsSheet {
  const page1 = calcPage1(doc.page1);
  const page1a = calcPage1a(doc.page1a);
  const page2 = calcPage2(doc.page2);
  const page3 = calcPage3(doc.page3);
  const summary = calcSummary(doc);
  const sections: MaterialSection[] = [];

  const page1Lines = doc.page1.filter(line => entered(line.qty)).map(materialLine);
  if (page1Lines.length > 0) {
    sections.push({
      key: 'page1',
      title: 'Page 1 — Material / DWV Takeoff',
      kind: 'material',
      lines: page1Lines,
      adjustments: [],
      totalLabel: 'PAGE 1 TOTAL (×1.15)',
      total: page1.total,
    });
  }

  const page1aLines = doc.page1a.filter(line => entered(line.qty)).map(materialLine);
  if (page1aLines.length > 0) {
    sections.push({
      key: 'page1a',
      title: 'Page 1a — Cast Iron (No-Hub C.I.)',
      kind: 'material',
      lines: page1aLines,
      adjustments: [],
      totalLabel: 'PAGE 1a TOTAL (×1.05)',
      total: page1a.total,
    });
  }

  for (const section of doc.page2) {
    const lines = section.lines.filter(line => entered(line.qty)).map(materialLine);
    if (lines.length === 0) continue;
    const result = calcPage2Section(section);
    sections.push({
      key: section.key,
      title: `Page 2 — ${section.title}`,
      kind: 'pipe',
      lines,
      adjustments: [
        { label: `Fittings (${formatPct(section.fittingsPct)}%)`, amount: result.fittings },
      ],
      totalLabel: `Subtotal (×${section.tier})`,
      total: result.subtotal,
    });
  }

  const fixtures = doc.page3.filter(row => entered(row.qty)).map(fixtureLine);
  if (fixtures.length > 0) {
    sections.push({
      key: 'page3',
      title: 'Page 3 — Fixture Takeoff',
      kind: 'fixture',
      lines: fixtures,
      adjustments: [],
      totalLabel: 'PAGE 3 TOTAL (×1.03)',
      total: page3.total,
    });
  }

  return {
    project: doc.project.trim() || 'Untitled Bid',
    customer: doc.gcOwner.trim(),
    dateLabel: formatTakeoffDate(doc.date),
    sections,
    totals: [
      { label: 'Page 1 (×1.15)', amount: page1.total, strong: false },
      { label: 'Page 1a cast iron (×1.05)', amount: page1a.total, strong: false },
      { label: 'Page 1 combined', amount: page1.total + page1a.total, strong: false },
      { label: 'Page 2 (×1.03)', amount: page2.total, strong: false },
      { label: 'Page 3 (×1.03)', amount: page3.total, strong: false },
      { label: 'TOTAL MATERIAL', amount: summary.totalMaterial, strong: true },
    ],
    notes: (doc.summary.notes ?? '').trim(),
  };
}
