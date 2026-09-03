import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

function props(overrides: Partial<React.ComponentProps<typeof RecurrenceEvidencePanel>> = {}) {
  return {
    recurrenceId: "rec-1",
    recurrenceNumber: "RI-2026-0001",
    evidences: [] as Evidence[],
    canView: true,
    canManage: false,
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

    await user.upload(screen.getByLabelText("Archivo de evidencia"), file);
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
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

    const managerUpload = vi.fn(async () => true);
    rendered.rerender(<RecurrenceEvidencePanel {...props({ canManage: true, onUpload: managerUpload })} />);
    const managerFile = new File(["pdf"], "diagnostico.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Archivo de evidencia"), managerFile);
    await user.selectOptions(screen.getByLabelText("Acceso"), "INTERNAL");
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));
    expect(managerUpload).toHaveBeenCalledWith({ file: managerFile, accessLevel: "INTERNAL" });
  });

  it("keeps the case and selected file pending after failure so upload can be retried", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<RecurrenceEvidencePanel {...props({ error: "No fue posible subir la evidencia.", onUpload })} />);
    const file = new File(["pdf"], "visita.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("Archivo de evidencia"), file);
    await user.click(screen.getByRole("button", { name: "Subir evidencia" }));

    expect(screen.getByRole("status")).toHaveTextContent("Caso creado · evidencia pendiente");
    expect(screen.getByRole("alert")).toHaveTextContent("No fue posible subir la evidencia");
    expect((screen.getByLabelText("Archivo de evidencia") as HTMLInputElement).files?.[0]).toBe(file);
    await user.click(screen.getByRole("button", { name: "Reintentar evidencia" }));
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it("downloads visible evidence and archives it with a trimmed reason", async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn(async () => true);
    const onArchive = vi.fn(async () => true);
    render(<RecurrenceEvidencePanel {...props({ evidences: [evidence], canManage: true, onDownload, onArchive })} />);

    await user.click(screen.getByRole("button", { name: "Descargar router-frontal.png" }));
    expect(onDownload).toHaveBeenCalledWith(evidence);
    await user.click(screen.getByRole("button", { name: "Archivar router-frontal.png" }));
    const reason = screen.getByLabelText("Motivo para archivar router-frontal.png");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el motivo");
    await user.type(reason, "  Documento reemplazado  ");
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(onArchive).toHaveBeenCalledWith(evidence, "Documento reemplazado");
    await waitFor(() => expect(screen.queryByLabelText("Motivo para archivar router-frontal.png")).not.toBeInTheDocument());
  });

  it("does not render evidence operations after permissions are revoked", () => {
    const rendered = render(<RecurrenceEvidencePanel {...props({ evidences: [evidence], canManage: true })} />);
    expect(screen.getByRole("button", { name: "Descargar router-frontal.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivar router-frontal.png" })).toBeInTheDocument();

    rendered.rerender(<RecurrenceEvidencePanel {...props({ evidences: [evidence], canView: false, canManage: false })} />);
    expect(screen.queryByRole("button", { name: "Descargar router-frontal.png" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar router-frontal.png" })).not.toBeInTheDocument();
  });
});
