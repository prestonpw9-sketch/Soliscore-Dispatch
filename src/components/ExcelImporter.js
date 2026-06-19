import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { parseFileToSheets } from './parseExcel';
import { UploadCloud } from 'lucide-react';
// ── Helpers ────────────────────────────────────────────────────────────────
function autoMapHeaders(headers) {
    const map = {};
    headers.forEach(h => {
        const lower = h.toLowerCase();
        if (lower.includes('desc') || lower.includes('item'))
            map.description = h;
        if (lower.includes('qty') || lower.includes('quan'))
            map.quantity = h;
        if (lower.includes('price') || lower.includes('cost'))
            map.unitPrice = h;
        if (lower.includes('total'))
            map.total = h;
        if (lower.includes('size'))
            map.size = h;
    });
    return map;
}
function applyMapping(rows, mapping) {
    return rows
        .filter(row => mapping.description && row[mapping.description])
        .map((row, i) => ({
        id: `import-${i}-${Date.now()}`,
        description: mapping.description ? String(row[mapping.description] ?? '') : '',
        quantity: mapping.quantity ? Number(row[mapping.quantity] ?? 0) : 0,
        unitPrice: mapping.unitPrice ? Number(row[mapping.unitPrice] ?? 0) : 0,
        total: mapping.total ? Number(row[mapping.total] ?? 0) : 0,
        size: mapping.size ? String(row[mapping.size] ?? '') : '',
    }));
}
function cellDisplay(val) {
    if (val === null || val === undefined)
        return '—';
    if (typeof val === 'object')
        return JSON.stringify(val);
    return String(val);
}
// ── Component ──────────────────────────────────────────────────────────────
export default function ExcelImporter({ onImportComplete }) {
    const [sheets, setSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState(null);
    const [mapping, setMapping] = useState({});
    const [previewRows, setPreviewRows] = useState([]);
    const [errors, setErrors] = useState([]);
    const [importProgress, setImportProgress] = useState(null);
    async function onFileChange(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        try {
            setImportProgress('Parsing Excel file...');
            const parsed = await parseFileToSheets(file);
            setSheets(parsed);
            setErrors([]);
            if (parsed.length) {
                const first = parsed[0];
                setSelectedSheet(0);
                setPreviewRows(first.rows.slice(0, 5));
                setMapping(autoMapHeaders(Object.keys(first.rows[0] ?? {})));
            }
            else {
                setSelectedSheet(null);
            }
        }
        catch (err) {
            console.error('File parse error:', err);
            setErrors([{ row: 0, msg: 'Failed to read the file. Make sure it is a valid .xlsx or .csv.' }]);
        }
        finally {
            setImportProgress(null);
        }
    }
    function handleSheetChange(idx) {
        const sheet = sheets[idx];
        if (!sheet)
            return;
        setSelectedSheet(idx);
        setPreviewRows(sheet.rows.slice(0, 5));
        setMapping(autoMapHeaders(Object.keys(sheet.rows[0] ?? {})));
    }
    function handleImport() {
        if (selectedSheet === null)
            return;
        const sheet = sheets[selectedSheet];
        if (!sheet)
            return;
        // Actually use the mapping to produce typed line items
        const lineItems = applyMapping(sheet.rows, mapping);
        const validationErrors = lineItems
            .map((item, i) => (!item.description ? { row: i + 1, msg: `Row ${i + 1}: missing description` } : null))
            .filter((e) => e !== null);
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
    return (_jsxs("div", { className: "space-y-4 text-sm text-slate-700", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("label", { className: "flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors border border-blue-200 font-bold", children: [_jsx(UploadCloud, { className: "w-5 h-5" }), "Select Excel File", _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", className: "hidden", onChange: onFileChange })] }), importProgress && (_jsx("span", { className: "text-blue-600 font-medium animate-pulse", children: importProgress }))] }), sheets.length > 0 && selectedSheet !== null && (_jsxs("div", { className: "border border-slate-200 rounded-lg p-4 bg-white shadow-sm space-y-4 mt-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { htmlFor: "sheet-select", className: "font-bold text-slate-800", children: "Active Tab:" }), _jsx("select", { id: "sheet-select", className: "border border-slate-300 rounded p-1.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium", value: selectedSheet, onChange: e => handleSheetChange(Number(e.target.value)), children: sheets.map((s, i) => (_jsxs("option", { value: i, children: [s.name, " (", s.rows.length, " rows)"] }, i))) })] }), previewRows.length > 0 && (_jsx("div", { className: "overflow-x-auto rounded-lg border border-slate-200", children: _jsxs("table", { className: "w-full text-left text-xs", children: [_jsx("thead", { className: "bg-slate-100 border-b border-slate-200", children: _jsx("tr", { children: previewHeaders.map(header => (_jsx("th", { className: "p-2.5 font-bold text-slate-700 uppercase tracking-wider", children: header }, header))) }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: previewRows.map((row, i) => (_jsx("tr", { className: "hover:bg-slate-50 transition-colors", children: previewHeaders.map(header => (_jsx("td", { className: "p-2.5 truncate max-w-[150px]", children: cellDisplay(row[header]) }, header))) }, i))) })] }) })), _jsxs("div", { className: "text-[10px] text-slate-400 italic", children: ["Showing first 5 rows preview \u00B7 ", Object.values(mapping).filter(Boolean).length, " columns auto-mapped"] }), _jsx("div", { className: "flex justify-end pt-2", children: _jsx("button", { type: "button", onClick: handleImport, disabled: !!importProgress, className: "px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-black transition-colors shadow-sm disabled:opacity-50", children: "Confirm & Import Data" }) })] })), errors.length > 0 && (_jsx("div", { className: "mt-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg space-y-1", children: errors.map((e, i) => (_jsx("div", { className: "font-semibold text-xs", children: e.msg }, i))) }))] }));
}
