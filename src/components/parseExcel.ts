// parseExcel.ts
import * as XLSX from "xlsx";

export type SheetData = { name: string; rows: Record<string, any>[] };

export async function parseFileToSheets(file: File): Promise<SheetData[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheets: SheetData[] = workbook.SheetNames.map(name => {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
    return { name, rows };
  });
  return sheets;
}
