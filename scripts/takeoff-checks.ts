/**
 * Full takeoff delete permission and materials print sheet.
 * Run: npm run test:takeoff
 */
import assert from 'node:assert/strict';
import { calcPage1, calcPage2, calcPage3, calcSummary, fixtureRowTotal, money } from '../src/components/bid/calc.ts';
import { buildMaterialsPdf } from '../src/components/bid/materialsPdf.ts';
import {
  canMutateFullTakeoff,
  collectTakeoffMaterials,
  formatTakeoffDate,
  interpretTakeoffDelete,
  materialsPdfFilename,
} from '../src/components/bid/materialsPrint.ts';
import type { BidDocument } from '../src/components/bid/types.ts';

assert.equal(canMutateFullTakeoff('owner'), true);
assert.equal(canMutateFullTakeoff('crew'), false);
assert.equal(canMutateFullTakeoff('office'), false);
assert.equal(canMutateFullTakeoff(null), false);

assert.equal(interpretTakeoffDelete(null, ['bid-1']), 'deleted');
assert.equal(interpretTakeoffDelete(null, []), 'blocked');
assert.equal(interpretTakeoffDelete('permission denied', ['bid-1']), 'failed');
assert.equal(interpretTakeoffDelete('', []), 'failed');

assert.equal(formatTakeoffDate('2026-11-15'), 'Nov 15, 2026');
assert.equal(materialsPdfFilename('Mesa Rough Takeoff'), 'mesa-rough-takeoff-materials.pdf');
assert.equal(materialsPdfFilename('A/B House'), 'a-b-house-materials.pdf');
assert.equal(materialsPdfFilename('   '), 'takeoff-materials.pdf');

const doc: BidDocument = {
  project: 'Mesa Rough Takeoff',
  gcOwner: 'Mesa Builder',
  date: '2026-11-15',
  page1: [
    { id: 'p1', qty: 4, size: '8"', item: '8 PVC DWV HXH 90 ELL', price: 10, mult: 1 },
    { id: 'p1-zero', qty: 0, size: '6"', item: 'UNUSED FITTING', price: 5, mult: 1 },
  ],
  page1a: [
    { id: 'p1a', qty: 0, size: '4"', item: 'NO HUB', price: 3, mult: 1 },
  ],
  page2: [
    {
      key: 'copper',
      title: 'Copper',
      fittingsPct: 0.43,
      tier: 1.03,
      lines: [
        { id: 'cu', qty: 10, item: '1/2 L SOFT COPPER', price: 2, mult: 1 },
        { id: 'cu0', qty: 0, item: 'UNUSED COPPER', price: 9, mult: 1 },
      ],
    },
    {
      key: 'pex',
      title: 'PEX',
      fittingsPct: 0.1,
      tier: 1,
      lines: [{ id: 'pex', qty: 0, item: 'UNUSED PEX', price: 1, mult: 1 }],
    },
  ],
  page3: [
    { id: 'fx', qty: 2, item: 'LAV', fixture: 40, trim: 10, trim2: 0, misc: 5 },
    { id: 'hook', qty: 1, item: 'Water heater hookup', fixture: 25, trim: 9, trim2: 9, misc: 9, hookup: true },
    { id: 'fx0', qty: 0, item: 'UNUSED WC', fixture: 1, trim: 1, trim2: 1, misc: 1 },
  ],
  summary: {
    laborHours: [{ label: 'Rough', hours: 0 }],
    laborRate: 65,
    overheadPct: 0.1,
    profitPct: 0.1,
    subs: [],
    siteWorkLine: 0,
    preLien: 0,
    travel: 0,
    engineering: 0,
    salesTaxPct: 0,
    taxBaseOverride: null,
    bidFactor: 1,
    notes: 'No street parking',
  },
};

const sheet = collectTakeoffMaterials(doc);
assert.equal(sheet.project, 'Mesa Rough Takeoff');
assert.equal(sheet.customer, 'Mesa Builder');
assert.equal(sheet.dateLabel, 'Nov 15, 2026');
assert.equal(sheet.notes, 'No street parking');

const page1 = sheet.sections.find(section => section.key === 'page1');
assert.ok(page1);
assert.equal(page1.lines.length, 1);
assert.equal(page1.lines[0].item, '8 PVC DWV HXH 90 ELL');
assert.equal(page1.lines[0].qty, 4);
assert.equal(page1.lines[0].size, '8"');
assert.equal(page1.total, calcPage1(doc.page1).total);
assert.equal(sheet.sections.some(section => section.key === 'page1a'), false);
assert.equal(sheet.sections.some(section => section.lines.some(line => line.item === 'UNUSED FITTING')), false);

const copper = sheet.sections.find(section => section.key === 'copper');
assert.ok(copper);
assert.equal(copper.title, 'Page 2 — Copper');
assert.equal(copper.lines.length, 1);
assert.equal(copper.adjustments[0]?.label, 'Fittings (43%)');
assert.equal(sheet.sections.some(section => section.key === 'pex'), false);

const fixtures = sheet.sections.find(section => section.key === 'page3');
assert.ok(fixtures);
assert.equal(fixtures.lines.length, 2);
const hook = fixtures.lines.find(line => line.hookup);
assert.ok(hook);
assert.equal(hook.total, fixtureRowTotal(doc.page3[1]));
assert.equal(fixtures.total, calcPage3(doc.page3).total);

const material = sheet.totals.find(total => total.label === 'TOTAL MATERIAL');
assert.ok(material);
assert.equal(material.amount, calcSummary(doc).totalMaterial);
assert.equal(sheet.totals.find(total => total.label.startsWith('Page 2'))?.amount, calcPage2(doc.page2).total);

const pdf = buildMaterialsPdf(doc);
const bytes = Buffer.from(pdf.output('arraybuffer'));
assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
const source = bytes.toString('latin1');
assert.ok(source.includes('Mesa Rough Takeoff'));
assert.ok(source.includes('8 PVC DWV HXH 90 ELL'));
assert.ok(source.includes('TOTAL MATERIAL'));
assert.ok(source.includes('No street parking'));
assert.equal(pdf.getNumberOfPages() >= 1, true);
assert.ok(source.includes(money(page1.lines[0].total)) || source.includes(money(page1.lines[0].total).replace('.', '')));

console.log('takeoff checks passed');
