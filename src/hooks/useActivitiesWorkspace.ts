import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityApi } from "../api/activities";
import { ApiClientError } from "../api/http";
import type {
  ActivityActionCommand,
  ActivityDetail,
  ActivityFormValue,
  ActivityListFilters,
  ActivityPage,
  ActivityTeamInput,
  UpdateActivityInput,
} from "../models/activity";
import {
  defaultActivityFilters,
  parseActivitySearch,
  serializeActivitySearch,
  type ActivityQueryState,
  type ActivityView,
} from "./activity-workspace.helpers";

export interface ActivitiesWorkspace {
  query: ActivityQueryState;
  page: ActivityPage | null;
  selected: ActivityDetail | null;
  listState: "loading" | "ready" | "empty" | "error";
  stale: boolean;
  listError: string | null;
  detailState: "idle" | "loading" | "ready" | "error";
  mutation: ActivityMutationState | null;
  setView(view: ActivityView): void;
  setFilters(patch: Partial<ActivityListFilters>): void;
  retryList(): void;
  select(id: string): void;
  closeDetail(): void;
  refresh(): Promise<void>;
  createActivity(value: ActivityFormValue): Promise<boolean>;
  updateActivity(input: Omit<UpdateActivityInput, "version">): Promise<boolean>;
  replaceActivityTeam(team: ActivityTeamInput[]): Promise<boolean>;
  runAction(command: ActivityActionCommand): Promise<boolean>;
  clearMutationError(): void;
}

export type ActivityMutationName = "create" | "update" | "team" | "start" | "pause" | "resume" | "complete" | "cancel" | "adjust";

export interface ActivityMutationState {
  name: ActivityMutationName;
  pending: boolean;
  error: string | null;
  conflict: boolean;
}

export interface UseActivitiesWorkspaceOptions {
  api: ActivityApi;
  search: string;
  pollIntervalMs?: number;
  now?: () => Date;
}

const systemNow = () => new Date();

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function withoutMode<T extends { mode: "scheduled" | "manual" }>(value: T): Omit<T, "mode"> {
  const input = { ...value };
  Reflect.deleteProperty(input, "mode");
  return input;
}

