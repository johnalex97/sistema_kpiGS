import type { AuthPrincipal } from "../auth/auth.types.js";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
    auth?: AuthPrincipal;
  }
}

export {};
