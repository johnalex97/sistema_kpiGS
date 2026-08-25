import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordChangeForm } from "../components/auth/PasswordChangeForm";

export function ForcedPasswordChangePage() {
  const { changePassword, logout } = useAuth();

  return (
    <AuthLayout>
      <p className="auth-eyebrow">ACCIÓN REQUERIDA</p>
      <h1>Protege tu cuenta</h1>
      <p className="auth-intro">Cambia la contraseña temporal antes de acceder al centro de control.</p>
      <PasswordChangeForm mode="forced" onSubmit={changePassword} />
      <button className="auth-logout" type="button" onClick={() => void logout()}>Cerrar sesión</button>
    </AuthLayout>
  );
}
