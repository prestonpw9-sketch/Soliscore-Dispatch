import { jsPDF } from 'jspdf';
import { money } from './calc.ts';
import {
  collectTakeoffMaterials,
  formatQty,
  TAKEOFF_PRINT_COMPANY,
  type MaterialKind,
  type MaterialLine,
  type TakeoffMaterialsSheet,
} from './materialsPrint.ts';
import type { BidDocument } from './types.ts';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const BOTTOM = PAGE_H - 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

type Align = 'left' | 'right';

interface Col {
  key: CellKey;
  title: string;
  width: number;
  align: Align;
}

type CellKey =
  | 'size'
  | 'item'
  | 'qty'
  | 'unitPrice'
  | 'mult'
  | 'total'
  | 'fixture'
  | 'trim'
  | 'trim2'
  | 'misc';

function fit(cols: Col[]): Col[] {
  const used = cols.slice(0, -1).reduce((sum, col) => sum + col.width, 0);
  const last = cols[cols.length - 1];
  return [...cols.slice(0, -1), { ...last, width: CONTENT_W - used }];
}

function columnsFor(kind: MaterialKind): Col[] {
  switch (kind) {
    case 'material':
      return fit([
        { key: 'size', title: 'Size', width: 58, align: 'left' },
        { key: 'item', title: 'Item', width: 214, align: 'left' },
        { key: 'qty', title: 'Qty', width: 42, align: 'right' },
        { key: 'unitPrice', title: 'Unit price', width: 72, align: 'right' },
        { key: 'mult', title: 'Mult', width: 42, align: 'right' },
        { key: 'total', title: 'Total', width: 80, align: 'right' },
      ]);
    case 'pipe':
      return fit([
        { key: 'item', title: 'Item', width: 272, align: 'left' },
        { key: 'qty', title: 'Qty', width: 42, align: 'right' },
        { key: 'unitPrice', title: 'Unit price', width: 72, align: 'right' },
        { key: 'mult', title: 'Mult', width: 42, align: 'right' },
        { key: 'total', title: 'Total', width: 80, align: 'right' },
      ]);
    case 'fixture':
      return fit([
        { key: 'item', title: 'Item', width: 156, align: 'left' },
        { key: 'qty', title: 'Qty', width: 36, align: 'right' },
        { key: 'fixture', title: 'Fixture', width: 64, align: 'right' },
        { key: 'trim', title: 'Trim', width: 58, align: 'right' },
        { key: 'trim2', title: 'Trim 2', width: 58, align: 'right' },
        { key: 'misc', title: 'Misc', width: 58, align: 'right' },
        { key: 'total', title: 'Total', width: 70, align: 'right' },
      ]);
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

function cellText(line: MaterialLine, key: CellKey): string {
  switch (key) {
    case 'size':
      return line.size;
    case 'item':
      return line.hookup ? `${line.item} (hookup)` : line.item;
    case 'qty':
      return formatQty(line.qty);
    case 'unitPrice':
      return money(line.unitPrice);
    case 'mult':
      return formatQty(line.mult);
    case 'total':
      return money(line.total);
    case 'fixture':
      return money(line.fixture);
    case 'trim':
      return line.hookup ? '-' : money(line.trim);
    case 'trim2':
      return line.hookup ? '-' : money(line.trim2);
    case 'misc':
      return line.hookup ? '-' : money(line.misc);
    default: {
      const neverKey: never = key;
      return neverKey;
    }
  }
}

/** Standard PDF fonts only cover WinAnsi. Keep the sheet readable if a glyph is missing. */
function pdfText(value: string): string {
  return value
    .replace(/×/g, 'x')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

export function buildMaterialsPdf(doc: BidDocument): jsPDF {
  return buildSheetPdf(collectTakeoffMaterials(doc));
}

export function buildSheetPdf(sheet: TakeoffMaterialsSheet): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  pdf.setProperties({ title: `Takeoff materials - ${pdfText(sheet.project)}` });
  let y = MARGIN;

  const newPage = () => {
    pdf.addPage();
    y = MARGIN;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(90);
    pdf.text(pdfText(`${sheet.project} - materials`), MARGIN, y);
    y += 16;
    pdf.setTextColor(0);
  };

  const ensure = (height: number) => {
    if (y + height <= BOTTOM) return;
    if (y <= MARGIN + 18) return;
    newPage();
  };

  const textBlock = (text: string, size: number, style: 'normal' | 'bold', gap: number) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(0);
    const lines = pdf.splitTextToSize(pdfText(text), CONTENT_W) as string[];
    const height = lines.length * (size + 2);
    ensure(height + gap);
    pdf.text(lines, MARGIN, y + size);
    y += height + gap;
  };

  textBlock(TAKEOFF_PRINT_COMPANY, 14, 'bold', 2);
  textBlock('Takeoff materials', 12, 'bold', 8);
  textBlock(sheet.project, 12, 'bold', 2);
  if (sheet.customer) textBlock(`GC / Owner: ${sheet.customer}`, 10, 'normal', 2);
  textBlock(sheet.dateLabel, 10, 'normal', 8);
  textBlock(
    'Quantities entered on the estimate. Blank price-book rows are left off. Totals include the same markups as the estimate sheet.',
    8,
    'normal',
    12,
  );

  if (sheet.sections.length === 0) {
    textBlock('No material quantities on this takeoff yet.', 11, 'bold', 10);
  }

  for (const section of sheet.sections) {
    textBlock(section.title, 11, 'bold', 4);
    drawTable(pdf, section.kind, section.lines, ensure, () => y, next => { y = next; });
    for (const adjustment of section.adjustments) {
      drawAmountRow(pdf, adjustment.label, money(adjustment.amount), false, ensure, () => y, next => { y = next; });
    }
    drawAmountRow(pdf, section.totalLabel, money(section.total), true, ensure, () => y, next => { y = next; });
    y += 8;
  }

  textBlock('Material totals', 11, 'bold', 4);
  for (const total of sheet.totals) {
    drawAmountRow(pdf, total.label, money(total.amount), total.strong, ensure, () => y, next => { y = next; });
  }

  if (sheet.notes) {
    y += 8;
    textBlock('Notes', 11, 'bold', 2);
    textBlock(sheet.notes, 9, 'normal', 4);
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(90);
    pdf.text(`${i} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 28, { align: 'right' });
  }

  return pdf;
}

function drawTable(
  pdf: jsPDF,
  kind: MaterialKind,
  lines: MaterialLine[],
  ensure: (height: number) => void,
  getY: () => number,
  setY: (y: number) => void,
) {
  const cols = columnsFor(kind);
  drawCells(pdf, cols, cols.map(col => col.title), true, ensure, getY, setY);
  for (const line of lines) {
    drawCells(pdf, cols, cols.map(col => cellText(line, col.key)), false, ensure, getY, setY);
  }
}

function drawCells(
  pdf: jsPDF,
  cols: Col[],
  values: string[],
  header: boolean,
  ensure: (height: number) => void,
  getY: () => number,
  setY: (y: number) => void,
) {
  pdf.setFont('helvetica', header ? 'bold' : 'normal');
  pdf.setFontSize(8);
  const wrapped = cols.map((col, index) =>
    pdf.splitTextToSize(pdfText(values[index] || ''), Math.max(8, col.width - 6)) as string[],
  );
  const rowH = Math.max(14, Math.max(...wrapped.map(lines => lines.length)) * 10 + 4);
  ensure(rowH);
  let y = getY();
  let x = MARGIN;
  pdf.setDrawColor(80);
  pdf.setTextColor(0);
  cols.forEach((col, index) => {
    if (header) {
      pdf.setFillColor(235, 235, 235);
      pdf.rect(x, y, col.width, rowH, 'FD');
    } else {
      pdf.rect(x, y, col.width, rowH);
    }
    const textX = col.align === 'right' ? x + col.width - 3 : x + 3;
    pdf.text(wrapped[index], textX, y + 9, { align: col.align, maxWidth: col.width - 6 });
    x += col.width;
  });
  setY(y + rowH);
}

function drawAmountRow(
  pdf: jsPDF,
  label: string,
  amount: string,
  strong: boolean,
  ensure: (height: number) => void,
  getY: () => number,
  setY: (y: number) => void,
) {
  ensure(14);
  const y = getY();
  pdf.setFont('helvetica', strong ? 'bold' : 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(0);
  pdf.text(pdfText(label), MARGIN, y + 10);
  pdf.text(amount, MARGIN + CONTENT_W, y + 10, { align: 'right' });
  setY(y + 14);
}
