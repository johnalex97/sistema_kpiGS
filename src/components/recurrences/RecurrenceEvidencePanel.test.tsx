import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceApi } from "../../api/evidences";
import type { Evidence } from "../../models/evidence";
import { RecurrenceEvidencePanel } from "./RecurrenceEvidencePanel";

const evidence: Evidence = {
  id: "evidence-1",
  originalName: "router-frontal.png",
  mimeType: "image/png",
  fileExtension: "png",
  sizeBytes: 1450,
  description: "Indicador apagado",
  accessLevel: "TECHNICIAN",
  uploadedBy: { id: "user-1", displayName: "Ana López" },
  resourceType: "RECURRENCE",
  resourceId: "rec-1",
  checksumSha256: "abc123",
  version: 3,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const emptyEvidencePage = { items: [] as Evidence[], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

function evidenceReader(listRecurrence = vi.fn().mockResolvedValue(emptyEvidencePage)): Pick<EvidenceApi, "listRecurrence"> {
  return { listRecurrence };
}

function props(overrides: Partial<React.ComponentProps<typeof RecurrenceEvidencePanel>> = {}) {
  return {
    recurrenceId: "rec-1",
    recurrenceNumber: "RI-2026-0001",
    canView: true,
    canManage: false,
    evidenceApi: evidenceReader(),
    error: null,
    onUpload: vi.fn(async () => true),
    onDownload: vi.fn(async () => true),
    onArchive: vi.fn(async () => true),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("RecurrenceEvidencePanel", () => {
  it.each([
    ["texto.txt", "text/plain", 32, "JPEG, PNG, WebP o PDF"],
    ["grande.pdf", "application/pdf", 10 * 1024 * 1024 + 1, "10 MiB"],
  ])("rejects invalid evidence %s before upload", async (name, type, size, message) => {
    const user = userEvent.setup({ applyAccept: false });
    const onUpload = vi.fn(async () => true);
    render(<RecurrenceEvidencePanel {...props({ onUpload })} />);
    const file = new File([new Uint8Array(size)], name, { type });
    const input = screen.getByLabelText("Archivo de evidencia");

    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveFocus();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("uploads allowed evidence as TECHNICIAN and only exposes INTERNAL to managers", async () => {
    const user = userEvent.setup();
    const technicianUpload = vi.fn(async () => true);
    const rendered = render(<RecurrenceEvidencePanel {...props({ onUpload: technicianUpload })} />);
    const file = new File(["image"], "router.webp", { type: "image/webp" });

    expect(screen.queryByRole("option", { name: "Interna" })).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Archivo de evidencia"), file);
    await user.type(screen.getByLabelText("Descripción"), "  Indicador sin luz  ");
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));
    expect(technicianUpload).toHaveBeenCalledWith({ file, accessLevel: "TECHNICIAN", description: "Indicador sin luz" });
    expect((screen.getByLabelText("Archivo de evidencia") as HTMLInputElement).files).toHaveLength(0);
    expect(screen.getByLabelText("Archivo de evidencia")).toHaveAttribute("name", "evidenceFile");
    expect(screen.getByLabelText("Acceso")).toHaveAttribute("name", "accessLevel");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("name", "description");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("placeholder", expect.stringMatching(/^Ej\.:/u));
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("autocomplete", "off");

    const managerUpload = vi.fn(async () => true);
    rendered.rerender(<RecurrenceEvidencePanel {...props({ canManage: true, onUpload: managerUpload })} />);
    const managerFile = new File(["pdf"], "diagnostico.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Archivo de evidencia"), managerFile);
    await user.selectOptions(screen.getByLabelText("Acceso"), "INTERNAL");
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));
    expect(managerUpload).toHaveBeenCalledWith({ file: managerFile, accessLevel: "INTERNAL" });
  });

  it("traps focus in the evidence dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<RecurrenceEvidencePanel {...props()} />);

    const fileInput = screen.getByLabelText("Archivo de evidencia");
    const closeButton = screen.getByRole("button", { name: "Cerrar evidencia" });
    const continueButton = screen.getByRole("button", { name: "Continuar sin evidencia" });
    expect(fileInput).toHaveFocus();
    closeButton.focus();
    await user.tab({ shift: true });
    expect(continueButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it("loads and paginates the active evidence list", async () => {
    const listRecurrence = vi.fn()
      .mockResolvedValueOnce({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 2 } })
      .mockResolvedValueOnce({ items: [{ ...evidence, id: "evidence-2", originalName: "diagnostico.pdf", mimeType: "application/pdf", fileExtension: "pdf" }], pagination: { page: 2, pageSize: 20, totalItems: 2, totalPages: 2 } });
    const user = userEvent.setup();
    render(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence) })} />);

    expect(screen.getByRole("status", { name: "Cargando evidencias" })).toBeInTheDocument();
    expect(await screen.findByText("router-frontal.png")).toBeInTheDocument();
    expect(listRecurrence).toHaveBeenNthCalledWith(1, "rec-1", 1, expect.any(AbortSignal));
    await user.click(screen.getByRole("button", { name: "Cargar más evidencias" }));
    expect(await screen.findByText("diagnostico.pdf")).toBeInTheDocument();
    expect(listRecurrence).toHaveBeenNthCalledWith(2, "rec-1", 2, expect.any(AbortSignal));
  });

  it("serializes load-more and archive controls in both directions", async () => {
    const secondPage = deferred<Awaited<ReturnType<EvidenceApi["listRecurrence"]>>>();
    const evidenceTwo: Evidence = { ...evidence, id: "evidence-2", originalName: "diagnostico.pdf", mimeType: "application/pdf", fileExtension: "pdf" };
    const listRecurrence = vi.fn()
      .mockResolvedValueOnce({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 3 } })
      .mockImplementationOnce(() => secondPage.promise);
    const user = userEvent.setup();
    render(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence), canManage: true })} />);

    await screen.findByText("router-frontal.png");
    await user.click(screen.getByRole("button", { name: "Cargar más evidencias" }));
    const archiveTrigger = screen.getByRole("button", { name: "Archivar router-frontal.png" });
    expect(archiveTrigger).toBeDisabled();
    fireEvent.click(archiveTrigger);
    expect(screen.queryByLabelText("Motivo para archivar router-frontal.png")).not.toBeInTheDocument();

    await act(async () => secondPage.resolve({ items: [evidenceTwo], pagination: { page: 2, pageSize: 20, totalItems: 3, totalPages: 3 } }));
    await screen.findByText("diagnostico.pdf");
    await user.click(screen.getByRole("button", { name: "Archivar router-frontal.png" }));
    const loadMore = screen.getByRole("button", { name: "Cargar más evidencias" });
    expect(loadMore).toBeDisabled();
    fireEvent.click(loadMore);
    expect(listRecurrence).toHaveBeenCalledTimes(2);
  });

  it("offers retry after the evidence list fails", async () => {
    const listRecurrence = vi.fn()
      .mockRejectedValueOnce(new Error("red privada"))
      .mockResolvedValueOnce({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    const user = userEvent.setup();
    render(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence) })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible cargar las evidencias");
    await user.click(screen.getByRole("button", { name: "Reintentar evidencias" }));
    expect(await screen.findByText("router-frontal.png")).toBeInTheDocument();
    expect(listRecurrence).toHaveBeenCalledTimes(2);
  });

  it("aborts and clears an in-flight evidence list when view permission is revoked", async () => {
    let resolve!: (value: typeof emptyEvidencePage) => void;
    const listRecurrence = vi.fn((_recurrenceId: string, _page: number, signal?: AbortSignal) => new Promise<typeof emptyEvidencePage>((next) => {
      resolve = next;
      signal?.addEventListener("abort", () => undefined);
    }));
    const rendered = render(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence) })} />);
    await waitFor(() => expect(listRecurrence).toHaveBeenCalledTimes(1));
    const signal = listRecurrence.mock.calls[0]?.[2] as AbortSignal;

    rendered.rerender(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence), canView: false })} />);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("router-frontal.png")).not.toBeInTheDocument();
    await act(async () => resolve(emptyEvidencePage));
    expect(screen.queryByText("router-frontal.png")).not.toBeInTheDocument();
  });

  it("keeps the case and selected file pending after failure so upload can be retried", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<RecurrenceEvidencePanel {...props({ error: "No fue posible subir la evidencia.", onUpload })} />);
    const file = new File(["pdf"], "visita.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("Archivo de evidencia"), file);
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));

    expect(screen.getByRole("status", { name: "Evidencia pendiente" })).toHaveTextContent("Caso creado · evidencia pendiente");
    expect(screen.getByRole("alert")).toHaveTextContent("No fue posible subir la evidencia");
    expect((screen.getByLabelText("Archivo de evidencia") as HTMLInputElement).files?.[0]).toBe(file);
    await user.click(screen.getByRole("button", { name: "Reintentar evidencia" }));
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it("downloads visible evidence and archives it with a trimmed reason", async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn(async () => true);
    const onArchive = vi.fn(async () => true);
    const listRecurrence = vi.fn()
      .mockResolvedValueOnce({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })
      .mockResolvedValueOnce(emptyEvidencePage);
    render(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence), canManage: true, onDownload, onArchive })} />);

    await user.click(await screen.findByRole("button", { name: "Descargar router-frontal.png" }));
    expect(onDownload).toHaveBeenCalledWith(evidence);
    await user.click(screen.getByRole("button", { name: "Archivar router-frontal.png" }));
    const reason = screen.getByLabelText("Motivo para archivar router-frontal.png");
    expect(reason).toHaveAttribute("name", "archiveReason");
    expect(reason).toHaveAttribute("placeholder", expect.stringMatching(/^Ej\.:/u));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el motivo");
    expect(reason).toHaveFocus();
    await user.type(reason, "  Documento reemplazado  ");
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(onArchive).toHaveBeenCalledWith(evidence, "Documento reemplazado");
    await waitFor(() => expect(screen.queryByLabelText("Motivo para archivar router-frontal.png")).not.toBeInTheDocument());
    expect(screen.getByRole("status", { name: "Sin evidencias activas" })).toBeInTheDocument();
    expect(listRecurrence).toHaveBeenNthCalledWith(2, "rec-1", 1, expect.any(AbortSignal));
    expect(screen.getByLabelText("Archivo de evidencia")).toHaveFocus();
  });

  it("refreshes page 1 after archiving every loaded item while server pages remain", async () => {
    const user = userEvent.setup();
    const evidenceTwo: Evidence = { ...evidence, id: "evidence-2", originalName: "diagnostico.pdf", mimeType: "application/pdf", fileExtension: "pdf" };
    const listRecurrence = vi.fn()
      .mockResolvedValueOnce({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 2 } })
      .mockResolvedValueOnce({ items: [evidenceTwo], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    render(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence), canManage: true })} />);

    await user.click(await screen.findByRole("button", { name: "Archivar router-frontal.png" }));
    await user.type(screen.getByLabelText("Motivo para archivar router-frontal.png"), "Documento reemplazado");
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(await screen.findByText("diagnostico.pdf")).toBeInTheDocument();
    expect(screen.queryByText("router-frontal.png")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Sin evidencias activas" })).not.toBeInTheDocument();
    expect(listRecurrence).toHaveBeenNthCalledWith(2, "rec-1", 1, expect.any(AbortSignal));
  });

  it("preserves the retired evidence snapshot through failed retries until page 1 succeeds", async () => {
    const user = userEvent.setup();
    const evidenceTwo: Evidence = { ...evidence, id: "evidence-2", originalName: "diagnostico.pdf", mimeType: "application/pdf", fileExtension: "pdf" };
    const evidenceThree: Evidence = { ...evidence, id: "evidence-3", originalName: "router-nuevo.png" };
    const failedRetry = deferred<Awaited<ReturnType<EvidenceApi["listRecurrence"]>>>();
    const successfulRetry = deferred<Awaited<ReturnType<EvidenceApi["listRecurrence"]>>>();
    const listRecurrence = vi.fn()
      .mockResolvedValueOnce({ items: [evidence, evidenceTwo], pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 2 } })
      .mockRejectedValueOnce(new Error("red privada"))
      .mockImplementationOnce(() => failedRetry.promise)
      .mockImplementationOnce(() => successfulRetry.promise);
    render(<RecurrenceEvidencePanel {...props({ evidenceApi: evidenceReader(listRecurrence), canManage: true })} />);

    await user.click(await screen.findByRole("button", { name: "Archivar router-frontal.png" }));
    await user.type(screen.getByLabelText("Motivo para archivar router-frontal.png"), "Documento reemplazado");
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible cargar las evidencias");
    expect(screen.queryByText("router-frontal.png")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar router-frontal.png" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar router-frontal.png" })).not.toBeInTheDocument();
    expect(screen.getByText("diagnostico.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("Archivo de evidencia")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Reintentar evidencias" }));
    await act(async () => failedRetry.reject(new Error("red privada otra vez")));
    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible cargar las evidencias");
    expect(screen.getByText("diagnostico.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar diagnostico.pdf" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cargar más evidencias" })).toBeEnabled();
    expect(screen.queryByText("router-frontal.png")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar router-frontal.png" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar router-frontal.png" })).not.toBeInTheDocument();
    expect(listRecurrence).toHaveBeenNthCalledWith(3, "rec-1", 1, expect.any(AbortSignal));

    await user.click(screen.getByRole("button", { name: "Reintentar evidencias" }));
    expect(screen.getByText("diagnostico.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar diagnostico.pdf" })).toBeDisabled();
    expect(screen.queryByText("router-frontal.png")).not.toBeInTheDocument();
    await act(async () => successfulRetry.resolve({ items: [evidenceThree], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    expect(await screen.findByText("router-nuevo.png")).toBeInTheDocument();
    expect(screen.queryByText("diagnostico.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("router-frontal.png")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar más evidencias" })).not.toBeInTheDocument();
    expect(listRecurrence).toHaveBeenNthCalledWith(4, "rec-1", 1, expect.any(AbortSignal));
  });

  it("returns focus to the archive trigger after cancel or Escape", async () => {
    const reader = evidenceReader(vi.fn().mockResolvedValue({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    const user = userEvent.setup();
    render(<RecurrenceEvidencePanel {...props({ evidenceApi: reader, canManage: true })} />);
    const trigger = await screen.findByRole("button", { name: "Archivar router-frontal.png" });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancelar archivo" }));
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("does not render evidence operations after permissions are revoked", async () => {
    const reader = evidenceReader(vi.fn().mockResolvedValue({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    const rendered = render(<RecurrenceEvidencePanel {...props({ evidenceApi: reader, canManage: true })} />);
    expect(await screen.findByRole("button", { name: "Descargar router-frontal.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivar router-frontal.png" })).toBeInTheDocument();

    rendered.rerender(<RecurrenceEvidencePanel {...props({ evidenceApi: reader, canView: false, canManage: false })} />);
    expect(screen.queryByRole("button", { name: "Descargar router-frontal.png" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar router-frontal.png" })).not.toBeInTheDocument();
  });

  it("clears manager-only form state when manage permission is revoked", async () => {
    const reader = evidenceReader(vi.fn().mockResolvedValue({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    const rendered = render(<RecurrenceEvidencePanel {...props({ evidenceApi: reader, canManage: true })} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Acceso"), "INTERNAL");
    await user.click(await screen.findByRole("button", { name: "Archivar router-frontal.png" }));
    await user.type(screen.getByLabelText("Motivo para archivar router-frontal.png"), "Motivo temporal");

    rendered.rerender(<RecurrenceEvidencePanel {...props({ evidenceApi: reader, canManage: false })} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText("Archivo de evidencia")).toHaveFocus();
    rendered.rerender(<RecurrenceEvidencePanel {...props({ evidenceApi: reader, canManage: true })} />);

    expect(screen.queryByLabelText("Motivo para archivar router-frontal.png")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Acceso")).toHaveValue("TECHNICIAN");
  });
});
