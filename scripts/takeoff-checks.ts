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
  collectTakeoffSummary,
  formatTakeoffDate,
  interpretTakeoffDelete,
  materialsPdfFilename,
  TAKEOFF_PRINT_COMPANY,
  takeoffPdfFilename,
  takeoffPrintTitle,
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
    laborHours: [{ label: 'Rough', hours: 8 }],
    laborRate: 65,
    overheadPct: 0.1,
    profitPct: 0.1,
    subs: [{ label: 'Excavation', amount: 100 }],
    siteWorkLine: 40,
    preLien: 50,
    travel: 20,
    engineering: 30,
    salesTaxPct: 0.087,
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
assert.equal(TAKEOFF_PRINT_COMPANY, 'ITDG Plumbing');
assert.equal(takeoffPrintTitle('materials'), 'Takeoff materials');
assert.equal(takeoffPrintTitle('summary'), 'Takeoff summary');
assert.equal(takeoffPrintTitle('both'), 'Takeoff materials & summary');
assert.equal(materialsPdfFilename('Mesa Rough Takeoff'), 'mesa-rough-takeoff-materials.pdf');
assert.equal(takeoffPdfFilename('Mesa Rough Takeoff', 'summary'), 'mesa-rough-takeoff-summary.pdf');
assert.equal(takeoffPdfFilename('Mesa Rough Takeoff', 'both'), 'mesa-rough-takeoff-materials-summary.pdf');

const totals = calcSummary(doc);
const summary = collectTakeoffSummary(doc);
const byKey = (key: string) => summary.waterfall.find(line => line.key === key);
assert.equal(byKey('pg1')?.amount, totals.pg1);
assert.equal(byKey('pg2')?.amount, totals.pg2);
assert.equal(byKey('pg3')?.amount, totals.pg3);
assert.equal(byKey('totalMaterial')?.amount, totals.totalMaterial);
assert.equal(byKey('labor')?.label, 'Labor (8 hrs × $65)');
assert.equal(byKey('labor')?.amount, totals.laborCost);
assert.equal(byKey('i16')?.amount, totals.i16);
assert.equal(byKey('overhead')?.label, 'Overhead (10%)');
assert.equal(byKey('overhead')?.amount, totals.overhead);
assert.equal(byKey('i18')?.label, 'Subtotal');
assert.equal(byKey('i18')?.amount, totals.i18);
assert.equal(byKey('profit')?.label, 'Profit (10%)');
assert.equal(byKey('profit')?.amount, totals.profit);
assert.equal(byKey('i20')?.amount, totals.i20);
assert.notEqual(byKey('i18')?.amount, byKey('i20')?.amount);
assert.equal(byKey('subs')?.label, 'Site work subs (×1.15)');
assert.equal(byKey('subs')?.amount, totals.subsTotal);
assert.equal(summary.subs[0]?.label, 'Excavation');
assert.equal(summary.subs[0]?.amount, 100);
assert.equal(summary.siteWorkLine, 40);
assert.equal(byKey('base')?.amount, totals.baseBid);
assert.equal(byKey('i28')?.amount, totals.i28);
assert.equal(byKey('i31')?.amount, totals.i31);
assert.equal(byKey('tax')?.label, 'Sales tax (8.7%)');
assert.equal(byKey('tax')?.amount, totals.salesTax);
assert.equal(summary.finalBid, totals.finalBid);
assert.equal(summary.labor.find(line => line.key === 'hours')?.value, String(totals.laborHours));
assert.equal(summary.notes, 'No street parking');

assert.ok(source.includes('ITDG Plumbing'));
assert.equal(source.includes('SOLIDCORE'), false);
assert.ok(source.includes('Takeoff materials & summary'));
assert.ok(source.includes('Mesa Rough Takeoff'));
assert.ok(source.includes('8 PVC DWV HXH 90 ELL'));
assert.ok(source.includes('TOTAL MATERIAL'));
assert.ok(source.includes('FINAL BID'));
assert.ok(source.includes('Page 4'));
assert.ok(source.includes('No street parking'));
assert.ok(source.includes(money(totals.finalBid)));
assert.equal(pdf.getNumberOfPages() >= 2, true);
assert.ok(source.includes(money(page1.lines[0].total)) || source.includes(money(page1.lines[0].total).replace('.', '')));

const summaryPdf = Buffer.from(buildMaterialsPdf(doc, 'summary').output('arraybuffer')).toString('latin1');
assert.ok(summaryPdf.includes('ITDG Plumbing'));
assert.ok(summaryPdf.includes('Takeoff summary'));
assert.ok(summaryPdf.includes('FINAL BID'));
assert.ok(summaryPdf.includes('BASE BID'));
assert.equal(summaryPdf.includes('8 PVC DWV HXH 90 ELL'), false);

const materialsPdf = Buffer.from(buildMaterialsPdf(doc, 'materials').output('arraybuffer')).toString('latin1');
assert.ok(materialsPdf.includes('Takeoff materials'));
assert.equal(materialsPdf.includes('Takeoff materials & summary'), false);
assert.ok(materialsPdf.includes('8 PVC DWV HXH 90 ELL'));
assert.equal(materialsPdf.includes('FINAL BID'), false);

console.log('takeoff checks passed');
