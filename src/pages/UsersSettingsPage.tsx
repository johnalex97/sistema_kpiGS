import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, ShieldCheck, UserPlus } from "lucide-react";
import { usersApi } from "../api/users";
import { useAuth } from "../auth/useAuth";
import { PasswordField } from "../components/auth/PasswordField";
import type { UserAccount, UserAccountPage, UserRole } from "../models/user-account";
import "../components/users/users.css";

const roleLabels: Record<string, string> = { ADMIN: "Administrador", SUPERVISOR: "Supervisor", TECHNICIAN: "Técnico" };
const statusLabels: Record<string, string> = { ACTIVE: "Activa", PENDING: "Pendiente", INACTIVE: "Inactiva", BLOCKED: "Bloqueada" };

export function UsersSettingsPage() {
  const { hasPermission, user } = useAuth();
  const allowed = hasPermission("USERS_MANAGE");
  const canChangeRoles = allowed && user?.roles.includes("ADMIN");
  const [listState, setListState] = useState<{ key: string; data: UserAccountPage | null; error: string | null }>({ key: "", data: null, error: null });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const requestKey = JSON.stringify([query, page, revision]);
  const loading = allowed && listState.key !== requestKey;
  const data = listState.data;
  const listError = loading ? null : listState.error;
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [newRole, setNewRole] = useState<UserRole>("TECHNICIAN");
  const [roleSaving, setRoleSaving] = useState(false);
  const roleSavingRef = useRef(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  async function saveRole(event: FormEvent) {
    event.preventDefault();
    if (!editing || !canChangeRoles || roleSavingRef.current) return;
    roleSavingRef.current = true;
    setRoleSaving(true); setRoleError(null);
    try {
      await usersApi.changeRole(editing.id, newRole, editing.version);
      setNotice(`Rol actualizado para ${editing.displayName}. Deberá iniciar sesión nuevamente.`);
      setEditing(null); setRevision(value => value + 1);
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : "No fue posible cambiar el rol");
      setRevision(value => value + 1);
    } finally {
      roleSavingRef.current = false; setRoleSaving(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void usersApi.list(query, page, controller.signal).then(result => {
      if (!controller.signal.aborted) setListState({ key: requestKey, data: result, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setListState(current => ({ key: requestKey, data: current.data, error: error instanceof Error ? error.message : "No fue posible consultar los usuarios" }));
    });
    return () => controller.abort();
  }, [allowed, query, page, requestKey]);

  function clearForm() {
    setDisplayName(""); setEmail(""); setPassword(""); setConfirmation(""); setFormError(null);
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);
    if (password !== confirmation) { setFormError("Las contraseñas no coinciden"); return; }
    if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setFormError("Usa de 12 a 128 caracteres con mayúsculas, minúsculas, números y símbolos"); return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const created = await usersApi.create({ displayName: displayName.trim(), email: email.trim().toLowerCase(), temporaryPassword: password });
      clearForm(); setOpen(false);
      setNotice(`Cuenta creada para ${created.displayName}. Ahora vincúlala en el perfil del técnico, en Acceso al sistema.`);
      setSearch(""); setQuery(""); setPage(1); setRevision(value => value + 1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No fue posible crear la cuenta");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!allowed) return <p>No tienes permiso para administrar usuarios.</p>;

  return <section className="users-workspace" aria-labelledby="users-heading">
    <header className="users-header">
      <div><p className="eyebrow">Acceso del equipo</p><h2 id="users-heading">Usuarios</h2><p>Crea las cuentas con las que tus técnicos registran su jornada.</p></div>
      <button className="button button--primary" type="button" disabled={open || roleSaving} onClick={() => { clearForm(); setEditing(null); setNotice(null); setOpen(true); }}><UserPlus size={17} aria-hidden="true" />Nuevo usuario</button>
    </header>
    {notice && <p className="users-notice" role="status">{notice}</p>}
    {editing && canChangeRoles && <form className="users-form" aria-labelledby="users-role-heading" onSubmit={event => void saveRole(event)}>
      <div className="users-form-intro"><ShieldCheck size={23} aria-hidden="true" /><div><h3 id="users-role-heading">Cambiar rol de {editing.displayName}</h3><p>{editing.email} · Rol actual: {editing.roles.map(role => roleLabels[role] ?? role).join(", ") || "Sin rol"}</p></div></div>
      <fieldset disabled={roleSaving}>
        <div className="users-fields"><label htmlFor="account-role">Nuevo rol<select id="account-role" value={newRole} onChange={event => setNewRole(event.target.value as UserRole)} autoFocus><option value="TECHNICIAN">Técnico</option><option value="SUPERVISOR">Supervisor</option><option value="ADMIN">Administrador</option></select></label></div>
        <p className="users-help">Se cerrarán las sesiones de esta cuenta al cambiar el rol. Se conservarán su contraseña, historial y perfil laboral. El cambio quedará auditado.</p>
      </fieldset>
      {roleError && <p className="users-error" role="alert">{roleError}. Si la cuenta cambió, cancela y vuelve a abrir el editor desde el listado actualizado.</p>}
      <div className="users-actions"><button className="button button--secondary" type="button" disabled={roleSaving} onClick={() => { setEditing(null); setRoleError(null); }}>Cancelar</button><button className="button button--primary" type="submit" disabled={roleSaving || (editing.roles.length === 1 && editing.roles[0] === newRole)}>{roleSaving ? "Guardando rol…" : "Guardar rol"}</button></div>
    </form>}
    {open && <form className="users-form" aria-labelledby="users-form-heading" onSubmit={event => void createAccount(event)}>
      <div className="users-form-intro"><ShieldCheck size={23} aria-hidden="true" /><div><h3 id="users-form-heading">Crear cuenta de técnico</h3><p>El técnico cambiará la contraseña temporal en su primer acceso.</p></div></div>
      <fieldset disabled={saving}>
        <div className="users-fields">
          <label htmlFor="account-name">Nombre completo<input id="account-name" value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} maxLength={160} autoComplete="off" autoFocus /></label>
          <label htmlFor="account-email">Correo de acceso<input id="account-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} autoComplete="off" /></label>
          <label htmlFor="account-password">Contraseña temporal<PasswordField id="account-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="account-password-help" /></label>
          <label htmlFor="account-confirmation">Confirmar contraseña<PasswordField id="account-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        </div>
        <p id="account-password-help" className="users-help">De 12 a 128 caracteres, con mayúsculas, minúsculas, números y símbolos. Rol asignado: Técnico.</p>
      </fieldset>
      {formError && <p className="users-error" role="alert">{formError}</p>}
      <div className="users-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={() => { clearForm(); setOpen(false); }}>Cancelar</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? "Creando cuenta…" : "Crear cuenta"}</button></div>
    </form>}
    <form className="users-search" onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); setRevision(value => value + 1); }}>
      <label htmlFor="users-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar usuarios por nombre o correo</span><input id="users-search" placeholder="Buscar por nombre o correo" value={search} maxLength={160} onChange={event => setSearch(event.target.value)} /></label>
      <button className="button button--secondary" type="submit" disabled={loading}>Buscar</button>
      <button className="button button--secondary" type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>Actualizar</button>
    </form>
    {listError && <div className="users-error" role="alert">{listError} <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></div>}
    {loading && <p className="users-help">Consultando usuarios…</p>}
    {!listError && data && <>
      <div className="users-table-wrap" aria-busy={loading}><table className="users-table"><caption className="sr-only">Cuentas de acceso al sistema</caption><thead><tr><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Perfil del técnico</th><th scope="col">Primer acceso</th>{canChangeRoles && <th scope="col">Acciones</th>}</tr></thead><tbody>
        {data.items.map(account => <tr key={account.id}><td><strong>{account.displayName}</strong><span>{account.email}</span></td><td>{account.roles.map(role => roleLabels[role] ?? role).join(", ") || "Sin rol"}</td><td><span className={`users-badge ${account.status === "ACTIVE" ? "is-active" : ""}`}>{statusLabels[account.status] ?? account.status}</span></td><td>{account.tecnico?.fullName ?? (account.roles.includes("TECHNICIAN") ? "Sin vincular" : "No aplica")}</td><td>{account.mustChangePassword ? "Cambio de contraseña pendiente" : "Contraseña actualizada"}</td>{canChangeRoles && <td>{account.id === user?.id ? "Tu cuenta" : <button className="button button--secondary" type="button" aria-label={`Cambiar rol de ${account.displayName}`} disabled={loading || saving || roleSaving} onClick={() => { clearForm(); setOpen(false); setNotice(null); setRoleError(null); setEditing(account); setNewRole(account.roles.length === 1 && ["ADMIN", "SUPERVISOR", "TECHNICIAN"].includes(account.roles[0]) ? account.roles[0] as UserRole : "TECHNICIAN"); }}>Cambiar rol</button>}</td>}</tr>)}
      </tbody></table></div>
      {data.items.length === 0 && <p className="users-empty">No hay usuarios para esta búsqueda. Puedes crear una cuenta con Nuevo usuario.</p>}
      <footer className="users-pagination"><span>{data.pagination.totalItems} cuentas · Página {page} de {Math.max(1, data.pagination.totalPages)}</span><div><button type="button" className="button button--secondary" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" className="button button--secondary" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Siguiente</button></div></footer>
    </>}
    <p className="users-link-help">Crear una cuenta permite iniciar sesión. Para asociarla al trabajo diario, ve a Técnicos, edita su perfil y selecciónala en Acceso al sistema → Usuario vinculado.</p>
  </section>;
}
