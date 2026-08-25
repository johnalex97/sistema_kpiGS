import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authApi, type AuthApi } from "../api/auth";
import { ApiClientError, subscribeUnauthorized } from "../api/http";
import type { AuthUser, ChangePasswordInput, LoginInput } from "../models/auth";
import { isKnownInternalPath } from "../routes/appRoutes";
import { AuthContext, type AuthNotice, type AuthStatus } from "./AuthContext";

export function AuthProvider({ children, api = authApi }: PropsWithChildren<{ api?: AuthApi }>) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState<AuthNotice>(null);
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const expired = useRef(false);
  const restoreStarted = useRef(false);
  const requestVersion = useRef(0);

  const applyUser = useCallback((nextUser: AuthUser) => {
    expired.current = false;
    setUser(nextUser);
    setNotice(null);
    setStatus("authenticated");
  }, []);

  const expire = useCallback(() => {
    if (expired.current) return;
    requestVersion.current += 1;
    expired.current = true;
    setReturnPath(isKnownInternalPath(window.location.pathname) ? window.location.pathname : "/resumen");
    setUser(null);
    setNotice("SESSION_EXPIRED");
    setStatus("anonymous");
  }, []);

  useEffect(() => subscribeUnauthorized(expire), [expire]);

  const restore = useCallback(async () => {
    const version = ++requestVersion.current;
    setStatus("checking");
    try {
      const nextUser = await api.me();
      if (version !== requestVersion.current) return;
      applyUser(nextUser);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setUser(null);
      setStatus(error instanceof ApiClientError && error.status === 401 ? "anonymous" : "unavailable");
    }
  }, [api, applyUser]);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    void restore();
  }, [restore]);

  const login = useCallback(async (input: LoginInput) => {
    const version = ++requestVersion.current;
    const nextUser = await api.login(input);
    if (version !== requestVersion.current) return;
    applyUser(nextUser);
    if (returnPath && isKnownInternalPath(returnPath)) {
      window.history.replaceState({}, "", returnPath);
      setReturnPath(null);
    }
  }, [api, applyUser, returnPath]);

  const changePassword = useCallback(async (input: ChangePasswordInput) => {
    const version = ++requestVersion.current;
    const nextUser = await api.changePassword(input);
    if (version !== requestVersion.current) return;
    applyUser(nextUser);
  }, [api, applyUser]);

  const logout = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiClientError && error.status === 401)) throw error;
    }
    if (version !== requestVersion.current && !expired.current) return;
    expired.current = false;
    setUser(null);
    setReturnPath(null);
    setNotice("LOGGED_OUT");
    setStatus("anonymous");
  }, [api]);

  const hasPermission = useCallback((...permissions: string[]) =>
    Boolean(user && permissions.some((permission) => user.permissions.includes(permission))), [user]);

  const value = useMemo(() => ({
    status,
    user,
    notice,
    returnPath,
    login,
    changePassword,
    logout,
    retry: restore,
    hasPermission,
  }), [status, user, notice, returnPath, login, changePassword, logout, restore, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
