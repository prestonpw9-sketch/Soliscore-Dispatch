import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from '../lib/supabase';
import {
  Building2, FolderKanban, Loader2, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Search, Layers,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ── Interfaces ─────────────────────────────────────────────────────────────

interface Project {
  id: string;
  builder_id: string;
  name: string;
  created_at: string;
}

interface BuilderRow {
  id: string;
  name: string;
}

interface ProjectsListProps {
  onOpenQuickBid: (projectId: string) => void;
}

interface CacheEntry {
  items: Project[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

// ── ConfirmModal ───────────────────────────────────────────────────────────

function ConfirmModal({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  initialFocusRef,
}: {
  open: boolean;
  title: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
  // FIX 2: React 19 requires RefObject<T | null>
  initialFocusRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // FIX 4: document.activeElement is Element | null, not HTMLElement | null
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        dialogRef.current?.querySelector<HTMLButtonElement>('button[data-confirm]')?.focus();
      }
    }, 0);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKey);
      try {
        previouslyFocused.current?.focus?.();
      } catch {
        // element removed from DOM
      }
    };
  }, [open, onCancel, initialFocusRef]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative max-w-md w-full bg-white dark:bg-slate-900 rounded-xl p-5 shadow-lg border border-slate-200 dark:border-slate-800"
        aria-describedby={description ? "confirm-desc" : undefined}
      >
        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">{title}</h3>
        {description && (
          <p id="confirm-desc" className="text-xs text-slate-600 dark:text-slate-300 mt-2">
            {description}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            data-confirm
            ref={initialFocusRef}
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProjectsList ───────────────────────────────────────────────────────────

export default function ProjectsList({ onOpenQuickBid }: ProjectsListProps) {
  const [builders, setBuilders]                     = useState<BuilderRow[]>([]);
  const [expandedBuilders, setExpandedBuilders]     = useState<Record<string, boolean>>({});
  const [projectsCache, setProjectsCache]           = useState<Record<string, CacheEntry>>({});
  const [loadingBuilders, setLoadingBuilders]       = useState<boolean>(true);
  const [buildersError, setBuildersError]           = useState<string | null>(null);
  const [searchTerm, setSearchTerm]                 = useState<string>('');
  const [debouncedSearch, setDebouncedSearch]       = useState<string>('');
  const [confirmOpen, setConfirmOpen]               = useState<boolean>(false);
  const [confirmPayload, setConfirmPayload]         = useState<{ id: string; name?: string } | null>(null);

  const buildersRequestId    = useRef(0);
  const projectsRequestIds   = useRef<Record<string, number>>({});

  // FIX 2: useRef<T>(null) — no union, React 19 infers RefObject<T | null>
  const confirmInitialRef = useRef<HTMLButtonElement>(null);

  /* Debounce */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchTerm]);

  /* Load builders */
  const loadBuilders = useCallback(async () => {
    const requestId = ++buildersRequestId.current;
    setLoadingBuilders(true);
    setBuildersError(null);
    try {
      const { data, error } = await supabase
        .from("builders")
        .select("id, name")
        .order("name", { ascending: true });
      if (requestId !== buildersRequestId.current) return;
      if (error) throw error;
      setBuilders((data ?? []) as BuilderRow[]);
    } catch (err) {
      // FIX 1: no `catch (err: any)` — narrow with instanceof
      if (requestId === buildersRequestId.current) {
        setBuildersError(getErrorMessage(err, 'Failed to sync general contractors catalog.'));
      }
    } finally {
      if (requestId === buildersRequestId.current) setLoadingBuilders(false);
    }
  }, []);

  useEffect(() => {
    void loadBuilders();
  }, [loadBuilders]);

  /* Server-side search */
  const performServerSearch = useCallback(async (query: string): Promise<boolean> => {
    if (!query || query.length < 3) return false;
    try {
      const { data, error } = await supabase.rpc("search_projects", { q: query });
      if (error) throw error;

      // FIX 3: guard Array.isArray before iterating — data is unknown from rpc()
      if (!Array.isArray(data) || data.length === 0) return true;

      const rpcRows = data as Record<string, unknown>[];
      const buildersMap: Record<string, BuilderRow> = {};
      const newCache: Record<string, CacheEntry> = {};

      rpcRows.forEach((r) => {
        const bId = String(r.builder_id);
        if (!buildersMap[bId]) {
          buildersMap[bId] = { id: bId, name: String(r.builder_name ?? '') };
        }
        if (!newCache[bId]) {
          newCache[bId] = { items: [], page: 1, hasMore: false, loading: false, error: null };
        }
        if (r.project_id) {
          newCache[bId].items.push({
            id: String(r.project_id),
            builder_id: bId,
            name: String(r.project_name),
            created_at: String(r.project_created_at),
          });
        }
      });

      setBuilders(Object.values(buildersMap));
      setProjectsCache((prev) => ({ ...prev, ...newCache }));
      return true;
    } catch (err) {
      console.info("Server-side search RPC failed, falling back to client-side.", err);
      return false;
    }
  }, []);

  /* Fetch projects for a builder */
  const fetchProjectsForBuilder = useCallback(async (builderId: string, nextPage = 1, pageSize = PAGE_SIZE) => {
    const requestId = ((projectsRequestIds.current[builderId] ?? 0) + 1);
    projectsRequestIds.current[builderId] = requestId;

    setProjectsCache((prev) => ({
      ...prev,
      [builderId]: {
        ...(prev[builderId] ?? { items: [], page: 0, hasMore: true, error: null }),
        loading: true,
        error: null,
      },
    }));

    try {
      const from = (nextPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("projects")
        .select("id, builder_id, name, created_at")
        .eq("builder_id", builderId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (projectsRequestIds.current[builderId] !== requestId) return;
      if (error) throw error;

      const fetched = (data ?? []) as Project[];
      setProjectsCache((prev) => {
        const prevItems = prev[builderId]?.items ?? [];
        return {
          ...prev,
          [builderId]: {
            items: nextPage === 1 ? fetched : [...prevItems, ...fetched],
            page: nextPage,
            hasMore: fetched.length === pageSize,
            loading: false,
            error: null,
          },
        };
      });
    } catch (err) {
      // FIX 1: catch unknown, narrow with helper
      if (projectsRequestIds.current[builderId] !== requestId) return;
      setProjectsCache((prev) => ({
        ...prev,
        [builderId]: {
          ...(prev[builderId] ?? { items: [], page: 0, hasMore: true }),
          loading: false,
          error: getErrorMessage(err, 'Error fetching linked commercial projects.'),
        },
      }));
    }
  }, []);

  /* Toggle builder expand */
  const toggleBuilder = useCallback((builderId: string) => {
    setExpandedBuilders((prev) => {
      const nextState = !prev[builderId];
      if (nextState) {
        setProjectsCache((cachePrev) => {
          const hasNoCachedItems = !cachePrev[builderId] || cachePrev[builderId].items.length === 0;
          if (hasNoCachedItems && !cachePrev[builderId]?.loading) {
            void fetchProjectsForBuilder(builderId, 1);
          }
          return cachePrev;
        });
      }
      return { ...prev, [builderId]: nextState };
    });
  }, [fetchProjectsForBuilder]);

  /* Load more */
  const loadMore = useCallback((builderId: string) => {
    setProjectsCache((prev) => {
      const entry = prev[builderId];
      if (!entry || entry.loading) return prev;
      void fetchProjectsForBuilder(builderId, (entry.page ?? 0) + 1);
      return prev;
    });
  }, [fetchProjectsForBuilder]);

  /* Confirm modal */
  const requestOpenQuickBid = useCallback((projectId: string, projectName?: string) => {
    setConfirmPayload({ id: projectId, name: projectName });
    setConfirmOpen(true);
  }, []);

  const handleConfirmOpen = useCallback(() => {
    if (!confirmPayload) return;
    onOpenQuickBid(confirmPayload.id);
    setConfirmOpen(false);
    setConfirmPayload(null);
  }, [confirmPayload, onOpenQuickBid]);

  const handleCancelOpen = useCallback(() => {
    setConfirmOpen(false);
    setConfirmPayload(null);
  }, []);

  /* Refresh */
  const refreshAll = useCallback(async () => {
    buildersRequestId.current++;
    projectsRequestIds.current = {};
    setProjectsCache({});
    setExpandedBuilders({});
    setBuilders([]);
    setBuildersError(null);
    await loadBuilders();
  }, [loadBuilders]);

  /* Search effect */
  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!debouncedSearch) return;
      await performServerSearch(debouncedSearch);
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [debouncedSearch, performServerSearch]);

  /* Filtered builders */
  const filteredBuilders = useMemo(() => {
    if (!debouncedSearch) return builders;
    const q = debouncedSearch.toLowerCase();
    return builders.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      return projectsCache[b.id]?.items?.some((p) => p.name.toLowerCase().includes(q)) ?? false;
    });
  }, [builders, debouncedSearch, projectsCache]);

  // ── UI states ───────────────────────────────────────────────────────────

  if (loadingBuilders) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-white border rounded-xl shadow-sm">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="mt-3 text-sm font-semibold tracking-wide">Syncing General Contractors catalog...</p>
      </div>
    );
  }

  if (buildersError) {
    return (
      <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-4 text-red-700 shadow-sm">
        <AlertCircle className="w-6 h-6 shrink-0 text-red-500 mt-0.5" />
        <div className="text-sm flex-1">
          <p className="font-bold text-base">Master Synchronizer Error</p>
          <p className="opacity-90 text-xs mt-1 leading-relaxed">{buildersError}</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-200 hover:bg-red-100/50 transition-colors text-red-700 rounded-lg text-xs font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Force Full Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="projects-search"
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search GC clients or active sub-projects..."
            aria-label="Filter active operations indexing tool"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-800 dark:text-white transition-shadow"
          />
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors shrink-0"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
          <span className="text-xs text-slate-700 dark:text-slate-300 font-bold hidden sm:inline">Refresh</span>
        </button>
      </div>

      {debouncedSearch && (
        <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5 px-1">
          <Layers className="w-3.5 h-3.5" />
          <span>Searching active contractors or cached matching items.</span>
        </div>
      )}

      <div className="space-y-3">
        {filteredBuilders.map((builder) => {
          const cache = projectsCache[builder.id];
          const isExpanded = !!expandedBuilders[builder.id];
          const loadedProjectsCount = cache?.items?.length ?? 0;

          return (
            <div
              key={builder.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm sm:text-base">
                      {builder.name}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {loadedProjectsCount > 0 ? `${loadedProjectsCount} records loaded` : 'Lazy structural index'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleBuilder(builder.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`projects-foldout-${builder.id}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors shrink-0 ${
                    isExpanded
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50'
                  }`}
                >
                  <span>{isExpanded ? 'Hide Details' : 'View Sheets'}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {isExpanded && (
                <div
                  id={`projects-foldout-${builder.id}`}
                  className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3"
                >
                  {cache?.loading && loadedProjectsCount === 0 && (
                    <div className="flex items-center gap-2.5 py-3 px-1 text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span className="text-xs font-medium">Querying architectural specs registry...</span>
                    </div>
                  )}

                  {cache?.error && (
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-3 text-red-700 dark:text-red-400 text-xs flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <span className="font-bold block">Sub-query execution breakdown</span>
                        <p className="opacity-90 mt-0.5">{cache.error}</p>
                        <button
                          type="button"
                          onClick={() => void fetchProjectsForBuilder(builder.id, cache.page || 1)}
                          className="mt-2 px-2.5 py-1 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 font-bold rounded hover:bg-red-50"
                        >
                          Retry Node Fetch
                        </button>
                      </div>
                    </div>
                  )}

                  {!cache?.error && (loadedProjectsCount > 0 || (cache && !cache.loading)) && (
                    <>
                      {loadedProjectsCount > 0 ? (
                        <div className="relative">
                          <select
                            id={`select-${builder.id}`}
                            defaultValue=""
                            onChange={(e) => {
                              const targetId = e.target.value;
                              if (!targetId) return;
                              const matchedProj = cache.items.find(p => p.id === targetId);
                              e.currentTarget.value = '';
                              requestOpenQuickBid(targetId, matchedProj?.name);
                            }}
                            aria-label={`Active projects selector for entity ${builder.name}`}
                            className="w-full pl-3 pr-10 py-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none cursor-pointer transition-all appearance-none"
                          >
                            <option value="" disabled>
                              -- Select verified project line item to calculate bid --
                            </option>
                            {cache.items.map(project => (
                              <option key={project.id} value={project.id} className="bg-white text-slate-900 font-semibold">
                                {project.name} (Added {new Date(project.created_at).toLocaleDateString()})
                              </option>
                            ))}
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                            <FolderKanban className="w-4 h-4" />
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 border border-dashed rounded-lg p-3 text-center">
                          No functional project frameworks linked to this general contractor node.
                        </div>
                      )}

                      {cache?.hasMore && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => loadMore(builder.id)}
                            disabled={cache.loading}
                            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 min-w-[100px]"
                          >
                            {cache.loading
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                              : <span>Fetch Next {PAGE_SIZE}</span>
                            }
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredBuilders.length === 0 && builders.length > 0 && (
          <div className="text-center p-8 text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl font-medium">
            No matching items stored inside active telemetry indices. Check search spelling.
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={`Open quick bid${confirmPayload?.name ? ` — ${confirmPayload.name}` : ''}`}
        description="This will load the quick bid workflow for the selected project. Continue?"
        onConfirm={handleConfirmOpen}
        onCancel={handleCancelOpen}
        initialFocusRef={confirmInitialRef}
      />
    </div>
  );
}