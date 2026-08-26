import { type FormEvent, useState } from "react";
import { ApiClientError } from "../api/http";
import type { AuthNotice } from "../auth/AuthContext";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordField } from "../components/auth/PasswordField";

const loginMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "El correo o la contraseña no son correctos.",
  ACCOUNT_LOCKED: "La cuenta está bloqueada temporalmente. Intenta más tarde.",
  TOO_MANY_REQUESTS: "Demasiados intentos. Espera antes de volver a intentar.",
};

const noticeMessages: Record<Exclude<AuthNotice, null>, string> = {
  SESSION_EXPIRED: "Tu sesión terminó; inicia nuevamente.",
  LOGGED_OUT: "Tu sesión se cerró correctamente.",
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
      {notice && <p className="auth-notice" role="status">{noticeMessages[notice]}</p>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="auth-form__field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="username" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="auth-form__field">
          <label htmlFor="login-password">Contraseña</label>
          <PasswordField id="login-password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
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
