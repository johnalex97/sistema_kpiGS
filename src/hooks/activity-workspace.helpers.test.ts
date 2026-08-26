import { describe, expect, it } from "vitest";
import type { ActivityDetail } from "../models/activity";
import {
  activityElapsedMs,
  defaultActivityFilters,
  formatActivityDuration,
  parseActivitySearch,
  serializeActivitySearch,
  tegucigalpaDayRange,
} from "./activity-workspace.helpers";

const baseActivity: ActivityDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  branch: {
    id: "22222222-2222-4222-8222-222222222222",
    code: "TGU-01",
    name: "Centro",
    client: { id: "33333333-3333-4333-8333-333333333333", code: "CLI-001", tradeName: "Cliente Demo" },
  },
  order: null,
  activityType: { id: "44444444-4444-4444-8444-444444444444", code: "SUP", name: "Soporte", description: null, displayOrder: 1 },
  status: "IN_PROGRESS",
  description: "Configurar enlace",
  result: null,
  responsible: null,
  startedAt: "2026-08-26T08:00:00.000Z",
  endedAt: null,
  pausedMinutes: 0,
  productiveMinutes: null,
  createdAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:00:00.000Z",
  version: 1,
  observations: null,
  team: [],
  pauses: [],
};

function activity(overrides: Partial<ActivityDetail>): ActivityDetail {
  return { ...baseActivity, ...overrides };
}

describe("filtros de actividades", () => {
  it("normaliza vista, página y estados inválidos a defaults seguros", () => {
    const parsed = parseActivitySearch(
      "?activityView=unknown&activityPage=-4&activityStatus=HACKED",
      new Date("2026-08-26T18:00:00.000Z"),
    );

    expect(parsed).toEqual({
      view: "open",
      filters: defaultActivityFilters("open", new Date("2026-08-26T18:00:00.000Z")),
    });
  });

  it("acepta sólo estados compatibles, ids, fechas ISO y enteros positivos", () => {
    const parsed = parseActivitySearch(
      "?activityView=history&activityPage=3&activityStatus=COMPLETED&activityStatus=PAUSED" +
      "&activityTypeId=type-1&activityClientId=client-1&activityStartedFrom=2026-08-01T00%3A00%3A00.000-06%3A00" +
      "&activityStartedTo=no-es-fecha",
      new Date("2026-08-26T18:00:00.000Z"),
    );

    expect(parsed).toEqual({
      view: "history",
      filters: {
        status: ["COMPLETED"],
        activityTypeId: "type-1",
        clientId: "client-1",
        startedFrom: "2026-08-01T00:00:00.000-06:00",
        page: 3,
        pageSize: 25,
      },
    });
  });

  it("aplica el día local de Tegucigalpa al historial y permite todas las fechas", () => {
    const now = new Date("2026-08-27T03:30:00.000Z");

    expect(parseActivitySearch("?activityView=history", now).filters).toMatchObject({
      startedFrom: "2026-08-26T00:00:00.000-06:00",
      startedTo: "2026-08-26T23:59:59.999-06:00",
    });
    expect(parseActivitySearch("?activityView=history&activityAllDates=true", now).filters).not.toHaveProperty("startedFrom");
  });

  it("serializa filtros repetidos, marca todas las fechas y conserva parámetros ajenos", () => {
    const query = serializeActivitySearch("?source=shell&activityPage=9", {
      view: "history",
      filters: {
        search: "router central",
        page: 2,
        pageSize: 25,
        status: ["COMPLETED", "CANCELLED"],
        technicianId: "tech-1",
      },
    });

    expect(query.get("source")).toBe("shell");
    expect(query.get("activityView")).toBe("history");
    expect(query.get("activityPage")).toBe("2");
    expect(query.getAll("activityStatus")).toEqual(["COMPLETED", "CANCELLED"]);
    expect(query.get("activitySearch")).toBe("router central");
    expect(query.get("activityTechnicianId")).toBe("tech-1");
    expect(query.get("activityAllDates")).toBe("true");
  });

  it("calcula un rango local correcto aunque UTC esté en el día siguiente", () => {
    expect(tegucigalpaDayRange(new Date("2026-08-27T03:30:00.000Z"))).toEqual({
      startedFrom: "2026-08-26T00:00:00.000-06:00",
      startedTo: "2026-08-26T23:59:59.999-06:00",
    });
  });
});

describe("reloj de actividades", () => {
  it("descuenta pausas cerradas y congela una pausa abierta", () => {
    const detail = activity({
      pauses: [
        { id: "p1", startedAt: "2026-08-26T08:30:00.000Z", endedAt: "2026-08-26T08:40:00.000Z", reason: "Traslado" },
        { id: "p2", startedAt: "2026-08-26T09:00:00.000Z", endedAt: null, reason: "Espera" },
      ],
    });

    expect(activityElapsedMs(detail, new Date("2026-08-26T09:30:00.000Z"))).toBe(50 * 60_000);
    expect(formatActivityDuration(50 * 60_000)).toBe("00:50:00");
  });

  it("usa endedAt como final definitivo y recorta pausas al intervalo activo", () => {
    const detail = activity({
      endedAt: "2026-08-26T10:00:00.000Z",
      pauses: [
        { id: "p1", startedAt: "2026-08-26T07:50:00.000Z", endedAt: "2026-08-26T08:10:00.000Z", reason: "Previo" },
        { id: "p2", startedAt: "2026-08-26T09:50:00.000Z", endedAt: "2026-08-26T10:10:00.000Z", reason: "Final" },
      ],
    });

    expect(activityElapsedMs(detail, new Date("2026-08-26T12:00:00.000Z"))).toBe(100 * 60_000);
  });

  it("devuelve cero sin inicio o ante intervalos negativos", () => {
    expect(activityElapsedMs(activity({ startedAt: null }), new Date("2026-08-26T09:00:00.000Z"))).toBe(0);
    expect(activityElapsedMs(activity({ endedAt: "2026-08-26T07:00:00.000Z" }), new Date("2026-08-26T09:00:00.000Z"))).toBe(0);
    expect(formatActivityDuration(-1)).toBe("00:00:00");
  });
});
