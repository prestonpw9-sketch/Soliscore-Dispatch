This file is short and the logic is correct — but it has the usual Record<string, any>[] type and the XLSX type: "array" option is wrong for an ArrayBuffer (the correct value is "buffer" or just omitted, since XLSX.read auto-detects ArrayBuffer).

ts
import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────

// A row from sheet_to_json: keys are column headers, values are cell contents.
// `unknown` rather than `any` — callers must narrow before using values.
export type SheetRow = Record<string, unknown>;

export interface SheetData {
  name: string;
  rows: SheetRow[];
}

// ── Parser ─────────────────────────────────────────────────────────────────

export async function parseFileToSheets(file: File): Promise<SheetData[]> {
  const buffer = await file.arrayBuffer();

  // FIX: `type: "array"` is for Uint8Array — ArrayBuffer should omit `type`
  // so SheetJS auto-detects it, or pass `type: "buffer"` for Node Buffer.
  // cellDates: true converts numeric date serials into JS Date objects.
  const workbook = XLSX.read(buffer, { cellDates: true });

  return workbook.SheetNames.map(name => {
    const ws = workbook.Sheets[name];
    // defval: "" fills empty cells with an empty string instead of undefined,
    // so every row has the same keys and the preview table renders uniformly.
    const rows = XLSX.utils.sheet_to_json<SheetRow>(ws, { defval: '' });
    return { name, rows };
  });
}