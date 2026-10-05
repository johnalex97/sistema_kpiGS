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
};
