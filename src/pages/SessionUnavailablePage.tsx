import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/auth/AuthLayout";

export function SessionUnavailablePage() {
  const { retry } = useAuth();
  const [pending, setPending] = useState(false);

  const retrySession = async () => {
    if (pending) return;
    setPending(true);
    try {
      await retry();
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout>
      <p className="auth-eyebrow">CONEXIÓN</p>
      <h1>No pudimos conectar</h1>
      <p className="auth-intro">No confirmamos el estado de tu sesión. Comprueba tu conexión e inténtalo de nuevo.</p>
      <button className="button button--primary auth-form__submit" type="button" onClick={() => void retrySession()} disabled={pending}>
        {pending ? "Reintentando…" : "Reintentar"}
      </button>
    </AuthLayout>
  );
}
