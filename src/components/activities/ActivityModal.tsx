import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { technicians } from "../../mocks/data";

interface ActivityModalProps {
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ActivityModal({ onClose, onSave }: ActivityModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstInput = dialogRef.current?.querySelector<HTMLInputElement>("input");
    firstInput?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    if (!String(data.get("title")).trim() || !String(data.get("client")).trim()) {
      event.preventDefault();
      setError("Completa el trabajo realizado y el cliente.");
      return;
    }
    setError("");
    onSave(event);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        onKeyDown={trapFocus}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Registro diario</p>
            <h2 id="modal-title">Nueva actividad</h2>
            <span id="modal-description">Agrega el trabajo realizado por un técnico.</span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <label className="field field--wide">
            <span>Trabajo realizado</span>
            <input name="title" required placeholder="Ej. Instalación de cámara IP" />
          </label>
          <label className="field">
            <span>Cliente</span>
            <input name="client" required placeholder="Nombre del cliente" />
          </label>
          <label className="field">
            <span>Tipo de actividad</span>
            <select name="type">
              <option>Soporte</option>
              <option>Instalación</option>
              <option>Entrega</option>
            </select>
          </label>
          <label className="field">
            <span>Técnico responsable</span>
            <select name="tech">
              {technicians.map((tech) => <option key={tech.id}>{tech.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Duración</span>
            <input name="duration" placeholder="Ej. 1h 30m" />
          </label>
          <label className="check-field field--wide">
            <input type="checkbox" name="repeated" />
            <span>
              <b>Este trabajo es una reincidencia</b>
              <small>Se vinculará con las visitas anteriores para medir su impacto.</small>
            </span>
          </label>
          {error && <p className="form-error field--wide" role="alert">{error}</p>}
          <div className="modal-actions field--wide">
            <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
            <button className="button button--primary" type="submit">Guardar actividad</button>
          </div>
        </form>
      </div>
    </div>
  );
}
