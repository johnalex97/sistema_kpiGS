import type { Page } from "../models/app";

export function AccessDeniedPage({ fallbackPage, onGoToFallback }: {
  fallbackPage?: Page;
  onGoToFallback: () => void;
}) {
  return (
    <section className="access-denied" aria-labelledby="access-denied-title">
      <p className="eyebrow">PERMISO REQUERIDO</p>
      <h1 id="access-denied-title">Acceso denegado</h1>
      <p>No tienes permiso para consultar este módulo.</p>
      {fallbackPage && (
        <button className="button button--primary" type="button" onClick={onGoToFallback}>
          Ir a {fallbackPage}
        </button>
      )}
    </section>
  );
}
