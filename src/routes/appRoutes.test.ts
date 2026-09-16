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
