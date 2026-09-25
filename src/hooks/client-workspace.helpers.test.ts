import { describe, expect, it } from "vitest";
import type { ClientBranch, ClientContact, ClientDetail } from "../models/client";
import {
  deriveClientCapabilities,
  parseClientSearch,
  reconcileBranch,
  reconcileClient,
  reconcileContact,
  serializeClientSearch,
} from "./client-workspace.helpers";

const client = { id: "c1", version: 3 } as ClientDetail;
const branch = { id: "b1", version: 3 } as ClientBranch;
const contact = { id: "ct1", version: 3 } as ClientContact;

describe("estado URL de clientes", () => {
  it("parsea las 21 claves de clientes, sucursales y contactos", () => {
    const parsed = parseClientSearch("?search=Acme&isActive=false&includeInactive=false&page=2&pageSize=30&clientId=c1&clientTab=contacts&branchSearch=Centro&branchCity=Tegucigalpa&branchRegion=Francisco%20Morazan&branchIsActive=false&branchIncludeInactive=false&branchPage=4&branchPageSize=40&contactSearch=Ana&contactBranchId=b1&contactScope=BRANCH&contactIsActive=false&contactIncludeInactive=false&contactPage=3&contactPageSize=50");

    expect(parsed).toEqual({
      clients: { search: "Acme", isActive: false, includeInactive: true, page: 2, pageSize: 30 },
      clientId: "c1",
      tab: "contacts",
      branches: { search: "Centro", city: "Tegucigalpa", region: "Francisco Morazan", isActive: false, includeInactive: true, page: 4, pageSize: 40 },
      contacts: { search: "Ana", branchId: "b1", scope: "BRANCH", isActive: false, includeInactive: true, page: 3, pageSize: 50 },
    });
  });

  it("aplica los valores por defecto cuando no hay parámetros", () => {
    expect(parseClientSearch("")).toEqual({
      clients: { includeInactive: false, page: 1, pageSize: 20 },
      clientId: null,
      tab: "summary",
      branches: { includeInactive: false, page: 1, pageSize: 20 },
      contacts: { includeInactive: false, page: 1, pageSize: 20 },
    });
  });

  it("descarta booleanos inválidos, textos vacíos, páginas negativas y pestañas desconocidas", () => {
    expect(parseClientSearch("?search=%20&isActive=maybe&includeInactive=1&page=-2&pageSize=0&clientId=%20&clientTab=unknown&branchCity=%20&branchIsActive=maybe&branchPage=-1&contactScope=OTHER&contactPage=0")).toEqual({
      clients: { includeInactive: false, page: 1, pageSize: 20 },
      clientId: null,
      tab: "summary",
      branches: { includeInactive: false, page: 1, pageSize: 20 },
      contacts: { includeInactive: false, page: 1, pageSize: 20 },
    });
  });

  it("serializa los filtros normalizados y conserva parámetros ajenos", () => {
    const state = parseClientSearch("?search=Acme&isActive=false&page=2&clientId=c1&clientTab=branches&branchCity=San%20Pedro%20Sula&branchPage=3&contactScope=CLIENT&contactPage=4");
    const query = serializeClientSearch("?utm_source=campana&orderId=o1&clientId=c1&page=99", state);

    expect(query.get("utm_source")).toBe("campana");
    expect(query.get("orderId")).toBe("o1");
    expect(parseClientSearch(`?${query}`)).toEqual(state);
    expect(query.get("includeInactive")).toBe("true");
    expect(query.get("page")).toBe("2");
  });

  it("retira filtros hijos al cambiar el cliente seleccionado", () => {
    const state = parseClientSearch("?clientId=c2&clientTab=contacts&branchCity=La%20Ceiba&contactScope=BRANCH");
    const query = serializeClientSearch("?clientId=c1&branchSearch=Viejo&contactSearch=Viejo&utm_source=campana", state);

    expect(query.get("clientId")).toBe("c2");
    expect(query.get("clientTab")).toBe("contacts");
    expect(query.has("branchCity")).toBe(false);
    expect(query.has("branchSearch")).toBe(false);
    expect(query.has("contactScope")).toBe(false);
    expect(query.has("contactSearch")).toBe(false);
    expect(query.get("utm_source")).toBe("campana");
    expect(parseClientSearch(`?${query}`).branches.page).toBe(1);
  });

  it("conserva filtros hijos al cambiar sólo de pestaña", () => {
    const state = parseClientSearch("?clientId=c1&clientTab=contacts&branchCity=La%20Ceiba&contactScope=BRANCH");
    const query = serializeClientSearch("?clientId=c1&clientTab=branches", state);

    expect(query.get("branchCity")).toBe("La Ceiba");
    expect(query.get("contactScope")).toBe("BRANCH");
  });
});

describe("capacidades y reconciliación", () => {
  it("deriva permisos de vista y gestión de manera independiente", () => {
    expect(deriveClientCapabilities([])).toEqual({ canView: false, canManage: false });
    expect(deriveClientCapabilities(["CLIENTS_VIEW"])).toEqual({ canView: true, canManage: false });
    expect(deriveClientCapabilities(["CLIENTS_MANAGE"])).toEqual({ canView: false, canManage: true });
  });

  it("conserva el recurso de mayor versión aun con saltos no consecutivos", () => {
    const client9 = { ...client, version: 9 };
    const client17 = { ...client, version: 17 };
    const branch9 = { ...branch, version: 9 };
    const branch17 = { ...branch, version: 17 };
    const contact9 = { ...contact, version: 9 };
    const contact17 = { ...contact, version: 17 };

    expect(reconcileClient(client, client9)).toBe(client9);
    expect(reconcileClient(client9, client17)).toBe(client17);
    expect(reconcileClient(client17, client9)).toBe(client17);
    expect(reconcileBranch(branch, branch9)).toBe(branch9);
    expect(reconcileBranch(branch9, branch17)).toBe(branch17);
    expect(reconcileBranch(branch17, branch9)).toBe(branch17);
    expect(reconcileContact(contact, contact9)).toBe(contact9);
    expect(reconcileContact(contact9, contact17)).toBe(contact17);
    expect(reconcileContact(contact17, contact9)).toBe(contact17);
  });

  it("conserva la instancia actual ante empate de versión", () => {
    expect(reconcileClient(client, { ...client })).toBe(client);
    expect(reconcileBranch(branch, { ...branch })).toBe(branch);
    expect(reconcileContact(contact, { ...contact })).toBe(contact);
  });
});