export function useActivitiesWorkspace({
  api,
  search,
  pollIntervalMs = 30_000,
  now,
}: UseActivitiesWorkspaceOptions): ActivitiesWorkspace {
  const clock = now ?? systemNow;
  const [query, setQuery] = useState<ActivityQueryState>(() => {
    const parsed = parseActivitySearch(window.location.search, clock());
    return {
      ...parsed,
      filters: { ...parsed.filters, search: search.trim() || undefined },
    };
  });
  const [page, setPage] = useState<ActivityPage | null>(null);
  const [selected, setSelected] = useState<ActivityDetail | null>(null);
  const [listState, setListState] = useState<ActivitiesWorkspace["listState"]>("loading");
  const [stale, setStale] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<ActivitiesWorkspace["detailState"]>("idle");
  const [mutation, setMutation] = useState<ActivityMutationState | null>(null);

  const queryRef = useRef(query);
  const pageRef = useRef(page);
  const selectedRef = useRef(selected);
  const selectedIdRef = useRef<string | null>(null);
  const listControllerRef = useRef<AbortController | null>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const appliedSearchRef = useRef(search.trim());
  const mutationPendingRef = useRef(false);

  const beginListLoading = useCallback(() => {
    setListState("loading");
    setStale(false);
    setListError(null);
  }, []);

  const loadList = useCallback(async (): Promise<void> => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    const generation = ++listGenerationRef.current;
    try {
      const nextPage = await api.list(queryRef.current.filters, controller.signal);
      if (generation !== listGenerationRef.current || controller.signal.aborted) return;
      pageRef.current = nextPage;
      setPage(nextPage);
      setListState(nextPage.items.length === 0 ? "empty" : "ready");
      setStale(false);
      setListError(null);
    } catch (error: unknown) {
      if (isAbortError(error) || controller.signal.aborted || generation !== listGenerationRef.current) return;
      const message = errorMessage(error, "No fue posible cargar las actividades");
      setListError(message);
      if (pageRef.current) {
        setListState(pageRef.current.items.length === 0 ? "empty" : "ready");
        setStale(true);
      } else {
        setListState("error");
        setStale(false);
      }
    }
  }, [api]);

  const loadDetail = useCallback(async (id: string, silent: boolean): Promise<void> => {
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const generation = ++detailGenerationRef.current;
    try {
      const nextDetail = await api.detail(id, controller.signal);
      if (
        generation !== detailGenerationRef.current
        || controller.signal.aborted
        || selectedIdRef.current !== id
      ) return;
      selectedRef.current = nextDetail;
      setSelected(nextDetail);
      setDetailState("ready");
    } catch (error: unknown) {
      if (isAbortError(error) || controller.signal.aborted || generation !== detailGenerationRef.current) return;
      if (!silent || !selectedRef.current) setDetailState("error");
    }
  }, [api]);

  const refresh = useCallback(async (): Promise<void> => {
    const selectedId = selectedIdRef.current;
    await Promise.all([
      loadList(),
      ...(selectedId ? [loadDetail(selectedId, true)] : []),
    ]);
  }, [loadDetail, loadList]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    void loadList();
  }, [loadList, query]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === appliedSearchRef.current) return;
    const timer = window.setTimeout(() => {
      appliedSearchRef.current = normalized;
      beginListLoading();
      setQuery((current) => ({
        ...current,
        filters: { ...current.filters, search: normalized || undefined, page: 1 },
      }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [beginListLoading, search]);

  useEffect(() => {
    const serialized = serializeActivitySearch(window.location.search, query);
    const nextSearch = serialized.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl);
  }, [query]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseActivitySearch(window.location.search, clock());
      beginListLoading();
      setQuery({
        ...parsed,
        filters: { ...parsed.filters, search: appliedSearchRef.current || undefined },
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [beginListLoading, clock]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(poll, pollIntervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pollIntervalMs, refresh]);

  useEffect(() => () => {
    listGenerationRef.current += 1;
    detailGenerationRef.current += 1;
    listControllerRef.current?.abort();
    detailControllerRef.current?.abort();
  }, []);

  const setView = useCallback((view: ActivityView) => {
    beginListLoading();
    setQuery((current) => {
      const retained: Partial<ActivityListFilters> = { ...current.filters };
      delete retained.status;
      delete retained.startedFrom;
      delete retained.startedTo;
      delete retained.page;
      delete retained.pageSize;
      return { view, filters: { ...retained, ...defaultActivityFilters(view, clock()) } };
    });
  }, [beginListLoading, clock]);

  const setFilters = useCallback((patch: Partial<ActivityListFilters>) => {
    beginListLoading();
    setQuery((current) => ({
      ...current,
      filters: { ...current.filters, ...patch, page: patch.page ?? 1, pageSize: 25 },
    }));
  }, [beginListLoading]);

  const retryList = useCallback(() => {
    beginListLoading();
    void loadList();
  }, [beginListLoading, loadList]);

  const select = useCallback((id: string) => {
    selectedIdRef.current = id;
    selectedRef.current = null;
    setSelected(null);
    setDetailState("loading");
    void loadDetail(id, false);
  }, [loadDetail]);

  const closeDetail = useCallback(() => {
    selectedIdRef.current = null;
    detailGenerationRef.current += 1;
    detailControllerRef.current?.abort();
    selectedRef.current = null;
    setSelected(null);
    setDetailState("idle");
  }, []);

  const applyActivity = useCallback((activity: ActivityDetail) => {
    if (selectedIdRef.current === activity.id) {
      selectedRef.current = activity;
      setSelected(activity);
      setDetailState("ready");
    }
    const currentPage = pageRef.current;
    if (!currentPage?.items.some((item) => item.id === activity.id)) return;
    const nextPage = { ...currentPage, items: currentPage.items.map((item) => item.id === activity.id ? activity : item) };
    pageRef.current = nextPage;
    setPage(nextPage);
  }, []);

  const mutationError = useCallback(async (name: ActivityMutationName, error: unknown): Promise<boolean> => {
    let message = errorMessage(error, "No fue posible guardar los cambios");
    let conflict = false;
    if (error instanceof ApiClientError) {
      if (error.status === 403) message = "No tienes permiso para realizar esta acción.";
      if (error.status === 404) {
        message = "La actividad ya no está disponible.";
        closeDetail();
        await loadList();
      }
      if (error.status === 409 && error.code === "VERSION_CONFLICT") {
        conflict = true;
        message = "La actividad cambió en el servidor. Revisa la versión actual antes de continuar.";
        const id = selectedIdRef.current;
        if (id) await loadDetail(id, true);
      }
    }
    setMutation({ name, pending: false, error: message, conflict });
    return false;
  }, [closeDetail, loadDetail, loadList]);

  const executeMutation = useCallback(async (
    name: ActivityMutationName,
    operation: () => Promise<ActivityDetail>,
    options: { refreshAfter?: boolean } = {},
  ): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    mutationPendingRef.current = true;
    setMutation({ name, pending: true, error: null, conflict: false });
    try {
      const activity = await operation();
      applyActivity(activity);
      if (options.refreshAfter !== false) {
        await refresh();
        applyActivity(activity);
      }
      setMutation({ name, pending: false, error: null, conflict: false });
      return true;
    } catch (error: unknown) {
      return await mutationError(name, error);
    } finally {
      mutationPendingRef.current = false;
    }
  }, [applyActivity, mutationError, refresh]);

  const createActivity = useCallback(async (value: ActivityFormValue): Promise<boolean> => executeMutation(
    "create",
    () => {
      if (value.mode === "manual") {
        return api.createManual(withoutMode(value));
      }
      return api.create(withoutMode(value));
    },
  ), [api, executeMutation]);

  const updateActivity = useCallback(async (input: Omit<UpdateActivityInput, "version">): Promise<boolean> => {
    const activity = selectedRef.current;
    if (!activity || activity.status !== "PENDING") return false;
    return executeMutation("update", () => api.update(activity.id, { ...input, version: activity.version }));
  }, [api, executeMutation]);

  const replaceActivityTeam = useCallback(async (team: ActivityTeamInput[]): Promise<boolean> => {
    const activity = selectedRef.current;
    if (!activity || activity.status !== "PENDING") return false;
    return executeMutation("team", () => api.replaceTeam(activity.id, activity.version, team));
  }, [api, executeMutation]);

  const runAction = useCallback(async (command: ActivityActionCommand): Promise<boolean> => {
    const activity = selectedRef.current;
    if (!activity) return false;
    const { id, version } = activity;
    switch (command.type) {
      case "start": return executeMutation("start", () => api.start(id, version));
      case "pause": return executeMutation("pause", () => api.pause(id, { version, reason: command.reason }));
      case "resume": return executeMutation("resume", () => api.resume(id, version));
      case "complete": return executeMutation("complete", () => api.complete(id, { version, result: command.result, ...(command.observations !== undefined ? { observations: command.observations } : {}) }));
      case "cancel": return executeMutation("cancel", () => api.cancel(id, { version, reason: command.reason }));
      case "adjust": return executeMutation("adjust", () => api.adjust(id, { ...command.input, version }));
    }
  }, [api, executeMutation]);

  const clearMutationError = useCallback(() => setMutation(null), []);

  return {
    query,
    page,
    selected,
    listState,
    stale,
    listError,
    detailState,
    mutation,
    setView,
    setFilters,
    retryList,
    select,
    closeDetail,
    refresh,
    createActivity,
    updateActivity,
    replaceActivityTeam,
    runAction,
    clearMutationError,
  };
}
