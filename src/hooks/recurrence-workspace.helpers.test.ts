import { describe, expect, it } from "vitest";
import type { RecurrenceDetail } from "../models/recurrence";
import {
  currentRecurrenceMonth,
  hasEffectiveRecurrenceFilters,
  parseRecurrenceSearch,
  reconcileRecurrence,
  serializeRecurrenceSearch,
} from "./recurrence-workspace.helpers";

const originalOrderId = "11111111-1111-4111-8111-111111111111";
const technicianId = "22222222-2222-4222-8222-222222222222";
const selectedId = "33333333-3333-4333-8333-333333333333";
const uuidCases = {
  version1: "11111111-1111-1111-8111-111111111111",
  version8: "88888888-8888-8888-b888-888888888888",
  nil: "00000000-0000-0000-0000-000000000000",
  max: "ffffffff-ffff-ffff-ffff-ffffffffffff",
} as const;

function recurrence(id: string, version: number): RecurrenceDetail {
  return { id, version } as RecurrenceDetail;
}

describe("filtros efectivos de reincidencias", () => {
  it("no considera filtro al periodo mensual materializado y sí detecta restricciones reales", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const currentPeriod = currentRecurrenceMonth(now);

    expect(hasEffectiveRecurrenceFilters({ ...currentPeriod, page: 1, pageSize: 20 }, now)).toBe(false);
    expect(hasEffectiveRecurrenceFilters({ ...currentPeriod, status: ["OPEN"], page: 1, pageSize: 20 }, now)).toBe(true);
    expect(hasEffectiveRecurrenceFilters({ ...currentPeriod, detectedFrom: "2026-08-01T00:00:00-06:00", page: 1, pageSize: 20 }, now)).toBe(true);
  });
});

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

  it("conserva fechas UTC vÃ¡lidas aceptadas por el contrato", () => {
    expect(parseRecurrenceSearch(
      "?recurrenceFrom=2026-03-01T00%3A00%3A00Z&recurrenceTo=2026-03-31T23%3A59%3A59.999Z",
      new Date("2026-03-10T12:00:00.000Z"),
    ).filters).toMatchObject({
      detectedFrom: "2026-03-01T00:00:00Z",
      detectedTo: "2026-03-31T23:59:59.999Z",
    });
  });

  it("conserva fracciones de segundo vÃ¡lidas aceptadas por el contrato", () => {
    expect(parseRecurrenceSearch(
      "?recurrenceFrom=2026-03-01T00%3A00%3A00.1234Z&recurrenceTo=2026-03-31T23%3A59%3A59.999999Z",
      new Date("2026-03-10T12:00:00.000Z"),
    ).filters).toMatchObject({
      detectedFrom: "2026-03-01T00:00:00.1234Z",
      detectedTo: "2026-03-31T23:59:59.999999Z",
    });
  });

  it.each([
    ["UTC", "2026-03-01T00:00Z", "2026-03-31T23:59Z"],
    ["offset -06:00", "2026-03-01T00:00-06:00", "2026-03-31T23:59-06:00"],
  ])("acepta fechas sin segundos con %s al parsear", (_zone, detectedFrom, detectedTo) => {
    expect(parseRecurrenceSearch(
      `?recurrenceFrom=${encodeURIComponent(detectedFrom)}&recurrenceTo=${encodeURIComponent(detectedTo)}`,
      new Date("2026-03-10T12:00:00.000Z"),
    ).filters).toMatchObject({ detectedFrom, detectedTo });
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

  it.each([
    ["version 0", "11111111-1111-0111-8111-111111111111"],
    ["version 9", "11111111-1111-9111-8111-111111111111"],
    ["variant 7", "11111111-1111-4111-7111-111111111111"],
    ["variant c", "11111111-1111-4111-c111-111111111111"],
  ])("rejects a UUID with invalid %s while parsing and serializing", (_case, invalidId) => {
    const parsed = parseRecurrenceSearch(
      `?recurrenceOriginalOrderId=${invalidId}&recurrenceSelectedId=${invalidId}`,
      new Date("2026-09-10T12:00:00.000Z"),
    );
    const serialized = serializeRecurrenceSearch("", {
      selectedId: invalidId,
      filters: {
        originalOrderId: invalidId,
        detectedFrom: "2026-09-01T00:00:00-06:00",
        detectedTo: "2026-09-30T23:59:59.999-06:00",
        page: 1,
        pageSize: 20,
      },
    });

    expect(parsed.filters.originalOrderId).toBeUndefined();
    expect(parsed.selectedId).toBeNull();
    expect(serialized.has("recurrenceOriginalOrderId")).toBe(false);
    expect(serialized.has("recurrenceSelectedId")).toBe(false);
  });

  it.each(Object.entries(uuidCases))(
    "accepts the RFC or special UUID %s while parsing and serializing",
    (_case, validId) => {
      const parsed = parseRecurrenceSearch(
        `?recurrenceOriginalOrderId=${validId}&recurrenceSelectedId=${validId}`,
        new Date("2026-09-10T12:00:00.000Z"),
      );
      const serialized = serializeRecurrenceSearch("", {
        selectedId: validId,
        filters: {
          originalOrderId: validId,
          detectedFrom: "2026-09-01T00:00:00-06:00",
          detectedTo: "2026-09-30T23:59:59.999-06:00",
          page: 1,
          pageSize: 20,
        },
      });

      expect(parsed.filters.originalOrderId).toBe(validId);
      expect(parsed.selectedId).toBe(validId);
      expect(serialized.get("recurrenceOriginalOrderId")).toBe(validId);
      expect(serialized.get("recurrenceSelectedId")).toBe(validId);
    },
  );

  it.each([
    ["dÃ­a inexistente", "2026-02-30T00:00:00-06:00", "2026-03-10T12:00:00.000Z"],
    ["29 de febrero de un aÃ±o no bisiesto", "2025-02-29T00:00:00-06:00", "2025-03-10T12:00:00.000Z"],
  ])("no acepta un %s al parsear el periodo", (_case, invalidFrom, now) => {
    expect(parseRecurrenceSearch(
      `?recurrenceFrom=${encodeURIComponent(invalidFrom)}&recurrenceTo=${encodeURIComponent(invalidFrom.slice(0, 7) + "-31T23:59:59.999-06:00")}`,
      new Date(now),
    ).filters).toMatchObject(currentRecurrenceMonth(new Date(now)));
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

  it.each([
    ["dÃ­a inexistente", "2026-02-30T00:00:00-06:00", "2026-03-10T12:00:00.000Z"],
    ["29 de febrero de un aÃ±o no bisiesto", "2025-02-29T00:00:00-06:00", "2025-03-10T12:00:00.000Z"],
  ])("no serializa un %s y materializa el periodo vigente", (_case, invalidFrom, now) => {
    const query = serializeRecurrenceSearch("?source=shell", {
      selectedId: null,
      filters: {
        detectedFrom: invalidFrom,
        detectedTo: `${invalidFrom.slice(0, 7)}-31T23:59:59.999-06:00`,
        page: 1,
        pageSize: 20,
      },
    }, new Date(now));

    expect(query.get("recurrenceFrom")).toBe(currentRecurrenceMonth(new Date(now)).detectedFrom);
    expect(query.get("recurrenceTo")).toBe(currentRecurrenceMonth(new Date(now)).detectedTo);
    expect(query.toString()).not.toContain(encodeURIComponent(invalidFrom));
  });

  it.each([
    ["UTC", "2026-03-01T00:00Z", "2026-03-31T23:59Z"],
    ["offset -06:00", "2026-03-01T00:00-06:00", "2026-03-31T23:59-06:00"],
  ])("serializa fechas sin segundos con %s", (_zone, detectedFrom, detectedTo) => {
    const query = serializeRecurrenceSearch("", {
      selectedId: null,
      filters: { detectedFrom, detectedTo, page: 1, pageSize: 20 },
    });

    expect(query.get("recurrenceFrom")).toBe(detectedFrom);
    expect(query.get("recurrenceTo")).toBe(detectedTo);
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
