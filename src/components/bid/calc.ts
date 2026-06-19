// Pure calculation layer — replicates the 25-year-old Excel formulas exactly.
// Every function takes the document slice it needs and returns full-precision floats.

import type {
  BidDocument,
  FixtureRow,
  LineItem,
  Page2Section,
  SummaryInputs,
} from './types';

export function lineTotal(l: LineItem): number {
  return l.qty * l.price * l.mult;
}

function sumLines(lines: LineItem[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0);
}

// ── PAGE 1 / 1a ──────────────────────────────────────────────────────────────
// The seed page1 array is segmented to mirror the Excel rows:
//   H68 = SUM(H7:H67)   -> first 61 items (DWV fittings)
//   H75 = SUM(H69:H74)  -> next 6 items   (solid-core pipe)
//   H77, H78, H79       -> the final individual rows
//   PAGE 1 TOTAL (H81) = (H68 + H75 + H77 + H78 + H79) * 1.15
export interface Page1Result {
  h68: number;
  h75: number;
  h77: number;
  h78: number;
  h79: number;
  total: number; // H81
}

export function calcPage1(page1: LineItem[]): Page1Result {
  // Indices are 0-based against an Excel sheet whose first line is row 7.
  const sec1 = page1.slice(0, 61); // rows 7..67
  const sec2 = page1.slice(62, 68); // rows 69..74
  const h68 = sumLines(sec1);
  const h75 = sumLines(sec2);
  const h77 = page1[70] ? lineTotal(page1[70]) : 0; // row 77
  const h78 = page1[71] ? lineTotal(page1[71]) : 0; // row 78
  const h79 = page1[72] ? lineTotal(page1[72]) : 0; // row 79
  const total = (h68 + h75 + h77 + h78 + h79) * 1.15;
  return { h68, h75, h77, h78, h79, total };
}

export interface Page1aResult {
  i53: number;
  i60: number;
  i68: number;
  i75: number;
  i77: number;
  total: number; // I79
}

export function calcPage1a(page1a: LineItem[]): Page1aResult {
  const s1 = page1a.slice(0, 46); // I7:I52
  const s2 = page1a.slice(47, 53); // I54:I59
  const s3 = page1a.slice(54, 61); // I61:I67
  const s4 = page1a.slice(62, 68); // I69:I74
  const i53 = sumLines(s1);
  const i60 = sumLines(s2);
  const i68 = sumLines(s3);
  const i75 = sumLines(s4);
  const i77 = page1a[69] ? lineTotal(page1a[69]) : 0;
  const total = (i53 + i60 + i68 + i75 + i77) * 1.05;
  return { i53, i60, i68, i75, i77, total };
}

// Pg1 combined = 'Page 1'!H81 + 'Page 1a'!I79
export function calcPage1Combined(doc: BidDocument): number {
  return calcPage1(doc.page1).total + calcPage1a(doc.page1a).total;
}

// ── PAGE 2 ────────────────────────────────────────────────────────────────────
// Each section: fittings = pct * SUM(lines); subtotal = SUM(lines + fittings) * tier.
// PEX uses tier = 1.0 (the *1.03 is skipped for that section).
// PAGE 2 TOTAL = (sum of section subtotals) * 1.03.
export interface Page2SectionResult {
  key: string;
  linesSum: number;
  fittings: number;
  subtotal: number;
}

export function calcPage2Section(sec: Page2Section): Page2SectionResult {
  const linesSum = sumLines(sec.lines);
  const fittings = sec.fittingsPct * linesSum;
  const subtotal = (linesSum + fittings) * sec.tier;
  return { key: sec.key, linesSum, fittings, subtotal };
}

export interface Page2Result {
  sections: Page2SectionResult[];
  total: number; // F74
}

export function calcPage2(sections: Page2Section[]): Page2Result {
  const results = sections.map(calcPage2Section);
  const total = results.reduce((s, r) => s + r.subtotal, 0) * 1.03;
  return { sections: results, total };
}

// ── PAGE 3 ────────────────────────────────────────────────────────────────────
// Row total = qty * (fixture + trim + trim2 + misc); hookup rows = qty * fixture.
// PAGE 3 TOTAL = SUM(rows) * 1.03.
export function fixtureRowTotal(r: FixtureRow): number {
  if (r.hookup) return r.qty * r.fixture;
  return r.qty * (r.fixture + r.trim + r.trim2 + r.misc);
}

export interface Page3Result {
  rowsSum: number;
  total: number; // P58
}

export function calcPage3(rows: FixtureRow[]): Page3Result {
  const rowsSum = rows.reduce((s, r) => s + fixtureRowTotal(r), 0);
  return { rowsSum, total: rowsSum * 1.03 };
}

// ── PAGE 4 — Summary waterfall ─────────────────────────────────────────────────
export interface SummaryResult {
  pg1: number;
  pg2: number;
  pg3: number;
  totalMaterial: number; // I14
  laborHours: number; // E15
  laborCost: number; // I15
  i16: number; // material + labor
  overhead: number; // I17
  i18: number;
  profit: number; // I19
  i20: number;
  subsTotal: number; // I25
  baseBid: number; // I26
  i28: number; // base + pre-lien
  i31: number; // + travel + engineering
  salesTax: number; // I32
  i33: number; // pre-divide final
  finalBid: number; // I33 / bidFactor
}

export function calcSummary(doc: BidDocument): SummaryResult {
  const s: SummaryInputs = doc.summary;

  const pg1 = calcPage1Combined(doc);
  const pg2 = calcPage2(doc.page2).total;
  const pg3 = calcPage3(doc.page3).total;
  const totalMaterial = pg1 + pg2 + pg3;

  const laborHours = s.laborHours.reduce((sum, h) => sum + h.hours, 0);
  const laborCost = s.laborRate * laborHours;

  const i16 = laborCost + totalMaterial;
  const overhead = i16 * s.overheadPct;
  const i18 = overhead + i16;
  const profit = i18 * s.profitPct;
  const i20 = profit + i18;

  const subsTotal = s.subs.reduce((sum, x) => sum + x.amount, 0) * 1.15;
  const baseBid = i20 + s.siteWorkLine + subsTotal; // I26

  const i28 = baseBid + s.preLien;
  const i31 = i28 + s.travel + s.engineering;

  const taxBase = s.taxBaseOverride ?? totalMaterial;
  const salesTax = taxBase * s.salesTaxPct;
  const i33 = i31 + salesTax;

  const factor = s.bidFactor && s.bidFactor !== 0 ? s.bidFactor : 1;
  const finalBid = factor === 1 ? i33 : i33 / factor;

  return {
    pg1,
    pg2,
    pg3,
    totalMaterial,
    laborHours,
    laborCost,
    i16,
    overhead,
    i18,
    profit,
    i20,
    subsTotal,
    baseBid,
    i28,
    i31,
    salesTax,
    i33,
    finalBid,
  };
}

// Display helper — currency $#,##0.00
export function money(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
