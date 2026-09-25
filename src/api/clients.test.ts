import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientsApi } from "./clients";
import type {
  ClientBranch,
  ClientContact,
  ClientDetail,
  ClientPage,
  BranchPage,
  ContactPage,
  CreateClientInput,
  CreateBranchInput,
  CreateContactInput,
} from "../models/client";

function jsonResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const branch: ClientBranch = {
  id: "branch-1", clientId: "client-1", code: "SUC-001", name: "Centro",
  address: "Avenida Principal", city: "Tegucigalpa", region: "Francisco Morazán",
  country: "HN", lat: null, long: null, locationReference: null,
  isActive: true, isEffectivelyActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1,
};
const contact: ClientContact = {
  id: "contact-1", clientId: "client-1", branchId: "branch-1", scope: "BRANCH",
  branchName: "Centro", fullName: "Ana López", position: null, phone: null,
  email: "ana@example.com", isPrimary: true, isActive: true, isEffectivelyActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1,
};
const detail: ClientDetail = {
  id: "client-1", code: "CLI-001", tradeName: "Acme", legalName: null,
  taxId: null, phone: null, email: null, isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1,
  notes: null, branches: [branch], contacts: [contact],
};
const pagination = { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 };
const clientPage: ClientPage = {
  items: [{
    id: detail.id, code: detail.code, tradeName: detail.tradeName, legalName: detail.legalName,
    taxId: detail.taxId, phone: detail.phone, email: detail.email, isActive: detail.isActive,
    createdAt: detail.createdAt, updatedAt: detail.updatedAt, version: detail.version,
    activeBranchCount: 1, activeContactCount: 1,
  }],
  pagination,
};
const branchPage: BranchPage = { items: [branch], pagination };
const contactPage: ContactPage = { items: [contact], pagination };

