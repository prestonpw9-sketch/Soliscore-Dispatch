import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Trash2, Map as MapIcon, Loader2, FileText, ExternalLink, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
// Strips the leading "1718745600000-" timestamp prefix while keeping the rest of the
// filename intact (so "floor-plan.pdf" stays "floor-plan.pdf").
function stripTimestamp(fileName) {
    return fileName.replace(/^\d+-/, '');
}
const BlueprintsModal = ({ isOpen, onClose }) => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [expandedGroups, setExpandedGroups] = useState(new Set(['Unassigned']));
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [newProject, setNewProject] = useState('');
    const [showAddProject, setShowAddProject] = useState(false);
    const [activeUploadGroup, setActiveUploadGroup] = useState(null);
    const fileInputRef = useRef(null);
    const modalRef = useRef(null);
    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase.storage
            .from('blueprints')
            .list('', { limit: 200, sortBy: { column: 'name', order: 'asc' } });
        if (fetchError) {
            setError(fetchError.message);
        }
        else {
            setFiles((data ?? [])
                .filter(f => f.name !== '.emptyFolderPlaceholder')
                .map(f => ({ id: f.id, name: f.name, created_at: f.created_at })));
        }
        setLoading(false);
    }, []);
    useEffect(() => {
        if (isOpen)
            void fetchFiles();
    }, [isOpen, fetchFiles]);
    useEffect(() => {
        if (!isOpen)
            return;
        const handleKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);
    // Group files by project prefix "ProjectName---filename.pdf"
    const groups = React.useMemo(() => {
        const map = new Map();
        files.forEach(f => {
            const sep = f.name.indexOf('---');
            const project = sep !== -1 ? f.name.substring(0, sep).replace(/_/g, ' ') : 'Unassigned';
            if (!map.has(project))
                map.set(project, []);
            map.get(project).push(f);
        });
        return Array.from(map.entries())
            .map(([name, groupFiles]) => ({ name, files: groupFiles }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [files]);
    // Prune stale group names from expandedGroups whenever the file list changes,
    // so deleted/empty projects don't linger forever.
    useEffect(() => {
        const valid = new Set(groups.map(g => g.name));
        setExpandedGroups(prev => {
            const next = new Set();
            prev.forEach(name => {
                if (valid.has(name) || name === activeUploadGroup)
                    next.add(name);
            });
            return next;
        });
    }, [groups, activeUploadGroup]);
    const toggleGroup = (name) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(name))
                next.delete(name);
            else
                next.add(name);
            return next;
        });
    };
    const expandGroup = (name) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.add(name);
            return next;
        });
    };
    const handleUpload = async (e, project) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !project) {
            setActiveUploadGroup(null);
            return;
        }
        setUploading(true);
        setActiveUploadGroup(project);
        setError(null);
        const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        const projectKey = project.replace(/\s+/g, '_');
        const filePath = `${projectKey}---${Date.now()}-${cleanName}`;
        const { error: uploadError } = await supabase.storage.from('blueprints').upload(filePath, file);
        if (uploadError) {
            setError(uploadError.message);
        }
        else {
            await fetchFiles();
            expandGroup(project);
        }
        setUploading(false);
        setActiveUploadGroup(null);
    };
    const handleDelete = async (fileName) => {
        const { error: deleteError } = await supabase.storage.from('blueprints').remove([fileName]);
        if (deleteError) {
            setError(deleteError.message);
        }
        else {
            setFiles(prev => prev.filter(f => f.name !== fileName));
            setConfirmDelete(null);
        }
    };
    const openFile = (fileName) => {
        const { data } = supabase.storage.from('blueprints').getPublicUrl(fileName);
        window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
    };
    const handleAddProject = (e) => {
        e.preventDefault();
        const name = newProject.trim();
        if (!name)
            return;
        expandGroup(name);
        setActiveUploadGroup(name);
        setNewProject('');
        setShowAddProject(false);
        setTimeout(() => fileInputRef.current?.click(), 100);
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4", onClick: e => { if (e.target === e.currentTarget)
            onClose(); }, children: _jsxs("div", { ref: modalRef, role: "dialog", "aria-modal": "true", "aria-labelledby": "blueprints-title", className: "bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800 overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl", children: _jsx(MapIcon, { className: "w-5 h-5 text-blue-600 dark:text-blue-400" }) }), _jsxs("div", { children: [_jsx("h2", { id: "blueprints-title", className: "text-lg font-black text-slate-900 dark:text-white", children: "Job Blueprints" }), _jsxs("p", { className: "text-xs text-slate-500", children: [files.length, " file", files.length !== 1 ? 's' : '', " \u00B7 ", groups.length, " project", groups.length !== 1 ? 's' : ''] })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { type: "button", onClick: () => setShowAddProject(v => !v), className: "flex items-center gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl transition-colors", children: [_jsx(Plus, { className: "w-3.5 h-3.5" }), " New Project"] }), _jsx("button", { type: "button", onClick: onClose, className: "p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500", children: _jsx(X, { className: "w-5 h-5" }) })] })] }), showAddProject && (_jsxs("form", { onSubmit: handleAddProject, className: "px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex gap-3 shrink-0", children: [_jsx("input", { type: "text", value: newProject, onChange: e => setNewProject(e.target.value), placeholder: "Project name (e.g. ITDG Construction Phase 2)\u2026", autoFocus: true, className: "flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" }), _jsx("button", { type: "submit", disabled: !newProject.trim(), className: "bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors", children: "Create" })] })), error && (_jsx("div", { className: "mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm font-medium shrink-0", children: error })), _jsx("div", { className: "flex-1 overflow-y-auto", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-16", children: _jsx(Loader2, { className: "w-6 h-6 text-blue-500 animate-spin" }) })) : groups.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-slate-400 gap-3", children: [_jsx(MapIcon, { className: "w-12 h-12 opacity-20" }), _jsx("p", { className: "text-sm font-medium", children: "No blueprints yet. Create a project to get started." })] })) : (_jsx("div", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: groups.map(group => {
                            const expanded = expandedGroups.has(group.name);
                            const isUploadingHere = uploading && activeUploadGroup === group.name;
                            return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", children: [_jsxs("button", { type: "button", onClick: () => toggleGroup(group.name), className: "flex items-center gap-2 flex-1 text-left", children: [expanded
                                                        ? _jsx(ChevronDown, { className: "w-4 h-4 text-slate-400 shrink-0" })
                                                        : _jsx(ChevronRight, { className: "w-4 h-4 text-slate-400 shrink-0" }), _jsx("span", { className: "font-bold text-slate-800 dark:text-white", children: group.name }), _jsxs("span", { className: "text-xs text-slate-400 font-medium", children: [group.files.length, " file", group.files.length !== 1 ? 's' : ''] })] }), _jsxs("label", { className: `cursor-pointer flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isUploadingHere
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
                                                    : 'bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 dark:bg-slate-800 dark:hover:bg-blue-900/30 dark:text-slate-300'}`, children: [_jsx(Upload, { className: "w-3 h-3" }), isUploadingHere ? 'Uploading…' : 'Upload', _jsx("input", { type: "file", accept: ".pdf,.png,.jpg,.jpeg,.dwg", className: "hidden", disabled: uploading, onChange: e => void handleUpload(e, group.name) })] })] }), expanded && (_jsx("div", { className: "bg-slate-50/50 dark:bg-slate-800/20", children: group.files.map(file => {
                                            const isDeleting = confirmDelete === file.name;
                                            const rawName = file.name.includes('---')
                                                ? file.name.split('---')[1] ?? file.name
                                                : file.name;
                                            const name = stripTimestamp(rawName);
                                            return (_jsxs("div", { className: "flex items-center justify-between px-8 py-2.5 hover:bg-white dark:hover:bg-slate-800/50 transition-colors group", children: [_jsxs("button", { type: "button", onClick: () => openFile(file.name), className: "flex items-center gap-3 flex-1 text-left min-w-0", children: [_jsx(FileText, { className: "w-4 h-4 text-blue-400 shrink-0" }), _jsx("span", { className: "text-sm text-slate-700 dark:text-slate-300 truncate font-medium group-hover:text-blue-600 transition-colors", children: name }), _jsx(ExternalLink, { className: "w-3 h-3 text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors" })] }), isDeleting ? (_jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [_jsx("span", { className: "text-xs text-red-600 dark:text-red-400 font-semibold", children: "Delete?" }), _jsx("button", { type: "button", onClick: () => void handleDelete(file.name), className: "px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-lg", children: "Yes" }), _jsx("button", { type: "button", onClick: () => setConfirmDelete(null), className: "px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg", children: "No" })] })) : (_jsx("button", { type: "button", onClick: () => setConfirmDelete(file.name), className: "opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all", children: _jsx(Trash2, { className: "w-3.5 h-3.5" }) }))] }, file.id || file.name));
                                        }) }))] }, group.name));
                        }) })) }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".pdf,.png,.jpg,.jpeg,.dwg", className: "hidden", onChange: e => void handleUpload(e, activeUploadGroup) })] }) }));
};
export default BlueprintsModal;
