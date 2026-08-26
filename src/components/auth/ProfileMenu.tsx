import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useAuth } from "../../auth/useAuth";
import { Avatar } from "../common/Avatar";
import { PasswordChangeForm } from "./PasswordChangeForm";

const roleNames: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Técnico",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function roleName(role: string | undefined) {
  return role ? (roleNames[role] ?? role) : "Usuario";
}

export function ProfileMenu() {
  const { user, changePassword, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!passwordOpen) return;
    const trigger = triggerRef.current;
    const firstInput = dialogRef.current?.querySelector<HTMLInputElement>("input");
    firstInput?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPasswordOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [passwordOpen]);

  if (!user) return null;

  const closePasswordDialog = () => setPasswordOpen(false);
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab" && dialogRef.current) {
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div className="profile-menu">
      <button
        ref={triggerRef}
        className="profile"
        type="button"
        aria-label="Abrir perfil"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar initials={initials(user.displayName)} color="#173b5f" small />
        <span>{user.displayName}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="profile-menu__panel" role="group" aria-label="Perfil de usuario">
          <p><strong>{user.displayName}</strong><span>{roleName(user.roles[0])}</span></p>
          <button type="button" onClick={() => { setOpen(false); setPasswordOpen(true); }}>
            Cambiar contraseña
          </button>
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      )}
      {passwordOpen && (
        <div className="profile-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePasswordDialog()}>
          <div ref={dialogRef} className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-password-title" onKeyDown={handleDialogKeyDown}>
            <div className="profile-dialog__head">
              <div><p className="eyebrow">SEGURIDAD DE CUENTA</p><h2 id="profile-password-title">Cambiar contraseña</h2></div>
              <button className="icon-button" type="button" onClick={closePasswordDialog} aria-label="Cerrar"><X size={19} /></button>
            </div>
            <PasswordChangeForm mode="voluntary" onSubmit={async (input) => { await changePassword(input); closePasswordDialog(); }} onCancel={closePasswordDialog} />
          </div>
        </div>
      )}
    </div>
  );
}
