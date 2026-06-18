import * as XLSX from 'xlsx';

export type SheetRow = Record<string, unknown>;

export interface SheetData {
  name: string;
  rows: SheetRow[];
}

export async function parseFileToSheets(file: File): Promise<SheetData[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { cellDates: true });

  return workbook.SheetNames.map(name => {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<SheetRow>(ws, { defval: '' });
    return { name, rows };
  });
}