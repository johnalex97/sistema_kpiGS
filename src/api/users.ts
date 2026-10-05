import { requestJson } from "./http";
import type { CreateUserAccountInput, UserAccount, UserAccountPage } from "../models/user-account";

export const usersApi = {
  list(search: string, page: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ search: search.trim(), page: String(page), pageSize: "20" });
    return requestJson<UserAccountPage>(`/users?${query}`, { signal });
  },
  create(input: CreateUserAccountInput) {
    return requestJson<UserAccount>("/users", { method: "POST", body: JSON.stringify(input) });
  },
};
