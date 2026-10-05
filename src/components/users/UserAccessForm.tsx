import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { usersApi } from "../../api/users";
import type { UserAccount } from "../../models/user-account";
import { PasswordField } from "../auth/PasswordField";

export type AccessAction = "activate" | "deactivate" | "unlock" | "reset-password";
const labels: Record<AccessAction, { title: string; confirm: string; help: string; success: string }> = {
  activate: { title: "Activar cuenta", confirm: "Confirmar activación", help: "Podrá iniciar sesión con su contraseña vigente. El bloqueo por intentos fallidos, si existe, se administra por separado.", success: "Cuenta activada" },
  deactivate: { title: "Desactivar cuenta", confirm: "Confirmar desactivación", help: "No podrá iniciar sesión y se cerrarán sus sesiones abiertas. Su perfil laboral y su historial se conservarán.", success: "Cuenta desactivada" },
  unlock: { title: "Desbloquear cuenta", confirm: "Confirmar desbloqueo", help: "Se eliminará el bloqueo temporal y se reiniciarán los intentos fallidos. Esto no cambia la contraseña ni activa una cuenta inactiva.", success: "Intentos fallidos restablecidos" },
  "reset-password": { title: "Restablecer contraseña", confirm: "Confirmar restablecimiento", help: "Se cerrarán sus sesiones y deberá cambiar la contraseña temporal al ingresar. Comparte la contraseña por un canal privado. Esto no activa ni desbloquea la cuenta.", success: "Contraseña restablecida" },
};

export function UserAccessForm({ account, action, onCancel, onSaved, onSavingChange }: {
  account: UserAccount; action: AccessAction; onCancel: () => void;
  onSaved: (message: string) => void; onSavingChange: (saving: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const copy = labels[action];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError(null);
    if (action === "reset-password") {
      if (password !== confirmation) { setError("Las contraseñas no coinciden"); return; }
      if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        setError("Usa de 12 a 128 caracteres con mayúsculas, minúsculas, números y símbolos"); return;
      }
    }
    pending.current = true; setSaving(true); onSavingChange(true);
    try {
      if (action === "reset-password") await usersApi.resetPassword(account.id, password, account.version);
      else if (action === "unlock") await usersApi.unlock(account.id, account.version);
      else await usersApi.changeStatus(account.id, action === "activate" ? "ACTIVE" : "INACTIVE", account.version);
      setPassword(""); setConfirmation("");
      onSaved(`${copy.success} para ${account.displayName}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No fue posible actualizar el acceso");
    } finally {
      pending.current = false; setSaving(false); onSavingChange(false);
    }
  }

  return <form className="users-form users-access-form" aria-labelledby="users-access-heading" onSubmit={event => void submit(event)}>
    <div className="users-form-intro"><ShieldCheck size={23} aria-hidden="true" /><div>
      <h3 id="users-access-heading" tabIndex={-1} ref={heading}>{copy.title}: {account.displayName}</h3>
      <p>{account.email}</p>
    </div></div>
    <p className="users-help">{copy.help} El cambio quedará auditado.</p>
    {action === "reset-password" && <fieldset disabled={saving}>
      <div className="users-fields">
        <label htmlFor="reset-account-password">Contraseña temporal<PasswordField id="reset-account-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="reset-password-help" /></label>
        <label htmlFor="reset-account-confirmation">Confirmar contraseña<PasswordField id="reset-account-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      </div>
      <p id="reset-password-help" className="users-help">De 12 a 128 caracteres, con mayúsculas, minúsculas, números y símbolos.</p>
    </fieldset>}
    {error && <p className="users-error" role="alert">{error}. Si la cuenta cambió, cancela, actualiza el listado y abre nuevamente esta acción.</p>}
    <div className="users-actions">
      <button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}>Cancelar</button>
      <button className={`button ${action === "deactivate" ? "users-button--danger" : "button--primary"}`} type="submit" disabled={saving}>{saving ? "Guardando…" : copy.confirm}</button>
    </div>
  </form>;
}
