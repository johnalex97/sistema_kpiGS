import { useCallback, useEffect, useState } from "react";
import type { Page } from "../models/app";
import { getPageFromPath, getPathFromPage } from "../routes/appRoutes";

export function useAppRoute() {
  const [page, setPage] = useState<Page>(() =>
    getPageFromPath(window.location.pathname),
  );

  useEffect(() => {
    const handlePopState = () => setPage(getPageFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextPage: Page) => {
    const nextPath = getPathFromPage(nextPage);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPage(nextPage);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }, []);

  return { page, navigate };
}
