import { createContext } from "react";
import type { AuthUser, ChangePasswordInput, LoginInput } from "../models/auth";

export type AuthStatus = "checking" | "anonymous" | "authenticated" | "unavailable";
export type AuthNotice = "SESSION_EXPIRED" | "LOGGED_OUT" | null;

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  notice: AuthNotice;
  returnPath: string | null;
  login(input: LoginInput): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  logout(): Promise<void>;
  retry(): Promise<void>;
  hasPermission(...permissions: string[]): boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
