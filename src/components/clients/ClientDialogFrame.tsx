import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

interface ClientDialogFrameProps {
  open: boolean;
  pending?: boolean;
  label: string;
  onClose(): void;
  returnFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
  modal?: boolean;
  className?: string;
  backdrop?: boolean;
}

// One stack owns keyboard and background isolation, including sibling/nested dialogs.
const dialogs: HTMLElement[] = [];
let isolated: { element: HTMLElement; inert: string | null; hidden: string | null }[] = [];
function isolateTop() {
  for (const { element, inert, hidden } of isolated) {
    if (inert === null) element.removeAttribute("inert"); else element.setAttribute("inert", inert);
    if (hidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", hidden);
  }
  isolated = [];
  let current = dialogs[dialogs.length - 1];
  while (current?.parentElement) {
    for (const sibling of current.parentElement.children) {
      if (sibling === current || !(sibling instanceof HTMLElement)) continue;
      isolated.push({ element: sibling, inert: sibling.getAttribute("inert"), hidden: sibling.getAttribute("aria-hidden") });
      sibling.setAttribute("inert", "");
      sibling.setAttribute("aria-hidden", "true");
    }
    current = current.parentElement;
    if (current === document.body) break;
  }
}
function focusable(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled")
      && !element.closest('[hidden], [inert], [aria-hidden="true"]')
      && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden");
}

export function ClientDialogFrame({ open, pending = false, label, onClose, returnFocus, children,
  modal = true, className = "clients-wizard", backdrop = true }: ClientDialogFrameProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ pending, onClose, returnFocus });
  useLayoutEffect(() => { latest.current = { pending, onClose, returnFocus }; });
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !modal || !dialog) return;
    const previous = latest.current.returnFocus?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const above = dialogs.findIndex((existing) => dialog.contains(existing)
      || Number(existing.dataset.clientDialogLayer) > Number(dialog.dataset.clientDialogLayer));
    if (above === -1) dialogs.push(dialog); else dialogs.splice(above, 0, dialog);
    // Focus before aria-hidden to avoid hiding the currently focused trigger.
    if (dialogs[dialogs.length - 1] === dialog) (focusable(dialog)[0] ?? dialog).focus();
    isolateTop();
    const keydown = (event: KeyboardEvent) => {
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!latest.current.pending) latest.current.onClose();
      } else if (event.key === "Tab") {
        const targets = focusable(dialog);
        const index = targets.indexOf(document.activeElement as HTMLElement);
        if (!targets.length || index === -1 || (event.shiftKey ? index === 0 : index === targets.length - 1)) {
          event.preventDefault();
          (targets[event.shiftKey ? targets.length - 1 : 0] ?? dialog).focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (dialogs[dialogs.length - 1] === dialog && !dialog.contains(event.target as Node)) (focusable(dialog)[0] ?? dialog).focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", containFocus, true);
    return () => {
      const wasTop = dialogs[dialogs.length - 1] === dialog;
      dialogs.splice(dialogs.indexOf(dialog), 1);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", containFocus, true);
      isolateTop();
      if (wasTop && previous?.isConnected && !previous.closest('[inert], [aria-hidden="true"]') && !previous.matches(":disabled")) previous.focus();
      const top = dialogs[dialogs.length - 1];
      if (top && !top.contains(document.activeElement)) (focusable(top)[0] ?? top).focus();
    };
  }, [open, modal]);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && dialogs[dialogs.length - 1] === dialog && (!dialog.contains(document.activeElement) || document.activeElement?.matches(":disabled"))) {
      (focusable(dialog)[0] ?? dialog).focus();
    }
  });
  if (!open) return null;
  const content = <div ref={dialogRef} className={className} data-client-dialog-layer={backdrop ? 1 : 0} role={modal ? "dialog" : undefined} aria-modal={modal ? true : undefined} aria-label={modal ? label : undefined} tabIndex={modal ? -1 : undefined}>{children}</div>;
  return backdrop ? <div className="clients-wizard-backdrop">{content}</div> : content;
}
