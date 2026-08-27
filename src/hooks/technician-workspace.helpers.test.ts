import { describe, expect, it } from "vitest";
import type { KpiDashboardItem } from "../models/kpi";
import type { Technician } from "../models/technician";
import {
  currentWeekStart,
  indexTechnicianKpis,
  parseTechnicianSearch,
  reconcileTechnician,
  serializeTechnicianSearch,
} from "./technician-workspace.helpers";

const technician: Technician = {
  id: "tech-1",
  code: "TEC-001",
  fullName: "Ana López",
  specialty: "Redes",
  workPhone: null,
  workEmail: "ana@example.test",
  status: "AVAILABLE",
  hiredOn: "2025-01-01",
  leftOn: null,
  user: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
  version: 1,
};

describe("estado URL de técnicos", () => {
  it("parsea estado, inclusión de inactivos y página con tamaño fijo", () => {
    expect(parseTechnicianSearch("?technicianStatus=INACTIVE&technicianIncludeInactive=true&technicianPage=3")).toEqual({
      filters: { status: "INACTIVE", includeInactive: true, page: 3, pageSize: 20 },
    });
  });

  it("normaliza valores inválidos a filtros seguros por defecto", () => {
    expect(parseTechnicianSearch(
      "?technicianStatus=UNKNOWN&technicianIncludeInactive=maybe&technicianPage=-2&technicianSearch=%20%20",
    )).toEqual({
      filters: { includeInactive: false, page: 1, pageSize: 20 },
    });
  });

  it("serializa sólo sus filtros y preserva parámetros ajenos", () => {
    const query = serializeTechnicianSearch("?utm_source=campaign&technicianPage=99", {
      filters: {
        search: "Ana López",
        status: "AVAILABLE",
        includeInactive: true,
        page: 4,
        pageSize: 20,
      },
    });

    expect(query.get("utm_source")).toBe("campaign");
    expect(query.get("technicianSearch")).toBe("Ana López");
    expect(query.get("technicianStatus")).toBe("AVAILABLE");
    expect(query.get("technicianIncludeInactive")).toBe("true");
    expect(query.get("technicianPage")).toBe("4");
    expect(query.has("technicianPageSize")).toBe(false);
  });

  it("calcula el lunes de la semana KPI en America/Tegucigalpa", () => {
    expect(currentWeekStart(new Date("2026-08-27T12:00:00-06:00"))).toBe("2026-08-24");
  });

  it("conserva la semana KPI previa en el límite domingo-lunes de un navegador UTC", () => {
    const environment = (globalThis as typeof globalThis & { process: { env: { TZ?: string } } }).process.env;
    const originalTimeZone = environment.TZ;
    environment.TZ = "UTC";
    try {
      expect(currentWeekStart(new Date("2026-08-31T05:30:00.000Z"))).toBe("2026-08-24");
    } finally {
      environment.TZ = originalTimeZone;
    }
  });
});

describe("índice y reconciliación de KPI de técnicos", () => {
  it("indexa los KPI por technicianId sin transformar sus valores", () => {
    const item = { technicianId: "tech-1", overallScore: "91.25" } as KpiDashboardItem;
    const map = indexTechnicianKpis([item]);

    expect(map.get("tech-1")?.overallScore).toBe("91.25");
    expect(map.get("tech-1")).toBe(item);
  });

  it("conserva la instancia con mayor versión al reconciliar respuestas", () => {
    const version2 = { ...technician, version: 2 };
    const version3 = { ...technician, version: 3, fullName: "Ana López García" };

    expect(reconcileTechnician(version3, version2)).toBe(version3);
    expect(reconcileTechnician(version2, version3)).toBe(version3);
  });

  it("conserva la versión actual en empate", () => {
    const current = { ...technician, version: 2 };
    const sameVersion = { ...technician, version: 2, fullName: "Cambio remoto" };

    expect(reconcileTechnician(current, sameVersion)).toBe(current);
  });
});
