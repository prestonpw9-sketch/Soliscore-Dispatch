import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, UploadCloud } from 'lucide-react';
// ── Helpers ────────────────────────────────────────────────────────────────
function getErrorMessage(err, fallback) {
    return err instanceof Error ? err.message : fallback;
}
/** Strip the timestamp prefix added during upload: "1234567890-my-file.pdf" → "my-file.pdf" */
function displayName(fileName) {
    const idx = fileName.indexOf('-');
    return idx !== -1 ? fileName.substring(idx + 1) : fileName;
}
// ── Component ──────────────────────────────────────────────────────────────
export const BlueprintCard = () => {
    const [uploading, setUploading] = useState(false);
    const [blueprints, setBlueprints] = useState([]);
    const [fetchError, setFetchError] = useState(null);
    const [uploadError, setUploadError] = useState(null);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    // useCallback so it's safe to include in useEffect dependency array
    const fetchBlueprints = useCallback(async () => {
        setFetchError(null);
        const { data, error } = await supabase.storage
            .from('blueprints')
            .list('', {
            limit: 4,
            sortBy: { column: 'created_at', order: 'desc' },
        });
        if (error) {
            console.error('Error loading blueprints:', error);
            setFetchError(getErrorMessage(error, 'Failed to load blueprints.'));
        }
        else {
            setBlueprints((data ?? []));
        }
    }, []);
    useEffect(() => {
        void fetchBlueprints();
    }, [fetchBlueprints]);
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setUploading(true);
        setUploadError(null);
        setUploadSuccess(false);
        // Reset input so the same file can be re-uploaded after a failure
        e.target.value = '';
        try {
            const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
            const filePath = `${Date.now()}-${cleanName}`;
            const { error } = await supabase.storage
                .from('blueprints')
                .upload(filePath, file);
            if (error)
                throw error;
            await fetchBlueprints();
            setUploadSuccess(true);
            setTimeout(() => setUploadSuccess(false), 3000);
        }
        catch (err) {
            // FIX: no `catch (error: any)` — narrow with instanceof
            setUploadError(getErrorMessage(err, 'Failed to upload blueprint.'));
            console.error('Upload failed:', err);
        }
        finally {
            setUploading(false);
        }
    };
    const openFile = (fileName) => {
        const { data } = supabase.storage.from('blueprints').getPublicUrl(fileName);
        window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
    };
    return (_jsxs("div", { className: "p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs flex flex-col h-full min-h-[250px]", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-bold text-slate-900 dark:text-white", children: "Job Blueprints" }), _jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Active site plans & schematics" })] }), _jsxs("label", { className: `cursor-pointer text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-2 ${uploading
                            ? 'bg-indigo-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700'}`, children: [_jsx(UploadCloud, { className: "w-3.5 h-3.5", "aria-hidden": "true" }), uploading ? 'Uploading…' : 'Add Plan', _jsx("input", { type: "file", accept: ".pdf,.png,.jpg,.jpeg", className: "hidden", onChange: handleFileUpload, disabled: uploading, "aria-label": "Upload blueprint file" })] })] }), uploadSuccess && (_jsx("p", { role: "status", className: "text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-2", children: "\u2713 Blueprint uploaded successfully." })), uploadError && (_jsx("p", { role: "alert", className: "text-xs text-red-600 dark:text-red-400 font-semibold mb-2", children: uploadError })), fetchError && (_jsx("p", { role: "alert", className: "text-xs text-red-600 dark:text-red-400 font-semibold mb-2", children: fetchError })), _jsx("div", { className: "flex-1 overflow-y-auto", children: blueprints.length === 0 ? (_jsx("div", { className: "text-sm text-slate-400 font-medium text-center mt-8", children: "No blueprints uploaded yet." })) : (_jsx("ul", { className: "space-y-2", role: "list", children: blueprints.map(file => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => openFile(file.name), className: "group w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all text-left", children: _jsxs("div", { className: "flex items-center gap-3 overflow-hidden", children: [_jsx(FileText, { className: "w-5 h-5 text-slate-400 group-hover:text-indigo-500 shrink-0 transition-colors", "aria-hidden": "true" }), _jsx("span", { className: "truncate text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors", children: displayName(file.name) })] }) }) }, file.id))) })) })] }));
};
