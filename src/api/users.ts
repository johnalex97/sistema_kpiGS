import { requestJson } from "./http";
import type { CreateUserAccountInput, UserAccount, UserAccountPage, UserRole } from "../models/user-account";

export const usersApi = {
  list(search: string, page: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ search: search.trim(), page: String(page), pageSize: "20" });
    return requestJson<UserAccountPage>(`/users?${query}`, { signal });
  },
  create(input: CreateUserAccountInput) {
    return requestJson<UserAccount>("/users", { method: "POST", body: JSON.stringify(input) });
  },
  changeRole(id: string, role: UserRole, version: number) {
    return requestJson<UserAccount>(`/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: JSON.stringify({ role, version }) });
  },
  changeStatus(id: string, status: "ACTIVE" | "INACTIVE", version: number) {
    return requestJson<UserAccount>(`/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status, version }) });
  },
  unlock(id: string, version: number) {
    return requestJson<UserAccount>(`/users/${encodeURIComponent(id)}/unlock`, { method: "POST", body: JSON.stringify({ version }) });
  },
  resetPassword(id: string, temporaryPassword: string, version: number) {
    return requestJson<UserAccount>(`/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: JSON.stringify({ temporaryPassword, version }) });
  },
};
