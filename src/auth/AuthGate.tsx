import type { PropsWithChildren } from "react";
import { AuthLayout } from "../components/auth/AuthLayout";
import { ForcedPasswordChangePage } from "../pages/ForcedPasswordChangePage";
import { LoginPage } from "../pages/LoginPage";
import { SessionUnavailablePage } from "../pages/SessionUnavailablePage";
import { useAuth } from "./useAuth";

export function AuthGate({ children }: PropsWithChildren) {
  const { status, user } = useAuth();
  if (status === "checking") return <AuthLayout><p className="auth-checking" role="status">Comprobando sesión</p></AuthLayout>;
  if (status === "unavailable") return <SessionUnavailablePage />;
  if (status === "anonymous" || !user) return <LoginPage />;
  if (user?.mustChangePassword) return <ForcedPasswordChangePage />;
  return children;
}