const createClientInput: CreateClientInput = {
  tradeName: "Acme", mainBranch: { name: "Centro", address: "Avenida Principal", country: "HN" },
  primaryContact: { fullName: "Ana López", scope: "MAIN_BRANCH" },
};
const createBranchInput: CreateBranchInput = { name: "Centro", address: "Avenida Principal", country: "HN" };
const createContactInput: CreateContactInput = { fullName: "Ana López", scope: "BRANCH", branchId: "branch-1", isPrimary: true };
const lifecycleInput = { version: 9, reason: "Cierre solicitado" };

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("createClientsApi", () => {
  it("serializa los filtros de clientes y fuerza includeInactive para inactivos", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(clientPage));

    await expect(createClientsApi().listClients({
      search: "  Acme  ", isActive: false, includeInactive: false, page: 2, pageSize: 20,
    })).resolves.toEqual(clientPage);

    const [url, init] = fetchMock.mock.calls.slice(-1)[0]!;
    expect(String(url)).toBe("http://localhost:4000/api/v1/clients?search=Acme&isActive=false&includeInactive=true&page=2&pageSize=20");
    expect(init).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("omite búsqueda vacía y filtros undefined sin perder paginación", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(clientPage));
    await createClientsApi().listClients({ search: "   ", includeInactive: false, page: 1, pageSize: 10 });
    const [url] = fetchMock.mock.calls.slice(-1)[0]!;
    expect(String(url)).toBe("http://localhost:4000/api/v1/clients?includeInactive=false&page=1&pageSize=10");
  });

  it("consulta detalle con ID codificado, includeInactive y señal", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(detail));
    const signal = new AbortController().signal;
    await expect(createClientsApi().getClient("client/1", true, signal)).resolves.toEqual(detail);
    const [url, init] = fetchMock.mock.calls.slice(-1)[0]!;
    expect(String(url)).toBe("http://localhost:4000/api/v1/clients/client%2F1?includeInactive=true");
    expect(init).toMatchObject({ method: "GET", credentials: "include", signal });
  });

  it("filtra sucursales por ciudad y región, con señal", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(branchPage));
    const signal = new AbortController().signal;
    await expect(createClientsApi().listBranches("client-1", {
      search: "   ", city: " Tegucigalpa ", region: " Francisco Morazán ",
      includeInactive: false, page: 2, pageSize: 20,
    }, signal)).resolves.toEqual(branchPage);
    const [url, init] = fetchMock.mock.calls.slice(-1)[0]!;
    expect(String(url)).toBe("http://localhost:4000/api/v1/clients/client-1/branches?includeInactive=false&page=2&pageSize=20&city=Tegucigalpa&region=Francisco+Moraz%C3%A1n");
    expect(init).toMatchObject({ method: "GET", credentials: "include", signal });
  });

  it("filtra contactos por sucursal y alcance", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(contactPage));
    await expect(createClientsApi().listContacts("client-1", {
      branchId: "branch-1", scope: "BRANCH", includeInactive: false, page: 2, pageSize: 20,
    })).resolves.toEqual(contactPage);
    const [url, init] = fetchMock.mock.calls.slice(-1)[0]!;
    expect(String(url)).toBe("http://localhost:4000/api/v1/clients/client-1/contacts?includeInactive=false&page=2&pageSize=20&branchId=branch-1&scope=BRANCH");
    expect(init).toMatchObject({ method: "GET", credentials: "include" });
  });

  const mutationCases = [
    ["createClient", "/clients", "POST", createClientInput, () => createClientsApi().createClient(createClientInput), detail],
    ["updateClient", "/clients/client-1", "PATCH", { version: 1, tradeName: "Acme 2" }, () => createClientsApi().updateClient("client-1", { version: 1, tradeName: "Acme 2" }), detail],
    ["deactivateClient", "/clients/client-1", "DELETE", lifecycleInput, () => createClientsApi().deactivateClient("client-1", lifecycleInput), detail],
    ["reactivateClient", "/clients/client-1/reactivate", "POST", lifecycleInput, () => createClientsApi().reactivateClient("client-1", lifecycleInput), detail],
    ["createBranch", "/clients/client-1/branches", "POST", createBranchInput, () => createClientsApi().createBranch("client-1", createBranchInput), branch],
    ["updateBranch", "/clients/client-1/branches/branch-1", "PATCH", { version: 1, name: "Norte" }, () => createClientsApi().updateBranch("client-1", "branch-1", { version: 1, name: "Norte" }), branch],
    ["deactivateBranch", "/clients/client-1/branches/branch-1", "DELETE", lifecycleInput, () => createClientsApi().deactivateBranch("client-1", "branch-1", lifecycleInput), branch],
    ["reactivateBranch", "/clients/client-1/branches/branch-1/reactivate", "POST", lifecycleInput, () => createClientsApi().reactivateBranch("client-1", "branch-1", lifecycleInput), branch],
    ["createContact", "/clients/client-1/contacts", "POST", createContactInput, () => createClientsApi().createContact("client-1", createContactInput), contact],
    ["updateContact", "/clients/client-1/contacts/contact-1", "PATCH", { version: 1, fullName: "Ana García" }, () => createClientsApi().updateContact("client-1", "contact-1", { version: 1, fullName: "Ana García" }), contact],
    ["deactivateContact", "/clients/client-1/contacts/contact-1", "DELETE", lifecycleInput, () => createClientsApi().deactivateContact("client-1", "contact-1", lifecycleInput), contact],
    ["reactivateContact", "/clients/client-1/contacts/contact-1/reactivate", "POST", lifecycleInput, () => createClientsApi().reactivateContact("client-1", "contact-1", lifecycleInput), contact],
  ] as const;

  it.each(mutationCases)("envía ruta, método, credenciales y cuerpo de %s", async (_name, path, method, body, invoke, result) => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(result));
    await expect(invoke()).resolves.toEqual(result);
    const [url, init] = fetchMock.mock.calls.slice(-1)[0]!;
    expect(String(url)).toBe(`http://localhost:4000/api/v1${path}`);
    expect(init).toMatchObject({ method, credentials: "include" });
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("codifica cada ID en rutas anidadas de mutación", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(contact));
    await createClientsApi().updateContact("client/1", "contact/1", { version: 1 });
    const [url] = fetchMock.mock.calls.slice(-1)[0]!;
    expect(String(url)).toBe("http://localhost:4000/api/v1/clients/client%2F1/contacts/contact%2F1");
  });
});
