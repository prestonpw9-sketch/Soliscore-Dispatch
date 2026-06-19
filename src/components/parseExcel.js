import * as XLSX from 'xlsx';
export async function parseFileToSheets(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { cellDates: true });
    return workbook.SheetNames.map(name => {
        const ws = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        return { name, rows };
    });
}
