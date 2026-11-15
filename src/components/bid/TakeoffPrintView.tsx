import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { money } from './calc';
import { downloadPdfFile, sharePdfFile } from './materialsFile';
import { buildMaterialsPdf } from './materialsPdf';
import {
  collectTakeoffMaterials,
  formatQty,
  materialsPdfFilename,
  TAKEOFF_PRINT_COMPANY,
  type MaterialKind,
  type MaterialLine,
  type TakeoffMaterialsSheet,
} from './materialsPrint';
import type { BidDocument } from './types';
import { isNativeDispatchApp } from '@/lib/geofence/nativeClient';
import { useBackHandler } from '@/lib/nav/backStack';

interface TakeoffPrintViewProps {
  doc: BidDocument;
  onClose: () => void;
}

export default function TakeoffPrintView({ doc, onClose }: TakeoffPrintViewProps) {
  const sheet = collectTakeoffMaterials(doc);
  const native = isNativeDispatchApp();
  const [message, setMessage] = useState<string | null>(null);
  const [pdfLink, setPdfLink] = useState<{ url: string; filename: string } | null>(null);
  useBackHandler(true, onClose);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Takeoff materials - ${sheet.project}`;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.title = previousTitle;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, sheet.project]);

  useEffect(() => {
    return () => {
      if (pdfLink) URL.revokeObjectURL(pdfLink.url);
    };
  }, [pdfLink]);

  function savePdf() {
    const filename = materialsPdfFilename(sheet.project);
    const blob = buildMaterialsPdf(doc).output('blob');
    void (async () => {
      const shared = await sharePdfFile(blob, filename);
      if (shared === 'cancelled') return;
      if (shared === 'shared') {
        setMessage('Share sheet opened.');
        return;
      }
      const url = downloadPdfFile(blob, filename);
      setPdfLink(current => {
        if (current) URL.revokeObjectURL(current.url);
        return { url, filename };
      });
      setMessage(native
        ? 'If nothing saved, use Open PDF and share it from your phone.'
        : 'PDF download started. You can also use Print and choose Save as PDF.');
    })();
  }

  return createPortal(
    <div className="takeoff-print-root fixed inset-0 z-[70] overflow-auto bg-slate-200 text-black">
      <div className="takeoff-print-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          <X className="h-4 w-4" /> Back to estimate
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          aria-label="Print this materials list"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-black"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
        <button
          type="button"
          onClick={savePdf}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          {native ? 'Save PDF / Share' : 'Save PDF'}
        </button>
        {message && <p className="text-sm text-slate-600">{message}</p>}
        {pdfLink && (
          <a
            href={pdfLink.url}
            download={pdfLink.filename}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline"
          >
            Open PDF
          </a>
        )}
      </div>
      <article className="takeoff-print-sheet mx-auto my-4 max-w-[8.5in] bg-white px-6 py-8 shadow-lg print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <MaterialsSheet sheet={sheet} />
      </article>
    </div>,
    document.body,
  );
}

function MaterialsSheet({ sheet }: { sheet: TakeoffMaterialsSheet }) {
  return (
    <>
      <p className="text-xs font-bold tracking-wide text-slate-500">{TAKEOFF_PRINT_COMPANY}</p>
      <h1 id="takeoff-print-title" className="mt-1 text-2xl font-black text-slate-950">
        Takeoff materials
      </h1>
      <p className="mt-3 text-lg font-bold text-slate-950">{sheet.project}</p>
      {sheet.customer && (
        <p className="text-sm text-slate-800">GC / Owner: {sheet.customer}</p>
      )}
      <p className="text-sm text-slate-700">{sheet.dateLabel}</p>
      <p className="mt-3 text-xs text-slate-500">
        Quantities entered on the estimate. Blank price-book rows are left off. Totals include the same markups as the estimate sheet.
      </p>
      {sheet.sections.length === 0 && (
        <p className="mt-6 font-semibold">No material quantities on this takeoff yet.</p>
      )}
      {sheet.sections.map(section => (
        <section key={section.key} className="mt-6">
          <h2 className="mb-2 text-base font-bold text-slate-950">{section.title}</h2>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-left text-xs">
              <SectionHead kind={section.kind} />
              <tbody>
                {section.lines.map(line => (
                  <SectionRow key={line.id} kind={section.kind} line={line} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {section.adjustments.map(adjustment => (
              <AmountRow key={adjustment.label} label={adjustment.label} amount={adjustment.amount} />
            ))}
            <AmountRow label={section.totalLabel} amount={section.total} strong />
          </div>
        </section>
      ))}
      <section className="mt-6 border-t border-slate-300 pt-3">
        <h2 className="mb-2 text-base font-bold">Material totals</h2>
        {sheet.totals.map(total => (
          <AmountRow key={total.label} label={total.label} amount={total.amount} strong={total.strong} />
        ))}
      </section>
      {sheet.notes && (
        <section className="mt-6">
          <h2 className="mb-1 text-base font-bold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{sheet.notes}</p>
        </section>
      )}
    </>
  );
}

function AmountRow({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-bold' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">${money(amount)}</span>
    </div>
  );
}

function SectionHead({ kind }: { kind: MaterialKind }) {
  switch (kind) {
    case 'material':
      return (
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 px-1.5 py-1">Size</th>
            <th className="border border-slate-400 px-1.5 py-1">Item</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Qty</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Unit price</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Mult</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Total</th>
          </tr>
        </thead>
      );
    case 'pipe':
      return (
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 px-1.5 py-1">Item</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Qty</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Unit price</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Mult</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Total</th>
          </tr>
        </thead>
      );
    case 'fixture':
      return (
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 px-1.5 py-1">Item</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Qty</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Fixture</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Trim</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Trim 2</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Misc</th>
            <th className="border border-slate-400 px-1.5 py-1 text-right">Total</th>
          </tr>
        </thead>
      );
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

function SectionRow({ kind, line }: { kind: MaterialKind; line: MaterialLine }) {
  switch (kind) {
    case 'material':
      return (
        <tr>
          <td className="border border-slate-300 px-1.5 py-1">{line.size}</td>
          <td className="border border-slate-300 px-1.5 py-1">{line.item}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{formatQty(line.qty)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{money(line.unitPrice)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{formatQty(line.mult)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{money(line.total)}</td>
        </tr>
      );
    case 'pipe':
      return (
        <tr>
          <td className="border border-slate-300 px-1.5 py-1">{line.item}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{formatQty(line.qty)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{money(line.unitPrice)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{formatQty(line.mult)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{money(line.total)}</td>
        </tr>
      );
    case 'fixture':
      return (
        <tr>
          <td className="border border-slate-300 px-1.5 py-1">
            {line.item}
            {line.hookup ? ' (hookup)' : ''}
          </td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{formatQty(line.qty)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{money(line.fixture)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{line.hookup ? '—' : money(line.trim)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{line.hookup ? '—' : money(line.trim2)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{line.hookup ? '—' : money(line.misc)}</td>
          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{money(line.total)}</td>
        </tr>
      );
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}
