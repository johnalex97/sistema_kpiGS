import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import type { AuthUser } from "../models/auth";

export const adminUser: AuthUser = {
  id: "u1",
  email: "admin@geek.test",
  displayName: "Ada Admin",
  mustChangePassword: false,
  technicianId: null,
  roles: ["ADMIN"],
  permissions: ["KPI_VIEW_ALL", "ACTIVITIES_VIEW_ALL", "ACTIVITIES_MANAGE", "TECHNICIANS_VIEW", "TECHNICIANS_MANAGE", "RECURRENCES_VIEW_ALL"],
};

export const provisionalUser: AuthUser = { ...adminUser, mustChangePassword: true };

export const limitedUser: AuthUser = {
  ...adminUser,
  id: "u2",
  displayName: "Tania Técnica",
  roles: ["TECHNICIAN"],
  permissions: ["KPI_VIEW_OWN", "ACTIVITIES_CREATE_OWN"],
};

export function authContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: adminUser,
    notice: null,
    returnPath: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
    hasPermission: (...codes) => Boolean((overrides.user ?? adminUser)
      && codes.some((code) => (overrides.user ?? adminUser)!.permissions.includes(code))),
    ...overrides,
  };
}

export function renderWithAuth(ui: ReactElement, overrides: Partial<AuthContextValue> = {}) {
  return render(<AuthContext.Provider value={authContext(overrides)}>{ui}</AuthContext.Provider>);
}
