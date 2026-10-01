import { describe, expect, it } from "vitest";
import {
  canAccessPage,
  getPageFromPath,
  getPathFromPage,
  isKnownInternalPath,
} from "./appRoutes";

describe("orders application route", () => {
  it("maps the orders page and allows both read scopes", () => {
    expect(getPathFromPage("Órdenes")).toBe("/ordenes");
    expect(getPageFromPath("/ordenes")).toBe("Órdenes");
    expect(isKnownInternalPath("/ordenes")).toBe(true);
    expect(canAccessPage("Órdenes", ["ORDERS_VIEW_ALL"])).toBe(true);
    expect(canAccessPage("Órdenes", ["ORDERS_VIEW_OWN"])).toBe(true);
    expect(canAccessPage("Órdenes", [])).toBe(false);
  });
});

describe("clients application route", () => {
  it("maps /clientes and grants access only with CLIENTS_VIEW", () => {
    expect(getPageFromPath("/clientes")).toBe("Clientes");
    expect(getPathFromPage("Clientes")).toBe("/clientes");
    expect(isKnownInternalPath("/clientes")).toBe(true);
    expect(canAccessPage("Clientes", ["CLIENTS_VIEW"])).toBe(true);
    expect(canAccessPage("Clientes", ["ORDERS_VIEW_ALL"])).toBe(false);
  });
});

describe("performance analytics route", () => {
  it("maps /analisis and gates it with either KPI reading scope", () => {
    expect(getPathFromPage("Análisis")).toBe("/analisis");
    expect(getPageFromPath("/analisis")).toBe("Análisis");
    expect(isKnownInternalPath("/analisis")).toBe(true);
    expect(canAccessPage("Análisis", ["KPI_VIEW_ALL"])).toBe(true);
    expect(canAccessPage("Análisis", ["KPI_VIEW_OWN"])).toBe(true);
    expect(canAccessPage("Análisis", [])).toBe(false);
  });
});
