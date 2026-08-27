import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ActivityLookupApi } from "../../api/activity-lookups";
import type { ActivityDetail, ActivityFormActor, ActivityFormValue, ActivityType, LookupPage, OrderOption } from "../../models/activity";
import { ActivityForm } from "./ActivityForm";

const activityTypes: ActivityType[] = [{ id: "type-1", code: "SUP", name: "Soporte", description: null, displayOrder: 1 }];
const pagination = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };
const order = { id: "order-1", orderNumber: "OT-2026-0042", clientName: "Cliente Demo", branchName: "Centro", status: "ASSIGNED" };
const client = { id: "client-1", code: "CLI-001", tradeName: "Cliente Demo" };
const branch = { id: "branch-1", code: "TGU-01", name: "Centro", address: "Boulevard Centroamérica", isEffectivelyActive: true };
const technician = { id: "tech-1", code: "TEC-001", fullName: "Ana López", status: "AVAILABLE" as const };

function lookupApi(overrides: Partial<ActivityLookupApi> = {}): ActivityLookupApi {
  return {
    orders: vi.fn(async () => ({ items: [order], pagination })),
    clients: vi.fn(async () => ({ items: [client], pagination })),
    branches: vi.fn(async () => ({ items: [branch], pagination })),
    technicians: vi.fn(async () => ({ items: [technician], pagination })),
    ...overrides,
  };
}

const technicianActor: ActivityFormActor = { technicianId: "tech-1", canManage: false };

function renderForm(options: {
  onSubmit?: (value: ActivityFormValue) => Promise<void>;
  api?: ActivityLookupApi;
  actor?: ActivityFormActor;
  mode?: "scheduled" | "manual";
  now?: () => Date;
} = {}) {
  const defaultSubmit: (value: ActivityFormValue) => Promise<void> = async () => undefined;
  const onSubmit = vi.fn(options.onSubmit ?? defaultSubmit);
  const view = render(<ActivityForm
    mode={options.mode}
    activityTypes={activityTypes}
    lookupApi={options.api ?? lookupApi()}
    actor={options.actor ?? technicianActor}
    now={options.now}
    onSubmit={onSubmit}
    onCancel={vi.fn()}
  />);
  return { ...view, onSubmit };
}

