import { EstadoTecnico } from "../../generated/prisma/client.js";
import { seedIds, type SeedClient } from "./constants.js";
import type { SeedIdentity } from "./identity.js";

export interface SeedOrganization {
  technicianIds: Record<string, string>;
  clientIds: Record<string, string>;
  branchIds: Record<string, string>;
}

export async function seedOrganization(
  database: SeedClient,
  identity: SeedIdentity,
): Promise<SeedOrganization> {
  const technicianData = [
    {
      code: "TEC-001",
      fullName: "Alex Rivera Demo",
      specialty: "Redes",
      status: EstadoTecnico.AVAILABLE,
      userId: identity.technicianUserId,
    },
    {
      code: "TEC-002",
      fullName: "Sam Ortega Demo",
      specialty: "Instalaciones",
      status: EstadoTecnico.BUSY,
      userId: null,
    },
    {
      code: "TEC-003",
      fullName: "Dani Flores Demo",
      specialty: "Soporte",
      status: EstadoTecnico.ON_ROUTE,
      userId: null,
    },
  ] as const;

  const technicianIds: Record<string, string> = {};
  for (const item of technicianData) {
    const technician = await database.tecnico.upsert({
      where: { code: item.code },
      update: {
        fullName: item.fullName,
        specialty: item.specialty,
        status: item.status,
        userId: item.userId,
        deletedAt: null,
      },
      create: {
        ...item,
        workEmail: `${item.code.toLowerCase()}@geeksolution.example.test`,
        workPhone: "+504 0000-0000",
        hiredOn: new Date("2026-01-05T00:00:00.000Z"),
      },
    });
    technicianIds[item.code] = technician.id;
  }

  const clientData = [
    {
      code: "CLI-001",
      tradeName: "Comercial Aurora Demo",
      email: "contacto@aurora.example.test",
    },
    {
      code: "CLI-002",
      tradeName: "Centro Horizonte Demo",
      email: "contacto@horizonte.example.test",
    },
  ] as const;

  const clientIds: Record<string, string> = {};
  for (const item of clientData) {
    const client = await database.cliente.upsert({
      where: { code: item.code },
      update: {
        tradeName: item.tradeName,
        email: item.email,
        isActive: true,
        deletedAt: null,
      },
      create: {
        ...item,
        phone: "+504 0000-0000",
        notes: "Cliente ficticio para demostración",
      },
    });
    clientIds[item.code] = client.id;
  }

  const firstClientId = clientIds["CLI-001"];
  const secondClientId = clientIds["CLI-002"];
  if (!firstClientId || !secondClientId) {
    throw new Error("No se pudieron crear los clientes seed");
  }

  const branchData = [
    {
      key: "CLI-001:MAIN",
      clienteId: firstClientId,
      code: "MAIN",
      name: "Sucursal Principal Demo",
      address: "Avenida Ficticia 100, Tegucigalpa",
    },
    {
      key: "CLI-002:MAIN",
      clienteId: secondClientId,
      code: "MAIN",
      name: "Sede Central Demo",
      address: "Boulevard de Prueba 200, Tegucigalpa",
    },
  ] as const;

  const branchIds: Record<string, string> = {};
  for (const item of branchData) {
    const branch = await database.sucursalCliente.upsert({
      where: {
        clienteId_code: { clienteId: item.clienteId, code: item.code },
      },
      update: {
        name: item.name,
        address: item.address,
        isActive: true,
        deletedAt: null,
      },
      create: {
        clienteId: item.clienteId,
        code: item.code,
        name: item.name,
        address: item.address,
        city: "Tegucigalpa",
        region: "Francisco Morazán",
        locationReference: "Ubicación completamente ficticia",
      },
    });
    branchIds[item.key] = branch.id;
  }

  const firstBranchId = branchIds["CLI-001:MAIN"];
  const secondBranchId = branchIds["CLI-002:MAIN"];
  if (!firstBranchId || !secondBranchId) {
    throw new Error("No se pudieron crear las sucursales seed");
  }

  await database.contactoCliente.upsert({
    where: { id: seedIds.contacts.primary },
    update: {
      clienteId: firstClientId,
      sucursalId: firstBranchId,
      fullName: "Contacto Aurora Demo",
      isPrimary: true,
      deletedAt: null,
    },
    create: {
      id: seedIds.contacts.primary,
      clienteId: firstClientId,
      sucursalId: firstBranchId,
      fullName: "Contacto Aurora Demo",
      position: "Coordinación",
      phone: "+504 0000-0001",
      email: "persona@aurora.example.test",
      isPrimary: true,
    },
  });

  await database.contactoCliente.upsert({
    where: { id: seedIds.contacts.secondary },
    update: {
      clienteId: secondClientId,
      sucursalId: secondBranchId,
      fullName: "Contacto Horizonte Demo",
      isPrimary: true,
      deletedAt: null,
    },
    create: {
      id: seedIds.contacts.secondary,
      clienteId: secondClientId,
      sucursalId: secondBranchId,
      fullName: "Contacto Horizonte Demo",
      position: "Administración",
      phone: "+504 0000-0002",
      email: "persona@horizonte.example.test",
      isPrimary: true,
    },
  });

  await database.$queryRaw`
    SELECT setval(
      'tecnico_code_seq',
      GREATEST(
        (SELECT last_value FROM tecnico_code_seq),
        COALESCE((
          SELECT MAX(SUBSTRING("code" FROM 5)::bigint)
          FROM "tecnico"
          WHERE "code" ~ '^TEC-[0-9]+$'
        ), 1)
      ),
      true
    )
  `;
  await database.$queryRaw`
    SELECT setval(
      'cliente_code_seq',
      GREATEST(
        (SELECT last_value FROM cliente_code_seq),
        COALESCE((
          SELECT MAX(SUBSTRING("code" FROM 5)::bigint)
          FROM "cliente"
          WHERE "code" ~ '^CLI-[0-9]+$'
        ), 1)
      ),
      true
    )
  `;

  return { technicianIds, clientIds, branchIds };
}
