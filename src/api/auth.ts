import type { AuthUser, ChangePasswordInput, LoginInput } from "../models/auth";
import { requestJson } from "./http";

interface UserEnvelope {
  user: AuthUser;
}

export interface AuthApi {
  login(input: LoginInput): Promise<AuthUser>;
  me(): Promise<AuthUser>;
  changePassword(input: ChangePasswordInput): Promise<AuthUser>;
  logout(): Promise<void>;
}

export const authApi: AuthApi = {
  async login(input) {
    const result = await requestJson<UserEnvelope>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ ...input, email: input.email.trim().toLowerCase() }),
    }, { notifyUnauthorized: false });
    return result.user;
  },

  async me() {
    return (await requestJson<UserEnvelope>("/auth/me", {}, { notifyUnauthorized: false })).user;
  },

  async changePassword(input) {
    return (await requestJson<UserEnvelope>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    })).user;
  },

  logout() {
    return requestJson<void>("/auth/logout", { method: "POST" }, { notifyUnauthorized: false });
  },
};
