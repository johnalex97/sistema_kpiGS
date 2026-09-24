import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrderEvidenceApi } from "../../api/evidences";
import type { Evidence } from "../../models/evidence";
import { OrderEvidencePanel } from "./OrderEvidencePanel";
import { ApiClientError } from "../../api/http";

const evidence: Evidence = { id: "e-1", originalName: "foto.png", mimeType: "image/png", fileExtension: "png", sizeBytes: 100, description: null, accessLevel: "TECHNICIAN", uploadedBy: { id: "u-1", displayName: "Ana" }, resourceType: "ORDER", resourceId: "order-1", checksumSha256: "private", version: 1, createdAt: "2026-09-16T12:00:00Z", updatedAt: "2026-09-16T12:00:00Z" };
const page = { items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };
const reader = (listOrder = vi.fn().mockResolvedValue(page)): Pick<OrderEvidenceApi, "listOrder"> => ({ listOrder });
const props = (overrides: Partial<React.ComponentProps<typeof OrderEvidencePanel>> = {}) => ({ orderId: "order-1", orderNumber: "OT-1", evidenceApi: reader(), canView: true, canUpload: true, canManage: false, onUpload: vi.fn(async () => true), onDownload: vi.fn(async () => true), onArchive: vi.fn(async () => true), onClose: vi.fn(), ...overrides });

describe("OrderEvidencePanel", () => {
  it.each([403, 404])("borra nombres y descargas tras %s sin retirar carga independiente", async (status) => {
    const listOrder = vi.fn().mockResolvedValueOnce({ items: [{ ...evidence, originalName: "private.pdf" }], pagination: { ...page.pagination, totalPages: 2 } }).mockRejectedValueOnce(new ApiClientError(status, "FORBIDDEN", "No disponible"));
    const invalidated = vi.fn();
    render(<OrderEvidencePanel {...props({ evidenceApi: reader(listOrder) })} onReadInvalidated={invalidated} />);
    expect(await screen.findByText("private.pdf")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cargar más evidencias" }));
    await waitFor(() => expect(screen.queryByText("private.pdf")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Descargar private.pdf" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir evidencia" })).toBeInTheDocument();
    expect(invalidated).toHaveBeenCalledWith(status);
  });
  it("loads order evidence when the area is activated", async () => {
    const listOrder = vi.fn().mockResolvedValue(page);
    render(<OrderEvidencePanel {...props({ evidenceApi: reader(listOrder) })} />);
    expect(screen.getByRole("status", { name: "Cargando evidencias" })).toBeInTheDocument();
    expect(await screen.findByText("foto.png")).toBeInTheDocument();
    expect(listOrder).toHaveBeenCalledWith("order-1", 1, expect.any(AbortSignal));
  });
  it("rejects unsupported files before upload", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onUpload = vi.fn(async () => true);
    render(<OrderEvidencePanel {...props({ onUpload })} />);
    await user.upload(screen.getByLabelText("Archivo de evidencia"), new File(["x"], "script.exe", { type: "application/octet-stream" }));
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG, WebP o PDF");
    expect(onUpload).not.toHaveBeenCalled();
  });
  it("keeps permissions independent and paginates evidence", async () => {
    const second = { ...evidence, id: "e-2", originalName: "informe.pdf", mimeType: "application/pdf" as const, fileExtension: "pdf" as const };
    const listOrder = vi.fn().mockResolvedValueOnce({ ...page, pagination: { ...page.pagination, totalItems: 2, totalPages: 2 } }).mockResolvedValueOnce({ items: [second], pagination: { page: 2, pageSize: 20, totalItems: 2, totalPages: 2 } });
    const user = userEvent.setup();
    render(<OrderEvidencePanel {...props({ evidenceApi: reader(listOrder), canUpload: false })} />);
    expect(screen.queryByLabelText("Archivo de evidencia")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Cargar/ }));
    expect(await screen.findByText("informe.pdf")).toBeInTheDocument();
    expect(listOrder).toHaveBeenNthCalledWith(2, "order-1", 2, expect.any(AbortSignal));
  });
  it("aborts and clears evidence when view permission is lost", async () => {
    let resolve!: (value: typeof page) => void;
    const listOrder = vi.fn((_id: string, _page: number, signal?: AbortSignal) => new Promise<typeof page>((next) => { resolve = next; signal?.addEventListener("abort", () => undefined); }));
    const view = render(<OrderEvidencePanel {...props({ evidenceApi: reader(listOrder) })} />);
    await waitFor(() => expect(listOrder).toHaveBeenCalledOnce());
    const signal = listOrder.mock.calls[0]?.[2] as AbortSignal;
    view.rerender(<OrderEvidencePanel {...props({ evidenceApi: reader(listOrder), canView: false, canUpload: false })} />);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("foto.png")).not.toBeInTheDocument();
    resolve(page);
  });

  it("refreshes after an upload even when the initial list request is active", async () => {
    let resolveInitial!: (value: typeof page) => void;
    let resolveRefresh!: (value: typeof page) => void;
    const listOrder = vi.fn()
      .mockImplementationOnce(() => new Promise<typeof page>((resolve) => { resolveInitial = resolve; }))
      .mockImplementationOnce(() => new Promise<typeof page>((resolve) => { resolveRefresh = resolve; }));
    const user = userEvent.setup();
    const onUpload = vi.fn(async () => true);
    render(<OrderEvidencePanel {...props({ evidenceApi: reader(listOrder), onUpload })} />);
    await waitFor(() => expect(listOrder).toHaveBeenCalledOnce());
    await user.upload(screen.getByLabelText("Archivo de evidencia"), new File(["x"], "nuevo.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));
    expect(onUpload).toHaveBeenCalledOnce();
    resolveInitial(page);
    await waitFor(() => expect(listOrder).toHaveBeenCalledTimes(2));
    const fresh = { ...page, items: [{ ...evidence, id: "e-2", originalName: "nuevo.pdf" }] };
    resolveRefresh(fresh);
    expect(await screen.findByText("nuevo.pdf")).toBeInTheDocument();
  });

  it("clears the upload draft and validation when upload permission is lost", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const view = render(<OrderEvidencePanel {...props()} />);
    await user.upload(screen.getByLabelText("Archivo de evidencia"), new File(["x"], "script.exe", { type: "application/octet-stream" }));
    await user.type(screen.getByLabelText(/Descrip/), "borrador");
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    view.rerender(<OrderEvidencePanel {...props({ canUpload: false })} />);
    await waitFor(() => expect(screen.queryByLabelText("Archivo de evidencia")).not.toBeInTheDocument());
    view.rerender(<OrderEvidencePanel {...props({ canUpload: true })} />);
    expect(screen.getByLabelText("Archivo de evidencia")).toHaveValue("");
    expect(screen.getByLabelText(/Descrip/)).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
