import React, { useState } from 'react';
import { parseFileToSheets, type SheetData } from './parseExcel';
import { UploadCloud } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type Mapping = {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  total?: string;
  size?: string;
};

interface ImportSummary {
  imported: number;
}

interface Props {
  onImportComplete?: (summary: ImportSummary) => void;
}

// A parsed row from the sheet — column names are unknown until runtime
type SheetRow = Record<string, unknown>;

// A line item after column mapping is applied
interface MappedLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  size: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function autoMapHeaders(headers: string[]): Mapping {
  const map: Mapping = {};
  headers.forEach(h => {
    const lower = h.toLowerCase();
    if (lower.includes('desc') || lower.includes('item'))  map.description = h;
    if (lower.includes('qty')  || lower.includes('quan'))  map.quantity    = h;
    if (lower.includes('price')|| lower.includes('cost'))  map.unitPrice   = h;
    if (lower.includes('total'))                            map.total       = h;
    if (lower.includes('size'))                             map.size        = h;
  });
  return map;
}

function applyMapping(rows: SheetRow[], mapping: Mapping): MappedLineItem[] {
  return rows
    .filter(row => mapping.description && row[mapping.description])
    .map((row, i) => ({
      id:          `import-${i}-${Date.now()}`,
      description: mapping.description ? String(row[mapping.description] ?? '') : '',
      quantity:    mapping.quantity    ? Number(row[mapping.quantity]    ?? 0)  : 0,
      unitPrice:   mapping.unitPrice   ? Number(row[mapping.unitPrice]   ?? 0)  : 0,
      total:       mapping.total       ? Number(row[mapping.total]       ?? 0)  : 0,
      size:        mapping.size        ? String(row[mapping.size]        ?? '') : '',
    }));
}

function cellDisplay(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ExcelImporter({ onImportComplete }: Props) {
  const [sheets, setSheets]               = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<number | null>(null);
  const [mapping, setMapping]             = useState<Mapping>({});
  const [previewRows, setPreviewRows]     = useState<SheetRow[]>([]);
  const [errors, setErrors]               = useState<{ row: number; msg: string }[]>([]);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportProgress('Parsing Excel file...');
      const parsed = await parseFileToSheets(file);
      setSheets(parsed);
      setErrors([]);
      if (parsed.length) {
        const first = parsed[0];
        setSelectedSheet(0);
        setPreviewRows((first.rows as SheetRow[]).slice(0, 5));
        setMapping(autoMapHeaders(Object.keys((first.rows[0] as SheetRow) ?? {})));
      } else {
        setSelectedSheet(null);
      }
    } catch (err) {
      console.error('File parse error:', err);
      setErrors([{ row: 0, msg: 'Failed to read the file. Make sure it is a valid .xlsx or .csv.' }]);
    } finally {
      setImportProgress(null);
    }
  }

  function handleSheetChange(idx: number) {
    const sheet = sheets[idx];
    if (!sheet) return;
    setSelectedSheet(idx);
    setPreviewRows((sheet.rows as SheetRow[]).slice(0, 5));
    setMapping(autoMapHeaders(Object.keys((sheet.rows[0] as SheetRow) ?? {})));
  }

  function handleImport() {
    if (selectedSheet === null) return;
    const sheet = sheets[selectedSheet];
    if (!sheet) return;

    // Actually use the mapping to produce typed line items
    const lineItems = applyMapping(sheet.rows as SheetRow[], mapping);
    const validationErrors = lineItems
      .map((item, i) => (!item.description ? { row: i + 1, msg: `Row ${i + 1}: missing description` } : null))
      .filter((e): e is { row: number; msg: string } => e !== null);

    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }

    setImportProgress('Importing data...');
    setTimeout(() => {
      setImportProgress(null);
      onImportComplete?.({ imported: lineItems.length });
      setSheets([]);
      setSelectedSheet(null);
      setPreviewRows([]);
      setMapping({});
      setErrors([]);
    }, 1500);
  }

  const previewHeaders = Object.keys(previewRows[0] ?? {});

  return (
    <div className="space-y-4 text-sm text-slate-700">
      {/* File upload */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors border border-blue-200 font-bold">
          <UploadCloud className="w-5 h-5" />
          Select Excel File
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFileChange}
          />
        </label>
        {importProgress && (
          <span className="text-blue-600 font-medium animate-pulse">{importProgress}</span>
        )}
      </div>

      {/* Sheet preview & controls */}
      {sheets.length > 0 && selectedSheet !== null && (
        <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <label htmlFor="sheet-select" className="font-bold text-slate-800">Active Tab:</label>
            <select
              id="sheet-select"
              className="border border-slate-300 rounded p-1.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              value={selectedSheet}
              onChange={e => handleSheetChange(Number(e.target.value))}
            >
              {sheets.map((s, i) => (
                <option key={i} value={i}>{s.name} ({s.rows.length} rows)</option>
              ))}
            </select>
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    {previewHeaders.map(header => (
                      <th
                        key={header}
                        className="p-2.5 font-bold text-slate-700 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      {previewHeaders.map(header => (
                        <td key={header} className="p-2.5 truncate max-w-[150px]">
                          {cellDisplay(row[header])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-[10px] text-slate-400 italic">
            Showing first 5 rows preview · {Object.values(mapping).filter(Boolean).length} columns auto-mapped
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={!!importProgress}
              className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-black transition-colors shadow-sm disabled:opacity-50"
            >
              Confirm & Import Data
            </button>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="font-semibold text-xs">{e.msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}