import { type InputHTMLAttributes, useState } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";

  return (
    <div className="password-field">
      <input {...props} type={visible ? "text" : "password"} />
      <button type="button" aria-label={label} onClick={() => setVisible((current) => !current)}>
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