async function chooseCombobox(user: ReturnType<typeof userEvent.setup>, label: string, search: string, option: string) {
  const input = screen.getByRole("combobox", { name: label });
  await user.clear(input);
  await user.type(input, search);
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("ActivityForm", () => {
  it("crea una programada vinculada a orden", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await chooseCombobox(user, "Orden", "OT-2026", "OT-2026-0042 · Cliente Demo · Centro");
    await user.selectOptions(screen.getByLabelText("Tipo de actividad"), "type-1");
    await user.type(screen.getByLabelText("Descripción"), "Configurar firewall");
    await user.click(screen.getByRole("button", { name: "Crear actividad" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      mode: "scheduled", orderId: "order-1", branchId: undefined,
      activityTypeId: "type-1", description: "Configurar firewall",
    }));
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("team");
  });

  it("seleccionar sucursal elimina la orden elegida", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await chooseCombobox(user, "Orden", "OT", "OT-2026-0042 · Cliente Demo · Centro");
    await user.click(screen.getByRole("radio", { name: "Sucursal" }));
    await chooseCombobox(user, "Cliente", "Demo", "CLI-001 · Cliente Demo");
    await chooseCombobox(user, "Sucursal del cliente", "Centro", "TGU-01 · Centro · Boulevard Centroamérica");
    await user.selectOptions(screen.getByLabelText("Tipo de actividad"), "type-1");
    await user.type(screen.getByLabelText("Descripción"), "Configurar firewall");
    await user.click(screen.getByRole("button", { name: "Crear actividad" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ branchId: "branch-1", orderId: undefined }));
  });

  it("convierte una carga manual al offset de Tegucigalpa", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ mode: "manual", now: () => new Date("2026-08-26T18:00:00.000Z") });
    await chooseCombobox(user, "Orden", "OT", "OT-2026-0042 · Cliente Demo · Centro");
    await user.selectOptions(screen.getByLabelText("Tipo de actividad"), "type-1");
    await user.type(screen.getByLabelText("Descripción"), "Entrega de equipo");
    await user.type(screen.getByLabelText("Inicio"), "2026-08-26T08:00");
    await user.type(screen.getByLabelText("Fin"), "2026-08-26T09:00");
    await user.type(screen.getByLabelText("Resultado"), "Equipo entregado");
    await user.type(screen.getByLabelText("Justificación"), "Registro posterior a visita");
    await user.click(screen.getByRole("button", { name: "Registrar actividad manual" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      mode: "manual",
      startedAt: "2026-08-26T08:00:00.000-06:00",
      endedAt: "2026-08-26T09:00:00.000-06:00",
      result: "Equipo entregado",
      justification: "Registro posterior a visita",
    }));
  });

  it.each([
    ["menos de un minuto", "2026-08-26T08:00", "2026-08-26T08:00", "La actividad debe durar al menos un minuto"],
    ["más de 24 horas", "2026-08-24T08:00", "2026-08-26T09:00", "La actividad no puede superar 24 horas"],
    ["en el futuro", "2026-08-26T13:00", "2026-08-26T14:00", "Las fechas no pueden estar en el futuro"],
  ])("rechaza una carga manual %s", async (_case, startedAt, endedAt, message) => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ mode: "manual", now: () => new Date("2026-08-26T18:00:00.000Z") });
    await chooseCombobox(user, "Orden", "OT", "OT-2026-0042 · Cliente Demo · Centro");
    await user.selectOptions(screen.getByLabelText("Tipo de actividad"), "type-1");
    await user.type(screen.getByLabelText("Descripción"), "Trabajo documentado");
    await user.type(screen.getByLabelText("Inicio"), startedAt);
    await user.type(screen.getByLabelText("Fin"), endedAt);
    await user.type(screen.getByLabelText("Resultado"), "Completado");
    await user.type(screen.getByLabelText("Justificación"), "Registro posterior");
    await user.click(screen.getByRole("button", { name: "Registrar actividad manual" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra editor de equipo sólo a administración", async () => {
    const adminApi = lookupApi();
    const first = renderForm({ api: adminApi, actor: { technicianId: null, canManage: true } });
    expect(await screen.findByRole("heading", { name: "Equipo técnico" })).toBeInTheDocument();
    first.unmount();

    renderForm({ actor: technicianActor });
    expect(screen.queryByRole("heading", { name: "Equipo técnico" })).not.toBeInTheDocument();
  });

  it("aborta búsquedas pendientes al desmontar", async () => {
    let signal: AbortSignal | undefined;
    const api = lookupApi({
      orders: vi.fn((_search: string, _page: number, nextSignal?: AbortSignal): Promise<LookupPage<OrderOption>> => {
        signal = nextSignal;
        return new Promise<LookupPage<OrderOption>>(() => undefined);
      }),
    });
    const view = renderForm({ api });
    await waitFor(() => expect(signal).toBeDefined());

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("edita solo tipo, descripcion y observaciones preservando valores", async () => {
    const user = userEvent.setup();
    const initialActivity: ActivityDetail = {
      id: "activity-1",
      branch: { id: "branch-1", code: "TGU-01", name: "Centro", client: { id: "client-1", code: "CLI-1", tradeName: "Cliente Demo" } },
      order: { id: "order-1", orderNumber: "OT-1" },
      activityType: activityTypes[0], status: "PENDING", description: "Revision inicial", result: null,
      responsible: null, startedAt: null, endedAt: null, pausedMinutes: 0, productiveMinutes: null,
      createdAt: "2026-08-26T13:00:00.000Z", updatedAt: "2026-08-26T13:00:00.000Z", version: 1,
      observations: "Llevar escalera", team: [], pauses: [],
    };
    const onSubmit = vi.fn(async () => undefined);
    render(<ActivityForm variant="edit" initialActivity={initialActivity} activityTypes={activityTypes} lookupApi={lookupApi()} actor={technicianActor} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.queryByText("Modo de registro")).not.toBeInTheDocument();
    expect(screen.queryByText("Origen del trabajo")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Descripci/)).toHaveValue("Revision inicial");
    expect(screen.getByLabelText("Observaciones")).toHaveValue("Llevar escalera");
    await user.clear(screen.getByLabelText(/Descripci/));
    await user.type(screen.getByLabelText(/Descripci/), "Revision actualizada");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(onSubmit).toHaveBeenCalledWith({ activityTypeId: "type-1", description: "Revision actualizada", observations: "Llevar escalera" });
  });
});
