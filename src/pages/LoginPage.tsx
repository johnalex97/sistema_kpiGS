import { type FormEvent, useState } from "react";
import { ApiClientError } from "../api/http";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordField } from "../components/auth/PasswordField";

const loginMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "El correo o la contraseña no son correctos.",
  ACCOUNT_LOCKED: "La cuenta está bloqueada temporalmente. Intenta más tarde.",
  TOO_MANY_REQUESTS: "Demasiados intentos. Espera antes de volver a intentar.",
};

export function LoginPage() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await login({ email, password });
    } catch (reason) {
      setError(reason instanceof ApiClientError ? (loginMessages[reason.code] ?? "No fue posible iniciar sesión. Intenta nuevamente.") : "No fue posible iniciar sesión. Intenta nuevamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout>
      <p className="auth-eyebrow">ACCESO OPERATIVO</p>
      <h1>Iniciar sesión</h1>
      <p className="auth-intro">Confirma tu identidad para abrir el centro de control.</p>
      {notice === "SESSION_EXPIRED" && <p className="auth-form__error" role="alert">Tu sesión terminó; inicia nuevamente.</p>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="auth-form__field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="auth-form__field">
          <label htmlFor="login-password">Contraseña</label>
          <PasswordField id="login-password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        <button className="button button--primary auth-form__submit" type="submit" aria-describedby="login-submit-status">
          {pending ? "Iniciando sesión…" : "Iniciar sesión"}
        </button>
        <p className="sr-only" id="login-submit-status" role="status">{pending ? "Iniciando sesión" : ""}</p>
      </form>
    </AuthLayout>
  );
}
