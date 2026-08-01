import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import {
  branchListQuerySchema,
  branchParamsSchema,
  clientDetailQuerySchema,
  clientIdSchema,
  clientListQuerySchema,
  contactListQuerySchema,
  contactParamsSchema,
  createBranchSchema,
  createClientSchema,
  createContactSchema,
  lifecycleSchema,
  updateBranchSchema,
  updateClientSchema,
  updateContactSchema,
} from "./clients.schemas.js";
import type { ClientsService } from "./clients.service.js";

function validationError(error: ZodError): ApiError {
  return new ApiError(
    400,
    "Los datos enviados no son válidos",
    "VALIDATION_ERROR",
    error.issues.map((issue) => ({
      field: issue.path.join("."),
      code: "VALIDATION_ERROR",
      message: issue.message,
    })),
  );
}

function actor(request: Request) {
  return {
    userId: request.auth!.userId,
    requestId: request.requestId,
    ipAddress: request.ip || null,
    userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
  };
}

function success(
  request: Request,
  response: Response,
  status: number,
  message: string,
  data: unknown,
) {
  response.status(status).json({
    success: true,
    message,
    data,
    errors: [],
    meta: { requestId: request.requestId },
  });
}

export function createClientsController(service: ClientsService) {
  const parse = <T>(
    result: { success: true; data: T } | { success: false; error: ZodError },
  ): T => {
    if (!result.success) throw validationError(result.error);
    return result.data;
  };

  return {
    listClients: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parse(clientListQuerySchema.safeParse(req.query));
        success(req, res, 200, "Clientes consultados", await service.listClients(query));
      } catch (error) { next(error); }
    },
    getClient: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const { includeInactive } = parse(clientDetailQuerySchema.safeParse(req.query));
        success(req, res, 200, "Cliente consultado", await service.getClient(clientId, includeInactive));
      } catch (error) { next(error); }
    },
    createClient: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parse(createClientSchema.safeParse(req.body));
        success(req, res, 201, "Cliente creado", await service.createClient(body, actor(req)));
      } catch (error) { next(error); }
    },
    updateClient: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const body = parse(updateClientSchema.safeParse(req.body));
        success(req, res, 200, "Cliente actualizado", await service.updateClient(clientId, body, actor(req)));
      } catch (error) { next(error); }
    },
    deactivateClient: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const body = parse(lifecycleSchema.safeParse(req.body));
        success(req, res, 200, "Cliente desactivado", await service.deactivateClient(clientId, body, actor(req)));
      } catch (error) { next(error); }
    },
    reactivateClient: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const body = parse(lifecycleSchema.safeParse(req.body));
        success(req, res, 200, "Cliente reactivado", await service.reactivateClient(clientId, body, actor(req)));
      } catch (error) { next(error); }
    },
    listBranches: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const query = parse(branchListQuerySchema.safeParse(req.query));
        success(req, res, 200, "Sucursales consultadas", await service.listBranches(clientId, query));
      } catch (error) { next(error); }
    },
    createBranch: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const body = parse(createBranchSchema.safeParse(req.body));
        success(req, res, 201, "Sucursal creada", await service.createBranch(clientId, body, actor(req)));
      } catch (error) { next(error); }
    },
    updateBranch: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId, branchId } = parse(branchParamsSchema.safeParse(req.params));
        const body = parse(updateBranchSchema.safeParse(req.body));
        success(req, res, 200, "Sucursal actualizada", await service.updateBranch(clientId, branchId, body, actor(req)));
      } catch (error) { next(error); }
    },
    deactivateBranch: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId, branchId } = parse(branchParamsSchema.safeParse(req.params));
        const body = parse(lifecycleSchema.safeParse(req.body));
        success(req, res, 200, "Sucursal desactivada", await service.deactivateBranch(clientId, branchId, body, actor(req)));
      } catch (error) { next(error); }
    },
    reactivateBranch: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId, branchId } = parse(branchParamsSchema.safeParse(req.params));
        const body = parse(lifecycleSchema.safeParse(req.body));
        success(req, res, 200, "Sucursal reactivada", await service.reactivateBranch(clientId, branchId, body, actor(req)));
      } catch (error) { next(error); }
    },
    listContacts: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const query = parse(contactListQuerySchema.safeParse(req.query));
        success(req, res, 200, "Contactos consultados", await service.listContacts(clientId, query));
      } catch (error) { next(error); }
    },
    createContact: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId } = parse(clientIdSchema.safeParse(req.params));
        const body = parse(createContactSchema.safeParse(req.body));
        success(req, res, 201, "Contacto creado", await service.createContact(clientId, body, actor(req)));
      } catch (error) { next(error); }
    },
    updateContact: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId, contactId } = parse(contactParamsSchema.safeParse(req.params));
        const body = parse(updateContactSchema.safeParse(req.body));
        success(req, res, 200, "Contacto actualizado", await service.updateContact(clientId, contactId, body, actor(req)));
      } catch (error) { next(error); }
    },
    deactivateContact: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId, contactId } = parse(contactParamsSchema.safeParse(req.params));
        const body = parse(lifecycleSchema.safeParse(req.body));
        success(req, res, 200, "Contacto desactivado", await service.deactivateContact(clientId, contactId, body, actor(req)));
      } catch (error) { next(error); }
    },
    reactivateContact: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { clientId, contactId } = parse(contactParamsSchema.safeParse(req.params));
        const body = parse(lifecycleSchema.safeParse(req.body));
        success(req, res, 200, "Contacto reactivado", await service.reactivateContact(clientId, contactId, body, actor(req)));
      } catch (error) { next(error); }
    },
  };
}
