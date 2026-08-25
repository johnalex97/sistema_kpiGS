import type { PropsWithChildren } from "react";

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <main className="auth-layout">
      <section className="auth-layout__status" aria-label="Estado del centro de control">
        <div className="auth-layout__brand">
          <span className="auth-layout__mark" aria-hidden="true">GS</span>
          <div><strong>Geek Solution</strong><small>SERVICE CONTROL</small></div>
        </div>
        <div className="auth-layout__signal" aria-hidden="true">
          <span>SESIÓN SEGURA</span>
          <i /><i /><i />
        </div>
        <div className="auth-layout__pulse" aria-hidden="true"><i /></div>
        <p>Control operativo para equipos técnicos en campo.</p>
      </section>
      <section className="auth-layout__surface">
        <div className="auth-layout__card">{children}</div>
      </section>
    </main>
  );
}
