import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationalDashboardApi } from "../api/dashboard";
import { ApiClientError } from "../api/http";
import type { OperationalDashboard } from "../models/dashboard";

export type OperationalDashboardState =
  | { status: "loading"; data?: OperationalDashboard; message?: never }
  | { status: "success" | "empty"; data: OperationalDashboard; message?: never }
  | { status: "error"; data?: OperationalDashboard; message: string };

export interface UseOperationalDashboardOptions {
  date?: string;
  pollIntervalMs?: number;
}

export interface OperationalDashboardController {
  date: string | undefined;
  state: OperationalDashboardState;
  refresh(): Promise<void>;
  retry(): Promise<void>;
  setDate(date?: string): void;
}

function hasContent(data: OperationalDashboard): boolean {
  return data.team.length > 0 || data.recentActivities.length > 0 || (data.recurrences?.openCases ?? 0) > 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "No fue posible actualizar la jornada operativa";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

export function useOperationalDashboard(
  api: OperationalDashboardApi,
  { date: initialDate, pollIntervalMs = 60_000 }: UseOperationalDashboardOptions = {},
): OperationalDashboardController {
  const [date, setDateValue] = useState(initialDate);
  const [state, setState] = useState<OperationalDashboardState>({ status: "loading" });
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const dataRef = useRef<OperationalDashboard | undefined>(undefined);

  const fetchDashboard = useCallback(async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = ++generationRef.current;
    try {
      const data = await api.getOperationalDashboard(date, controller.signal);
      if (generation !== generationRef.current || controller.signal.aborted) return;
      dataRef.current = data;
      setState({ status: hasContent(data) ? "success" : "empty", data });
    } catch (error: unknown) {
      if (generation !== generationRef.current || controller.signal.aborted || isAbortError(error)) return;
      if (error instanceof ApiClientError && error.status === 403) {
        dataRef.current = undefined;
        setState({ status: "error", message: errorMessage(error) });
        return;
      }
      const currentData = dataRef.current;
      setState({ status: "error", ...(currentData ? { data: currentData } : {}), message: errorMessage(error) });
    }
  }, [api, date]);

  const refresh = useCallback(async () => {
    setState((current) => ({ status: "loading", ...(current.data ? { data: current.data } : {}) }));
    await fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void fetchDashboard();
    });
    return () => {
      disposed = true;
    };
  }, [fetchDashboard]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(poll, pollIntervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
      else {
        generationRef.current += 1;
        controllerRef.current?.abort();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pollIntervalMs, refresh]);

  useEffect(() => () => {
    generationRef.current += 1;
    controllerRef.current?.abort();
  }, []);

  const setDate = useCallback((nextDate?: string) => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    setState((current) => ({ status: "loading", ...(current.data ? { data: current.data } : {}) }));
    setDateValue(nextDate);
  }, []);

  return { date, state, refresh, retry: refresh, setDate };
}
