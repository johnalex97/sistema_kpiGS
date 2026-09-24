import { useEffect, useRef, type RefObject } from "react";

const dialogs: HTMLElement[] = [];
const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/** Un único ámbito activo: el diálogo más reciente conserva el teclado y el foco. */
export function useOrderDialogFocus(ref: RefObject<HTMLElement>, active: boolean, pending: boolean, onClose: () => void, fallbackRef?: RefObject<HTMLElement>) {
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);
  useEffect(() => { closeRef.current = onClose; pendingRef.current = pending; }, [onClose, pending]);
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const fallback = fallbackRef?.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const hidden: Array<{ node: HTMLElement; inert: boolean; aria: string | null }> = [];
    let ancestor: HTMLElement = panel;
    while (ancestor.parentElement && ancestor !== document.body) {
      for (const sibling of ancestor.parentElement.children) {
        if (!(sibling instanceof HTMLElement) || sibling === ancestor) continue;
        hidden.push({ node: sibling, inert: sibling.hasAttribute("inert"), aria: sibling.getAttribute("aria-hidden") });
        sibling.setAttribute("inert", ""); sibling.setAttribute("aria-hidden", "true");
      }
      ancestor = ancestor.parentElement;
    }
    dialogs.push(panel);
    const focusables = () => [...panel.querySelectorAll<HTMLElement>(selector)].filter((node) => !node.closest('[inert], [hidden], [aria-hidden="true"]'));
    const focusFirst = () => (focusables()[0] ?? panel).focus();
    focusFirst();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === "Escape") { event.stopPropagation(); if (!pendingRef.current) closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0]; const last = items[items.length - 1];
      if (!first || !panel.contains(document.activeElement) || document.activeElement === panel) {
        event.preventDefault(); (event.shiftKey ? last ?? panel : first ?? panel).focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const focusin = () => { if (dialogs[dialogs.length - 1] === panel && !panel.contains(document.activeElement)) focusFirst(); };
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusin);
    return () => {
      dialogs.splice(dialogs.indexOf(panel), 1);
      document.removeEventListener("keydown", keydown); document.removeEventListener("focusin", focusin);
      for (const item of hidden) {
        if (!item.inert) item.node.removeAttribute("inert");
        if (item.aria === null) item.node.removeAttribute("aria-hidden"); else item.node.setAttribute("aria-hidden", item.aria);
      }
      if (previous?.isConnected && !previous.closest("[inert]") && !previous.matches(":disabled")) previous.focus();
      else (fallback?.isConnected ? fallback : document.querySelector<HTMLElement>('[aria-label="Cerrar detalle"], .orders-toolbar button'))?.focus();
    };
  }, [active, fallbackRef, ref]);
  useEffect(() => { if (active && pending) ref.current?.focus(); }, [active, pending, ref]);
}
