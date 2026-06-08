import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Building2,
  FolderKanban,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  Layers,
} from "lucide-react";

/* ----- Interfaces ----- */
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

/* ----- Constants ----- */
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

/* ----- Confirm Modal with focus management and trap (hardened) ----- */
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
  initialFocusRef?: React.RefObject<HTMLButtonElement>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Focus the provided ref or the confirm button inside the modal after a tick
    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        const btn = dialogRef.current?.querySelector<HTMLButtonElement>('button[data-confirm]');
        btn?.focus();
      }
    }, 0);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === "Tab") {
        // Basic focus trap with guards
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
      // restore focus if still in DOM
      try {
        previouslyFocused.current?.focus?.();
      } catch {
        // ignore if element removed
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
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
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

/* ----- ProjectsList Component ----- */
export default function ProjectsList({ onOpenQuickBid }: ProjectsListProps) {
  const [builders, setBuilders] = useState<BuilderRow[]>([]);
  const [expandedBuilders, setExpandedBuilders] = useState<Record<string, boolean>>({});
  const [projectsCache, setProjectsCache] = useState<Record<string, CacheEntry>>({});
  const [loadingBuilders, setLoadingBuilders] = useState<boolean>(true);
  const [buildersError, setBuildersError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmPayload, setConfirmPayload] = useState<{ id: string; name?: string } | null>(null);

  // Request counters to ignore stale responses
  const buildersRequestId = useRef(0);
  const projectsRequestIds = useRef<Record<string, number>>({});

  // Ref for confirm modal initial focus
  const confirmInitialRef = useRef<HTMLButtonElement | null>(null);

  /* Debounce search input */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchTerm]);

  /* Load builders with request-id guard */
  const loadBuilders = useCallback(async () => {
    const requestId = ++buildersRequestId.current;
    setLoadingBuilders(true);
    setBuildersError(null);

    try {
      const { data, error } = await supabase.from("builders").select("id, name").order("name", { ascending: true });

      // ignore if a newer request started
      if (requestId !== buildersRequestId.current) return;

      if (error) throw error;
      setBuilders((data || []) as BuilderRow[]);
    } catch (err: any) {
      console.error("Failed to load builders dataset:", err);
      if (requestId === buildersRequestId.current) {
        setBuildersError(err?.message ?? "Failed to sync general contractors catalog.");
      }
    } finally {
      if (requestId === buildersRequestId.current) setLoadingBuilders(false);
    }
  }, []);

  useEffect(() => {
    loadBuilders();
  }, [loadBuilders]);

  /* Server-side search RPC attempt (useCallback + normalization) */
  const performServerSearch = useCallback(async (query: string) => {
    if (!query || query.length < 3) return false;
    try {
      // RPC name: search_projects(q text) — must exist in your Supabase DB
      const { data, error } = await supabase.rpc("search_projects", { q: query });

      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        // RPC worked but no matches
        return true;
      }

      // Normalize RPC results into builders + cache
      // Expect rows like: { project_id, project_name, project_created_at, builder_id, builder_name }
      const rpcRows = data as any[];

      const buildersMap: Record<string, BuilderRow> = {};
      const newCache: Record<string, CacheEntry> = {};

      rpcRows.forEach((r) => {
        const bId = String(r.builder_id);
        if (!buildersMap[bId]) {
          buildersMap[bId] = { id: bId, name: String(r.builder_name ?? r.builder_name) };
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

      // Apply results (replace builders list with RPC results)
      setBuilders(Object.values(buildersMap));
      setProjectsCache((prev) => ({ ...prev, ...newCache }));
      return true;
    } catch (err) {
      // RPC not available or failed — fallback to client-side filtering
      console.info("Server-side search RPC failed or not available, falling back to client-side search.", err);
      return false;
    }
  }, []);

  /* Fetch projects for a builder (paginated). Uses request ids to ignore stale responses. */
  const fetchProjectsForBuilder = useCallback(async (builderId: string, nextPage = 1, pageSize = PAGE_SIZE) => {
    // assign request id first to avoid race
    const requestId = ((projectsRequestIds.current[builderId] || 0) + 1);
    projectsRequestIds.current[builderId] = requestId;

    // initialize cache entry if missing and set loading
    setProjectsCache((prev) => ({
      ...prev,
      [builderId]: prev[builderId] ?? { items: [], page: 0, hasMore: true, loading: false, error: null },
    }));

    setProjectsCache((prev) => ({
      ...prev,
      [builderId]: {
        ...(prev[builderId] ?? { items: [], page: 0, hasMore: true }),
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

      // ignore stale responses
      if (projectsRequestIds.current[builderId] !== requestId) return;

      if (error) throw error;

      const fetched = (data || []) as Project[];

      setProjectsCache((prev) => {
        const prevItems = prev[builderId]?.items ?? [];
        const combined = nextPage === 1 ? fetched : [...prevItems, ...fetched];
        return {
          ...prev,
          [builderId]: {
            items: combined,
            page: nextPage,
            hasMore: fetched.length === pageSize,
            loading: false,
            error: null,
          },
        };
      });
    } catch (err: any) {
      console.error(`Failed loading projects for builder ${builderId}:`, err);
      // ignore stale responses
      if (projectsRequestIds.current[builderId] !== requestId) return;

      setProjectsCache((prev) => ({
        ...prev,
        [builderId]: {
          ...(prev[builderId] ?? { items: [], page: 0, hasMore: true }),
          loading: false,
          error: err?.message ?? "Error fetching linked commercial projects.",
        },
      }));
    }
  }, []);

  /* Toggle builder foldout (functional update to avoid stale reads) */
  const toggleBuilder = useCallback(
    (builderId: string) => {
      setExpandedBuilders((prev) => {
        const nextState = !prev[builderId];
        if (nextState) {
          // If expanding, check cache and fetch if needed using functional update
          setProjectsCache((cachePrev) => {
            const hasNoCachedItems = !cachePrev[builderId] || cachePrev[builderId].items.length === 0;
            if (hasNoCachedItems && !cachePrev[builderId]?.loading) {
              // fire-and-forget; fetchProjectsForBuilder will update cache
              fetchProjectsForBuilder(builderId, 1);
            }
            return cachePrev;
          });
        }
        return { ...prev, [builderId]: nextState };
      });
    },
    [fetchProjectsForBuilder]
  );

  /* Load more (pagination) */
  const loadMore = useCallback(
    (builderId: string) => {
      setProjectsCache((prev) => {
        const entry = prev[builderId];
        if (!entry || entry.loading) return prev;
        const nextPage = (entry.page ?? 0) + 1;
        // trigger fetch
        fetchProjectsForBuilder(builderId, nextPage);
        return prev;
      });
    },
    [fetchProjectsForBuilder]
  );

  /* Request open quick bid via modal */
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

  /* Refresh everything (clears caches and reloads builders) */
  const refreshAll = useCallback(async () => {
    // bump request ids to ignore inflight responses
    buildersRequestId.current++;
    projectsRequestIds.current = {};
    setProjectsCache({});
    setExpandedBuilders({});
    setBuilders([]);
    setBuildersError(null);
    await loadBuilders();
  }, [loadBuilders]);

  /* Derived filtered builders: client-side fallback */
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!debouncedSearch) return;
      const usedRpc = await performServerSearch(debouncedSearch);
      if (!mounted) return;
      // if RPC used results, performServerSearch already updated builders/cache
      // otherwise client-side memoized filteredBuilders will handle filtering
    })();
    return () => {
      mounted = false;
    };
  }, [debouncedSearch, performServerSearch]);

  const filteredBuilders = useMemo(() => {
    if (!debouncedSearch) return builders;
    const q = debouncedSearch.toLowerCase();
    return builders.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      const cache = projectsCache[b.id];
      return cache?.items?.some((p) => p.name.toLowerCase().includes(q));
    });
  }, [builders, debouncedSearch, projectsCache]);

  /* UI states */
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
              onClick={refreshAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-200 hover:bg-red-100/50 transition-colors text-red-700 rounded-lg text-xs font-bold shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Force Full Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* Render main UI */
  return (
    <div className="space-y-4 w-full">
      {/* Control bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="projects-search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search GC clients or active sub-projects..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-800 dark:text-white transition-shadow"
            aria-label="Filter active operations indexing tool"
          />
        </div>

        <button
          onClick={refreshAll}
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

      {/* Builders list */}
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
                      {loadedProjectsCount > 0 ? `${loadedProjectsCount} records loaded` : "Lazy structural index"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleBuilder(builder.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`projects-foldout-${builder.id}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors shrink-0 ${
                      isExpanded
                        ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50"
                    }`}
                  >
                    <span>{isExpanded ? "Hide Details" : "View Sheets"}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Foldout */}
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
                          onClick={() => fetchProjectsForBuilder(builder.id, cache.page || 1)}
                          className="mt-2 px-2.5 py-1 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 font-bold rounded shadow-2xs hover:bg-red-50"
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
                              const matchedProj = cache.items.find((p) => p.id === targetId);
                              // capture value then reset native select (safe order)
                              e.currentTarget.value = "";
                              requestOpenQuickBid(targetId, matchedProj?.name);
                            }}
                            className="w-full pl-3 pr-10 py-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none cursor-pointer transition-all appearance-none"
                            aria-label={`Active projects selector for entity ${builder.name}`}
                          >
                            <option value="" disabled>
                              -- Select verified project line item to calculate bid --
                            </option>
                            {cache.items.map((project) => (
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

                      {/* Pagination */}
                      {cache?.hasMore && (
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => loadMore(builder.id)}
                            disabled={cache.loading}
                            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 min-w-[100px]"
                          >
                            {cache.loading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                            ) : (
                              <span>Fetch Next {PAGE_SIZE}</span>
                            )}
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

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmOpen}
        title={`Open quick bid${confirmPayload?.name ? ` — ${confirmPayload.name}` : ""}`}
        description="This will load the quick bid workflow for the selected project. Continue?"
        onConfirm={handleConfirmOpen}
        onCancel={handleCancelOpen}
        initialFocusRef={confirmInitialRef}
      />
    </div>
  );
}
