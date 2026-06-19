// Builds a fresh BidDocument from the real Excel item list (BID_ITEMS_SEED.json).
// qty defaults to 0 so the team sees their familiar list with nothing filled in.

import seedData from '../BID_ITEMS_SEED.json';
import type {
  BidDocument,
  FixtureRow,
  LineItem,
  Page2Section,
  SummaryInputs,
} from './types';

interface SeedLine {
  size?: string;
  item: string;
  price: number;
  mult: number;
}
interface SeedSection {
  key: string;
  title: string;
  lines: SeedLine[];
  fittingsPct: number;
  tier: number;
}
interface SeedFixture {
  item: string;
  fixture: number;
  trim: number;
  trim2: number;
  misc: number;
}
interface SeedLabor {
  label: string;
  hours: number;
}

const seed = seedData as {
  page1: SeedLine[];
  page2: SeedSection[];
  page3: SeedFixture[];
  page4_labor: SeedLabor[];
};

let counter = 0;
function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function toLine(prefix: string, s: SeedLine): LineItem {
  return {
    id: makeId(prefix),
    qty: 0,
    size: s.size ?? '',
    item: s.item,
    price: s.price,
    mult: s.mult,
  };
}

// Page 3 hookup rows (Excel B39:B54) use total = qty * fixture only.
// Sheet starts at row 7, so row 39 -> index 32, row 54 -> index 47.
const HOOKUP_START = 32;
const HOOKUP_END = 47;

function toFixture(s: SeedFixture, index: number): FixtureRow {
  return {
    id: makeId('p3'),
    qty: 0,
    item: s.item,
    fixture: s.fixture,
    trim: s.trim,
    trim2: s.trim2,
    misc: s.misc,
    hookup: index >= HOOKUP_START && index <= HOOKUP_END,
  };
}

function toSection(s: SeedSection): Page2Section {
  return {
    key: s.key,
    title: s.title,
    lines: s.lines.map(l => toLine(`p2-${s.key}`, l)),
    fittingsPct: s.fittingsPct,
    tier: s.tier,
  };
}

function defaultSummary(): SummaryInputs {
  return {
    laborHours: seed.page4_labor.map(l => ({ label: l.label, hours: l.hours })),
    laborRate: 65,
    overheadPct: 0.1,
    profitPct: 0.1,
    subs: [
      { label: 'Sterilization', amount: 0 },
      { label: 'Excavation', amount: 0 },
      { label: 'Welding', amount: 0 },
    ],
    siteWorkLine: 0,
    preLien: 50,
    travel: 0,
    engineering: 0,
    salesTaxPct: 0.087,
    taxBaseOverride: null,
    bidFactor: 1,
  };
}

export function makeBlankDocument(): BidDocument {
  counter = 0;
  return {
    project: 'New Plumbing Bid',
    gcOwner: '',
    date: new Date().toISOString().slice(0, 10),
    page1: seed.page1.map(l => toLine('p1', l)),
    page1a: [],
    page2: seed.page2.map(toSection),
    page3: seed.page3.map(toFixture),
    summary: defaultSummary(),
  };
}

export function makeLineId(): string {
  return makeId('line');
}
