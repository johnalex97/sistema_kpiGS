import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordChangeForm } from "../components/auth/PasswordChangeForm";

export function ForcedPasswordChangePage() {
  const { changePassword, logout } = useAuth();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const handleLogout = async () => {
    if (logoutPending) return;
    setLogoutError(""); setLogoutPending(true);
    try { await logout(); } catch { setLogoutError("No fue posible cerrar sesión. Intenta nuevamente."); } finally { setLogoutPending(false); }
  };

  return (
    <AuthLayout>
      <p className="auth-eyebrow">ACCIÓN REQUERIDA</p>
      <h1>Protege tu cuenta</h1>
      <p className="auth-intro">Cambia la contraseña temporal antes de acceder al centro de control.</p>
      <PasswordChangeForm mode="forced" onSubmit={changePassword} />
      {logoutError && <p className="auth-form__error" role="alert">{logoutError}</p>}
      <button className="auth-logout" type="button" onClick={() => void handleLogout()} disabled={logoutPending}>{logoutPending ? "Cerrando sesión…" : "Cerrar sesión"}</button>
    </AuthLayout>
  );
}
