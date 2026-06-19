// Data model for the 4-page Excel plumbing takeoff system.
// Full float precision is kept in state; rounding happens only at display time.

export interface LineItem {
  id: string;
  qty: number;
  size?: string;
  item: string;
  price: number;
  mult: number;
}

export interface FixtureRow {
  id: string;
  qty: number;
  item: string;
  fixture: number;
  trim: number;
  trim2: number;
  misc: number;
  hookup?: boolean; // hookup rows compute total = qty * fixture only
}

export interface Page2Section {
  key: string;
  title: string;
  lines: LineItem[];
  fittingsPct: number; // editable % applied to sum of lines
  tier: number; // tier markup (1.03, PEX = 1.0)
}

export interface LaborHour {
  label: string;
  hours: number;
}

export interface SubItem {
  label: string;
  amount: number;
}

export interface SummaryInputs {
  laborHours: LaborHour[];
  laborRate: number;
  overheadPct: number;
  profitPct: number;
  subs: SubItem[];
  siteWorkLine: number; // I21 direct sitework line
  preLien: number;
  travel: number;
  engineering: number;
  salesTaxPct: number;
  taxBaseOverride: number | null; // null => use TOTAL MATERIAL as tax base
  bidFactor: number; // defaults to 1 (no-op divisor)
}

export interface BidDocument {
  id?: string;
  project: string;
  gcOwner: string;
  date: string;
  page1: LineItem[];
  page1a: LineItem[];
  page2: Page2Section[];
  page3: FixtureRow[];
  summary: SummaryInputs;
}
