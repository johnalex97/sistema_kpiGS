import { type FormEvent, useState } from "react";
import { ApiClientError } from "../../api/http";
import type { ChangePasswordInput } from "../../models/auth";
import { PasswordField } from "./PasswordField";

const passwordMessages: Record<string, string> = {
  PASSWORD_TOO_SHORT: "La nueva contraseña debe tener al menos 12 caracteres.",
  PASSWORD_TOO_LONG: "La nueva contraseña no puede tener más de 128 caracteres.",
  PASSWORD_UPPERCASE_REQUIRED: "Incluye al menos una letra mayúscula.",
  PASSWORD_LOWERCASE_REQUIRED: "Incluye al menos una letra minúscula.",
  PASSWORD_NUMBER_REQUIRED: "Incluye al menos un número.",
  PASSWORD_SPECIAL_REQUIRED: "Incluye al menos un carácter especial.",
};

function passwordPolicyCode(error: ApiClientError) {
  const newPasswordError = error.fieldErrors.find((fieldError) => fieldError.field === "newPassword");
  return [newPasswordError?.code, newPasswordError?.message, error.code]
    .find((code) => Boolean(code && passwordMessages[code]));
}

interface PasswordChangeFormProps {
  mode: "forced" | "voluntary";
  onSubmit(input: ChangePasswordInput): Promise<void>;
  onCancel?(): void;
}

export function PasswordChangeForm({ mode, onSubmit, onCancel }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"current" | "new" | "confirmation">("new");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (newPassword !== confirmation) {
      setErrorField("confirmation");
      setError("Las contraseñas no coinciden");
      return;
    }

    setError("");
    setPending(true);
    try {
      await onSubmit({ currentPassword, newPassword });
    } catch (reason) {
      const policyCode = reason instanceof ApiClientError ? passwordPolicyCode(reason) : undefined;
      if (policyCode) {
        setErrorField("new");
        setError(passwordMessages[policyCode]);
      } else if (reason instanceof ApiClientError && reason.code === "INVALID_CREDENTIALS") {
        setErrorField("current");
        setError("La contraseña actual no es correcta.");
      } else {
        setErrorField("new");
        setError("No fue posible actualizar la contraseña. Intenta nuevamente.");
      }
    } finally {
      setPending(false);
    }
  };

  const errorId = error ? `${errorField}-password-error` : undefined;

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="auth-form__field">
        <label htmlFor="current-password">Contraseña actual</label>
        <PasswordField
          id="current-password"
          name="currentPassword"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          aria-invalid={errorField === "current" && Boolean(error)}
          aria-describedby={errorField === "current" ? errorId : undefined}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="auth-form__field">
        <label htmlFor="new-password">Nueva contraseña</label>
        <PasswordField
          id="new-password"
          name="newPassword"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-invalid={errorField === "new" && Boolean(error)}
          aria-describedby={errorField === "new" ? errorId : undefined}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="auth-form__field">
        <label htmlFor="confirmation-password">Confirmar contraseña</label>
        <PasswordField
          id="confirmation-password"
          name="confirmationPassword"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={errorField === "confirmation" && Boolean(error)}
          aria-describedby={errorField === "confirmation" ? errorId : undefined}
          autoComplete="new-password"
          required
        />
      </div>
      {mode === "forced" && (
        <aside className="auth-password-rules" aria-label="Reglas de contraseña">
          <strong>Tu nueva contraseña necesita:</strong>
          <ul>
            <li>Al menos 12 caracteres</li><li>Una mayúscula y una minúscula</li>
            <li>Un número y un carácter especial</li>
          </ul>
        </aside>
      )}
      {error && <p className="auth-form__error" id={errorId} role="alert">{error}</p>}
      <div className="auth-form__actions">
        {onCancel && <button className="button button--ghost" type="button" onClick={onCancel} disabled={pending}>Cancelar</button>}
        <button className="button button--primary" type="submit" disabled={pending} aria-describedby="password-submit-status">
          {pending ? "Actualizando contraseña…" : "Actualizar contraseña"}
        </button>
      </div>
      <p className="sr-only" id="password-submit-status" role="status">{pending ? "Actualizando contraseña" : ""}</p>
    </form>
  );
}
