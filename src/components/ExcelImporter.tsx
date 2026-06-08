import React, { useState } from "react";
import { parseFileToSheets, SheetData } from "./parseExcel";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { UploadCloud } from "lucide-react";

type Mapping = {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  total?: string;
  size?: string;
};

type Props = {
  onImportComplete?: (summary: { imported: number }) => void;
  apiBase?: string;
};

// Helper function to guess which column is which based on the header text
function autoMapHeaders(headers: string[]): Mapping {
  const map: Mapping = {};
  headers.forEach((h) => {
    const lower = h.toLowerCase();
    if (lower.includes("desc") || lower.includes("item")) map.description = h;
    if (lower.includes("qty") || lower.includes("quan")) map.quantity = h;
    if (lower.includes("price") || lower.includes("cost")) map.unitPrice = h;
    if (lower.includes("total")) map.total = h;
    if (lower.includes("size")) map.size = h;
  });
  return map;
}

export default function ExcelImporter({ onImportComplete, apiBase = "" }: Props) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<{ row: number; msg: string }[]>([]);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportProgress("Parsing Excel file...");
      const parsed = await parseFileToSheets(file);
      setSheets(parsed);
      setSelectedSheet(parsed.length ? 0 : null);
      
      if (parsed.length) {
        const first = parsed[0];
        setPreviewRows(first.rows.slice(0, 5)); // Preview first 5 rows
        setMapping(autoMapHeaders(Object.keys(first.rows[0] || {})));
        setErrors([]);
      }
    } catch (err) {
      console.error("File parse error:", err);
      setErrors([{ row: 0, msg: "Failed to read the Excel file. Make sure it is a valid .xlsx or .csv" }]);
    } finally {
      setImportProgress(null);
    }
  }

  function handleImport() {
    // This is where you would normally map the rows and send to your database
    setImportProgress("Importing data...");
    
    setTimeout(() => {
      setImportProgress(null);
      if (onImportComplete) {
        onImportComplete({ imported: sheets[selectedSheet || 0]?.rows.length || 0 });
      }
      // Reset the uploader after success
      setSheets([]);
      setSelectedSheet(null);
    }, 1500);
  }

  return (
    <div className="space-y-4 text-sm text-slate-700">
      
      {/* File Upload Button */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors border border-blue-200 font-bold">
          <UploadCloud className="w-5 h-5" />
          Select Excel File
          <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={onFileChange} />
        </label>
        {importProgress && <span className="text-blue-600 font-medium animate-pulse">{importProgress}</span>}
      </div>

      {/* Sheet Preview & Controls */}
      {sheets.length > 0 && selectedSheet !== null && (
        <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm space-y-4 mt-4">
          
          <div className="flex items-center gap-3">
            <label className="font-bold text-slate-800">Active Tab:</label>
            <select
              className="border border-slate-300 rounded p-1.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              value={selectedSheet}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setSelectedSheet(idx);
                const sheet = sheets[idx];
                setPreviewRows(sheet.rows.slice(0, 5));
                setMapping(autoMapHeaders(Object.keys(sheet.rows[0] || {})));
              }}
            >
              {sheets.map((s, i) => (
                <option key={i} value={i}>{s.name} ({s.rows.length} rows)</option>
              ))}
            </select>
          </div>

          {/* Data Preview Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  {Object.keys(previewRows[0] || {}).map((header, i) => (
                    <th key={i} className="p-2.5 font-bold text-slate-700 uppercase tracking-wider">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    {Object.values(row).map((val: any, j) => (
                      <td key={j} className="p-2.5 truncate max-w-[150px]">{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-slate-400 italic">Showing first 5 rows preview...</div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleImport}
              disabled={!!importProgress}
              className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-black transition-colors shadow-sm disabled:opacity-50"
            >
              Confirm & Import Data
            </button>
          </div>
        </div>
      )}

      {/* Error Output */}
      {errors.length > 0 && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {errors.map((e, i) => (
            <div key={i} className="font-semibold">{e.msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}