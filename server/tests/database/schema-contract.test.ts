import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";

const requiredModels = [
  "Usuario",
  "Rol",
  "Permiso",
  "UsuarioRol",
  "RolPermiso",
  "Tecnico",
  "Cliente",
  "SucursalCliente",
  "ContactoCliente",
  "TipoServicio",
  "TipoActividad",
  "OrdenTrabajo",
  "OrdenTecnico",
  "HistorialOrden",
  "OrdenRelacionada",
  "Actividad",
  "ActividadTecnico",
  "PausaActividad",
  "Material",
  "MaterialUtilizado",
  "CausaReincidencia",
  "Reincidencia",
  "ReincidenciaOrden",
  "ReincidenciaTecnico",
  "Evidencia",
  "ConfiguracionKPI",
  "MetaTecnico",
  "ResultadoKPI",
  "Auditoria",
  "Notificacion",
] as const;

describe("Prisma schema contract", () => {
  it("generates a client for every approved relational model", () => {
    for (const model of requiredModels) {
      expect(Object.values(Prisma.ModelName)).toContain(model);
    }
  });
});
