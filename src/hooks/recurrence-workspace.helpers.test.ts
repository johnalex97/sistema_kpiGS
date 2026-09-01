import { describe, expect, it } from "vitest";
import type { RecurrenceDetail } from "../models/recurrence";
import {
  currentRecurrenceMonth,
  parseRecurrenceSearch,
  reconcileRecurrence,
  serializeRecurrenceSearch,
} from "./recurrence-workspace.helpers";

const originalOrderId = "11111111-1111-4111-8111-111111111111";
const technicianId = "22222222-2222-4222-8222-222222222222";
const selectedId = "33333333-3333-4333-8333-333333333333";

function recurrence(id: string, version: number): RecurrenceDetail {
  return { id, version } as RecurrenceDetail;
}

describe("estado URL de reincidencias", () => {
  it("parsea filtros repetidos, selecciÃ³n y paginaciÃ³n", () => {
    const parsed = parseRecurrenceSearch(
      `?recurrenceStatus=OPEN&recurrenceStatus=ANALYSIS&recurrenceStatus=OPEN` +
      `&recurrenceImpact=HIGH&recurrenceResponsibility=TECHNICAL_WORK` +
      `&recurrenceOriginalOrderId=${originalOrderId}&recurrenceTechnicianId=${technicianId}` +
      `&recurrenceSelectedId=${selectedId}&recurrencePage=2&recurrencePageSize=40` +
      "&recurrenceSearch=%20router%20central%20",
      new Date("2026-09-10T12:00:00.000Z"),
    );

    expect(parsed).toEqual({
      selectedId,
      filters: {
        search: "router central",
        status: ["OPEN", "ANALYSIS"],
        impact: ["HIGH"],
        responsibility: ["TECHNICAL_WORK"],
        originalOrderId,
        technicianId,
        detectedFrom: "2026-09-01T00:00:00-06:00",
        detectedTo: "2026-09-30T23:59:59.999-06:00",
        page: 2,
        pageSize: 40,
      },
    });
  });

  it("descarta valores invÃ¡lidos y usa defaults reproducibles", () => {
    expect(parseRecurrenceSearch(
      "?recurrenceStatus=UNKNOWN&recurrenceImpact=SEVERE&recurrenceResponsibility=HACKED" +
      "&recurrenceOriginalOrderId=bad&recurrenceSelectedId=%20%20&recurrencePage=0" +
      "&recurrencePageSize=101&recurrenceFrom=not-a-date&recurrenceTo=also-not-a-date",
      new Date("2026-09-10T12:00:00.000Z"),
    )).toEqual({
      selectedId: null,
      filters: {
        detectedFrom: "2026-09-01T00:00:00-06:00",
        detectedTo: "2026-09-30T23:59:59.999-06:00",
        page: 1,
        pageSize: 20,
      },
    });
  });

  it("conserva parÃ¡metros ajenos, reemplaza los propios y materializa el periodo", () => {
    const query = serializeRecurrenceSearch("?source=shell&recurrenceStatus=CLOSED&recurrenceFrom=old", {
      selectedId,
      filters: {
        search: "   ",
        status: ["OPEN", "ANALYSIS"],
        impact: [],
        responsibility: [],
        originalOrderId: "",
        technicianId,
        detectedFrom: "2026-09-01T00:00:00.000-06:00",
        detectedTo: "2026-09-30T23:59:59.999-06:00",
        page: 2,
        pageSize: 40,
      },
    });

    expect(query.get("source")).toBe("shell");
    expect(query.getAll("recurrenceStatus")).toEqual(["OPEN", "ANALYSIS"]);
    expect(query.get("recurrenceTechnicianId")).toBe(technicianId);
    expect(query.get("recurrenceSelectedId")).toBe(selectedId);
    expect(query.get("recurrencePage")).toBe("2");
    expect(query.get("recurrencePageSize")).toBe("40");
    expect(query.get("recurrenceFrom")).toBe("2026-09-01T00:00:00.000-06:00");
    expect(query.get("recurrenceTo")).toBe("2026-09-30T23:59:59.999-06:00");
    expect(query.has("recurrenceSearch")).toBe(false);
    expect(query.has("recurrenceImpact")).toBe(false);
  });
});

describe("periodo y reconciliaciÃ³n de reincidencias", () => {
  it("usa el mes de Tegucigalpa en una frontera UTC", () => {
    expect(currentRecurrenceMonth(new Date("2026-09-01T03:00:00.000Z"))).toEqual({
      detectedFrom: "2026-08-01T00:00:00-06:00",
      detectedTo: "2026-08-31T23:59:59.999-06:00",
    });
  });

  it("conserva el detalle actual sÃ³lo ante una respuesta mÃ¡s antigua del mismo caso", () => {
    const current = recurrence(selectedId, 3);
    const older = recurrence(selectedId, 2);
    const newer = recurrence(selectedId, 4);
    const another = recurrence("44444444-4444-4444-8444-444444444444", 1);

    expect(reconcileRecurrence(current, older)).toBe(current);
    expect(reconcileRecurrence(current, newer)).toBe(newer);
    expect(reconcileRecurrence(current, another)).toBe(another);
    expect(reconcileRecurrence(null, older)).toBe(older);
  });
});
