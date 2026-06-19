// Pure calculation layer — replicates the 25-year-old Excel formulas exactly.
// Every function takes the document slice it needs and returns full-precision floats.
export function lineTotal(l) {
    return l.qty * l.price * l.mult;
}
function sumLines(lines) {
    return lines.reduce((s, l) => s + lineTotal(l), 0);
}
export function calcPage1(page1) {
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
export function calcPage1a(page1a) {
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
export function calcPage1Combined(doc) {
    return calcPage1(doc.page1).total + calcPage1a(doc.page1a).total;
}
export function calcPage2Section(sec) {
    const linesSum = sumLines(sec.lines);
    const fittings = sec.fittingsPct * linesSum;
    const subtotal = (linesSum + fittings) * sec.tier;
    return { key: sec.key, linesSum, fittings, subtotal };
}
export function calcPage2(sections) {
    const results = sections.map(calcPage2Section);
    const total = results.reduce((s, r) => s + r.subtotal, 0) * 1.03;
    return { sections: results, total };
}
// ── PAGE 3 ────────────────────────────────────────────────────────────────────
// Row total = qty * (fixture + trim + trim2 + misc); hookup rows = qty * fixture.
// PAGE 3 TOTAL = SUM(rows) * 1.03.
export function fixtureRowTotal(r) {
    if (r.hookup)
        return r.qty * r.fixture;
    return r.qty * (r.fixture + r.trim + r.trim2 + r.misc);
}
export function calcPage3(rows) {
    const rowsSum = rows.reduce((s, r) => s + fixtureRowTotal(r), 0);
    return { rowsSum, total: rowsSum * 1.03 };
}
export function calcSummary(doc) {
    const s = doc.summary;
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
export function money(n) {
    return n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
