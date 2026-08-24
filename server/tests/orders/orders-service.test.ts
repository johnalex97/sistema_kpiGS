import { describe, expect, it, vi } from "vitest";
import { createOrdersService } from "../../src/orders/orders.service.js";
import type {
  OrderDetailRecord,
  OrderFailureKind,
  OrderHistoryRecord,
  OrdersRepository,
  OrderSummaryRecord,
} from "../../src/orders/orders.repository.types.js";
import type {
  AdjustOrderInput,
  AssignmentInput,
  CancelOrderInput,
  CompleteOrderInput,
  CreateOrderInput,
  HistoryFilters,
  MaterialInput,
  OrderActorContext,
  OrderListFilters,
  PauseOrderInput,
  PublicOrderDetail,
  RemoveMaterialInput,
  UnassignmentInput,
  UpdateMaterialInput,
  UpdateOrderInput,
  VersionInput,
} from "../../src/orders/orders.types.js";

const fixedNow = new Date("2026-08-01T12:00:00.000Z");
const orderId = "10000000-0000-4000-8000-000000000001";
const technicianId = "10000000-0000-4000-8000-000000000002";
const supportTechnicianId = "10000000-0000-4000-8000-000000000003";
const unrelatedTechnicianId = "10000000-0000-4000-8000-000000000004";
const usageId = "10000000-0000-4000-8000-000000000005";

const listFilters: OrderListFilters = { page: 2, pageSize: 10 };
const historyFilters: HistoryFilters = { page: 3, pageSize: 5 };
const createInput: CreateOrderInput = {
  branchId: "20000000-0000-4000-8000-000000000001",
  serviceTypeId: "20000000-0000-4000-8000-000000000002",
  priority: "HIGH",
  reportedProblem: "No enciende",
};
const updateInput: UpdateOrderInput = { version: 1, description: "Revisar fuente" };
const assignmentInput: AssignmentInput = { version: 1, technicianId, role: "PRIMARY" };
const unassignmentInput: UnassignmentInput = { version: 1, reason: "Reasignación operativa" };
const versionInput: VersionInput = { version: 1 };
const pauseInput: PauseOrderInput = { version: 1, comment: "Esperando repuesto" };
const completeInput: CompleteOrderInput = {
  version: 1,
  diagnosis: "Fuente dañada",
  result: "Fuente reemplazada",
};
const cancelInput: CancelOrderInput = { version: 1, cancellationReason: "Solicitud del cliente" };
const adjustInput: AdjustOrderInput = { version: 1, reason: "Corrección auditada", result: "Ajustado" };
const materialInput: MaterialInput = {
  version: 1,
  materialId: "30000000-0000-4000-8000-000000000001",
  quantity: "2.000",
};
const updateMaterialInput: UpdateMaterialInput = { version: 1, quantity: "3.000" };
const removeMaterialInput: RemoveMaterialInput = { version: 1 };

function actor(
  permissions: readonly string[],
  linkedTechnicianId: string | null = null,
): OrderActorContext {
  return {
    userId: "40000000-0000-4000-8000-000000000001",
    technicianId: linkedTechnicianId,
    permissions,
    requestId: "request-1",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  };
}

function summaryRecord(): OrderSummaryRecord {
  return {
    id: orderId,
    orderNumber: "OT-001",
    priority: "HIGH",
    status: "ASSIGNED",
    reportedProblem: "No enciende",
    scheduledFor: new Date("2026-08-01T11:00:00.000Z"),
    startedAt: null,
    endedAt: null,
    estimatedMinutes: 60,
    totalMinutes: null,
    createdAt: new Date("2026-08-01T09:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    version: 1,
    sucursal: {
      id: "branch-1",
      code: "MAIN",
      name: "Principal",
      cliente: { id: "client-1", code: "CLI-001", tradeName: "Acme" },
    },
    tipoServicio: { id: "service-1", code: "SUPPORT", name: "Soporte" },
    tecnicos: [
      {
        role: "PRIMARY",
        unassignedAt: null,
        tecnico: { id: technicianId, code: "TEC-001", fullName: "Ana Técnica" },
      },
    ],
    _count: { tecnicos: 1 },
  } as OrderSummaryRecord;
}

function detailRecord(): OrderDetailRecord {
  return {
    ...summaryRecord(),
    description: "Detalle interno",
    diagnosis: null,
    result: null,
    cancellationReason: null,
    tecnicos: [
      {
        role: "PRIMARY",
        assignedAt: new Date("2026-08-01T09:30:00.000Z"),
        unassignedAt: null,
        tecnico: { id: technicianId, code: "TEC-001", fullName: "Ana Técnica" },
      },
    ],
    materiales: [],
  } as OrderDetailRecord;
}

function historyRecord(): OrderHistoryRecord {
  return {
    id: "history-1",
    previousStatus: "PENDING",
    newStatus: "ASSIGNED",
    action: "ORDER_ASSIGNED",
    comment: null,
    occurredAt: new Date("2026-08-01T10:00:00.000Z"),
    metadata: { technicianId },
    usuario: { id: "user-1", displayName: "Supervisión" },
  } as OrderHistoryRecord;
}

function repositoryWithSuccess(): OrdersRepository {
  const detail = detailRecord();
  return {
    listOrders: vi.fn(async () => ({ items: [summaryRecord()], totalItems: 21 })),
    findOrderById: vi.fn(async () => detail),
    listOrderHistory: vi.fn(async () => ({ items: [historyRecord()], totalItems: 11 })),
    createOrder: vi.fn<OrdersRepository["createOrder"]>(async () => ({ kind: "CREATED", order: detail })),
    updateOrder: vi.fn<OrdersRepository["updateOrder"]>(async () => ({ kind: "UPDATED", order: detail })),
    assignTechnician: vi.fn<OrdersRepository["assignTechnician"]>(async () => ({ kind: "UPDATED", order: detail })),
    unassignTechnician: vi.fn<OrdersRepository["unassignTechnician"]>(async () => ({ kind: "UPDATED", order: detail })),
    moveOnRoute: vi.fn<OrdersRepository["moveOnRoute"]>(async () => ({ kind: "UPDATED", order: detail })),
    startOrder: vi.fn<OrdersRepository["startOrder"]>(async () => ({ kind: "UPDATED", order: detail })),
    pauseOrder: vi.fn<OrdersRepository["pauseOrder"]>(async () => ({ kind: "UPDATED", order: detail })),
    resumeOrder: vi.fn<OrdersRepository["resumeOrder"]>(async () => ({ kind: "UPDATED", order: detail })),
    completeOrder: vi.fn<OrdersRepository["completeOrder"]>(async () => ({ kind: "UPDATED", order: detail })),
    cancelOrder: vi.fn<OrdersRepository["cancelOrder"]>(async () => ({ kind: "UPDATED", order: detail })),
    adjustClosedOrder: vi.fn<OrdersRepository["adjustClosedOrder"]>(async () => ({ kind: "UPDATED", order: detail })),
    addOrderMaterial: vi.fn<OrdersRepository["addOrderMaterial"]>(async () => ({ kind: "UPDATED", order: detail })),
    updateOrderMaterial: vi.fn<OrdersRepository["updateOrderMaterial"]>(async () => ({ kind: "UPDATED", order: detail })),
    removeOrderMaterial: vi.fn<OrdersRepository["removeOrderMaterial"]>(async () => ({ kind: "UPDATED", order: detail })),
  };
}

function expectForbidden(operation: Promise<unknown>) {
  return expect(operation).rejects.toMatchObject({
    statusCode: 403,
    code: "FORBIDDEN",
    message: "No tiene permiso para realizar esta acción",
  });
}

describe("OrdersService read authorization", () => {
  it.each([
    ["ADMIN", ["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]],
    ["SUPERVISOR", ["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]],
  ] as const)(
    "uses an ALL scope for %s permissions",
    async (_role, permissions) => {
      const repository = repositoryWithSuccess();
      const service = createOrdersService(repository, () => fixedNow);

      const result = await service.listOrders(listFilters, actor(permissions));

      expect(repository.listOrders).toHaveBeenCalledWith(
        listFilters,
        { kind: "ALL" },
        fixedNow,
      );
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 10,
        totalItems: 21,
        totalPages: 3,
      });
      expect(result.items[0]).toMatchObject({
        id: orderId,
        scheduledFor: "2026-08-01T11:00:00.000Z",
      });
      expect(result.items[0]).not.toHaveProperty("sucursal");
    },
  );

  it("uses a linked technician scope for own reads", async () => {
    const repository = repositoryWithSuccess();
    const service = createOrdersService(repository, () => fixedNow);
    const technicianActor = actor(["ORDERS_VIEW_OWN"], technicianId);

    await service.listOrders(listFilters, technicianActor);
    const detail = await service.getOrder(orderId, technicianActor);
    const history = await service.listOrderHistory(
      orderId,
      historyFilters,
      technicianActor,
    );

    const scope = { kind: "TECHNICIAN", technicianId };
    expect(repository.listOrders).toHaveBeenCalledWith(listFilters, scope, fixedNow);
    expect(repository.findOrderById).toHaveBeenCalledWith(orderId, scope);
    expect(repository.listOrderHistory).toHaveBeenCalledWith(
      orderId,
      historyFilters,
      scope,
    );
    expect(detail).not.toHaveProperty("tecnicos");
    expect(history).toEqual({
      items: [
        {
          id: "history-1",
          previousStatus: "PENDING",
          newStatus: "ASSIGNED",
          action: "ORDER_ASSIGNED",
          comment: null,
          occurredAt: "2026-08-01T10:00:00.000Z",
          metadata: { technicianId },
          user: { id: "user-1", displayName: "Supervisión" },
        },
      ],
      pagination: { page: 3, pageSize: 5, totalItems: 11, totalPages: 3 },
    });
  });

  it("reports zero pages for an empty order list", async () => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.listOrders).mockResolvedValueOnce({
      items: [],
      totalItems: 0,
    });
    const service = createOrdersService(repository, () => fixedNow);

    const result = await service.listOrders(
      listFilters,
      actor(["ORDERS_VIEW_ALL"]),
    );

    expect(result.pagination.totalPages).toBe(0);
  });

  it("denies an own-read actor without a linked technician before repository access", async () => {
    const repository = repositoryWithSuccess();
    const service = createOrdersService(repository, () => fixedNow);

    await expectForbidden(
      service.listOrders(listFilters, actor(["ORDERS_VIEW_OWN"])),
    );

    expect(repository.listOrders).not.toHaveBeenCalled();
  });

  it("denies own history without a linked technician before repository access", async () => {
    const repository = repositoryWithSuccess();
    const service = createOrdersService(repository, () => fixedNow);

    await expectForbidden(
      service.listOrderHistory(
        orderId,
        historyFilters,
        actor(["ORDERS_VIEW_OWN"]),
      ),
    );

    expect(repository.listOrderHistory).not.toHaveBeenCalled();
  });

  it("denies reads when neither read permission is present", async () => {
    const repository = repositoryWithSuccess();
    const service = createOrdersService(repository, () => fixedNow);

    await expectForbidden(service.getOrder(orderId, actor(["ORDERS_OPERATE_OWN"], technicianId)));

    expect(repository.findOrderById).not.toHaveBeenCalled();
  });

  it.each(["detail", "history"])(
    "returns ORDER_NOT_FOUND when scoped %s is unavailable",
    async (readKind) => {
      const repository = repositoryWithSuccess();
      vi.mocked(repository.findOrderById).mockResolvedValueOnce(null);
      vi.mocked(repository.listOrderHistory).mockResolvedValueOnce(null);
      const service = createOrdersService(repository, () => fixedNow);
      const readActor = actor(["ORDERS_VIEW_OWN"], unrelatedTechnicianId);

      const operation = readKind === "detail"
        ? service.getOrder(orderId, readActor)
        : service.listOrderHistory(orderId, historyFilters, readActor);

      await expect(operation).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "La orden solicitada no existe",
      });
    },
  );
});

type AuthorizedOperation = (
  service: ReturnType<typeof createOrdersService>,
  operationActor: OrderActorContext,
) => Promise<PublicOrderDetail>;

const mutationMethodNames = [
  "createOrder",
  "updateOrder",
  "assignTechnician",
  "unassignTechnician",
  "moveOnRoute",
  "startOrder",
  "pauseOrder",
  "resumeOrder",
  "completeOrder",
  "cancelOrder",
  "adjustClosedOrder",
  "addOrderMaterial",
  "updateOrderMaterial",
  "removeOrderMaterial",
] as const satisfies readonly (keyof OrdersRepository)[];

type MutationMethodName = (typeof mutationMethodNames)[number];

interface MutationScenario {
  name: string;
  method: MutationMethodName;
  invoke: AuthorizedOperation;
  assertCall(
    repository: OrdersRepository,
    operationActor: OrderActorContext,
  ): void;
}

function expectNoMutationCalls(repository: OrdersRepository): void {
  for (const method of mutationMethodNames) {
    expect(repository[method]).not.toHaveBeenCalled();
  }
}

function expectOnlyMutationCalled(
  repository: OrdersRepository,
  expectedMethod: MutationMethodName,
): void {
  for (const method of mutationMethodNames) {
    if (method === expectedMethod) {
      expect(repository[method]).toHaveBeenCalledTimes(1);
    } else {
      expect(repository[method]).not.toHaveBeenCalled();
    }
  }
}

const managementOperations: MutationScenario[] = [
  {
    name: "create",
    method: "createOrder",
    invoke: (service, operationActor) =>
      service.createOrder(createInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.createOrder).toHaveBeenCalledWith(
        createInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "update",
    method: "updateOrder",
    invoke: (service, operationActor) =>
      service.updateOrder(orderId, updateInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.updateOrder).toHaveBeenCalledWith(
        orderId,
        updateInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "assign",
    method: "assignTechnician",
    invoke: (service, operationActor) =>
      service.assignTechnician(orderId, assignmentInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.assignTechnician).toHaveBeenCalledWith(
        orderId,
        assignmentInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "unassign",
    method: "unassignTechnician",
    invoke: (service, operationActor) =>
      service.unassignTechnician(
        orderId,
        technicianId,
        unassignmentInput,
        operationActor,
      ),
    assertCall: (repository, operationActor) => {
      expect(repository.unassignTechnician).toHaveBeenCalledWith(
        orderId,
        technicianId,
        unassignmentInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "cancel",
    method: "cancelOrder",
    invoke: (service, operationActor) =>
      service.cancelOrder(orderId, cancelInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.cancelOrder).toHaveBeenCalledWith(
        orderId,
        cancelInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "adjust",
    method: "adjustClosedOrder",
    invoke: (service, operationActor) =>
      service.adjustClosedOrder(orderId, adjustInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.adjustClosedOrder).toHaveBeenCalledWith(
        orderId,
        adjustInput,
        operationActor,
        fixedNow,
      );
    },
  },
];

const operationalCommands: MutationScenario[] = [
  {
    name: "move on route",
    method: "moveOnRoute",
    invoke: (service, operationActor) =>
      service.moveOnRoute(orderId, versionInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.moveOnRoute).toHaveBeenCalledWith(
        orderId,
        versionInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "start",
    method: "startOrder",
    invoke: (service, operationActor) =>
      service.startOrder(orderId, versionInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.startOrder).toHaveBeenCalledWith(
        orderId,
        versionInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "pause",
    method: "pauseOrder",
    invoke: (service, operationActor) =>
      service.pauseOrder(orderId, pauseInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.pauseOrder).toHaveBeenCalledWith(
        orderId,
        pauseInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "resume",
    method: "resumeOrder",
    invoke: (service, operationActor) =>
      service.resumeOrder(orderId, versionInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.resumeOrder).toHaveBeenCalledWith(
        orderId,
        versionInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "complete",
    method: "completeOrder",
    invoke: (service, operationActor) =>
      service.completeOrder(orderId, completeInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.completeOrder).toHaveBeenCalledWith(
        orderId,
        completeInput,
        operationActor,
        fixedNow,
      );
    },
  },
];

const materialOperations: MutationScenario[] = [
  {
    name: "add",
    method: "addOrderMaterial",
    invoke: (service, operationActor) =>
      service.addOrderMaterial(orderId, materialInput, operationActor),
    assertCall: (repository, operationActor) => {
      expect(repository.addOrderMaterial).toHaveBeenCalledWith(
        orderId,
        materialInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "update",
    method: "updateOrderMaterial",
    invoke: (service, operationActor) =>
      service.updateOrderMaterial(
        orderId,
        usageId,
        updateMaterialInput,
        operationActor,
      ),
    assertCall: (repository, operationActor) => {
      expect(repository.updateOrderMaterial).toHaveBeenCalledWith(
        orderId,
        usageId,
        updateMaterialInput,
        operationActor,
        fixedNow,
      );
    },
  },
  {
    name: "remove",
    method: "removeOrderMaterial",
    invoke: (service, operationActor) =>
      service.removeOrderMaterial(
        orderId,
        usageId,
        removeMaterialInput,
        operationActor,
      ),
    assertCall: (repository, operationActor) => {
      expect(repository.removeOrderMaterial).toHaveBeenCalledWith(
        orderId,
        usageId,
        removeMaterialInput,
        operationActor,
        fixedNow,
      );
    },
  },
];

describe("OrdersService mutation authorization", () => {
  it.each(managementOperations)(
    "requires ORDERS_MANAGE to $name",
    async (scenario) => {
      const deniedRepository = repositoryWithSuccess();
      const deniedService = createOrdersService(
        deniedRepository,
        () => fixedNow,
      );

      await expectForbidden(
        scenario.invoke(
          deniedService,
          actor(["ORDERS_OPERATE_OWN"], technicianId),
        ),
      );
      expectNoMutationCalls(deniedRepository);

      const repository = repositoryWithSuccess();
      const service = createOrdersService(repository, () => fixedNow);
      const manager = actor(["ORDERS_MANAGE"]);
      const result = await scenario.invoke(service, manager);

      scenario.assertCall(repository, manager);
      expectOnlyMutationCalled(repository, scenario.method);
      expect(result).not.toHaveProperty("sucursal");
      expect(result).not.toHaveProperty("tecnicos");
    },
  );

  it.each(operationalCommands)(
    "requires ORDERS_OPERATE_OWN and a linked technician to $name",
    async (scenario) => {
      const deniedActors = [
        actor(["ORDERS_MANAGE"]),
        actor(["ORDERS_OPERATE_OWN"]),
      ];
      for (const deniedActor of deniedActors) {
        const deniedRepository = repositoryWithSuccess();
        const deniedService = createOrdersService(
          deniedRepository,
          () => fixedNow,
        );

        await expectForbidden(scenario.invoke(deniedService, deniedActor));
        expectNoMutationCalls(deniedRepository);
      }

      const repository = repositoryWithSuccess();
      const service = createOrdersService(repository, () => fixedNow);
      const technicianActor = actor(["ORDERS_OPERATE_OWN"], technicianId);

      const result = await scenario.invoke(service, technicianActor);

      scenario.assertCall(repository, technicianActor);
      expectOnlyMutationCalled(repository, scenario.method);
      expect(result.id).toBe(orderId);
    },
  );

  it.each(materialOperations)(
    "allows ORDERS_MANAGE or linked ORDERS_OPERATE_OWN to $name a material",
    async (scenario) => {
      const deniedActors = [
        actor([]),
        actor(["ORDERS_OPERATE_OWN"]),
      ];
      for (const deniedActor of deniedActors) {
        const deniedRepository = repositoryWithSuccess();
        const deniedService = createOrdersService(
          deniedRepository,
          () => fixedNow,
        );

        await expectForbidden(scenario.invoke(deniedService, deniedActor));
        expectNoMutationCalls(deniedRepository);
      }

      const managerRepository = repositoryWithSuccess();
      const managerService = createOrdersService(
        managerRepository,
        () => fixedNow,
      );
      const manager = actor(["ORDERS_MANAGE"]);
      await expect(
        scenario.invoke(managerService, manager),
      ).resolves.toMatchObject({ id: orderId });
      scenario.assertCall(managerRepository, manager);
      expectOnlyMutationCalled(managerRepository, scenario.method);

      const technicianRepository = repositoryWithSuccess();
      const technicianService = createOrdersService(
        technicianRepository,
        () => fixedNow,
      );
      const technicianActor = actor(["ORDERS_OPERATE_OWN"], technicianId);
      await expect(
        scenario.invoke(technicianService, technicianActor),
      ).resolves.toMatchObject({ id: orderId });
      scenario.assertCall(technicianRepository, technicianActor);
      expectOnlyMutationCalled(technicianRepository, scenario.method);
    },
  );

  it.each([
    ["support", supportTechnicianId],
    ["unrelated", unrelatedTechnicianId],
  ])(
    "translates the repository ownership rejection for a %s technician",
    async (_relationship, linkedTechnicianId) => {
      const repository = repositoryWithSuccess();
      vi.mocked(repository.moveOnRoute).mockResolvedValueOnce({
        kind: "TECHNICIAN_NOT_ASSIGNED",
      });
      const service = createOrdersService(repository, () => fixedNow);
      const technicianActor = actor(
        ["ORDERS_OPERATE_OWN"],
        linkedTechnicianId,
      );

      await expect(
        service.moveOnRoute(
          orderId,
          versionInput,
          technicianActor,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "TECHNICIAN_NOT_ASSIGNED",
        message: "El técnico no puede operar esta orden",
      });
      expect(repository.moveOnRoute).toHaveBeenCalledWith(
        orderId,
        versionInput,
        technicianActor,
        fixedNow,
      );
      expectOnlyMutationCalled(repository, "moveOnRoute");
    },
  );
});

const failureCases: Array<
  [OrderFailureKind, number, string]
> = [
  ["ORDER_NOT_FOUND", 404, "La orden solicitada no existe"],
  ["ASSIGNMENT_NOT_FOUND", 404, "La asignación solicitada no existe"],
  ["MATERIAL_USAGE_NOT_FOUND", 404, "El material utilizado no existe"],
  ["MATERIAL_NOT_FOUND", 404, "El material solicitado no existe"],
  ["VERSION_CONFLICT", 409, "La orden fue modificada por otro usuario"],
  ["INVALID_ORDER_TRANSITION", 409, "La transición de estado no es válida"],
  ["PRIMARY_TECHNICIAN_REQUIRED", 409, "La orden requiere un técnico principal"],
  ["TECHNICIAN_NOT_ASSIGNED", 409, "El técnico no puede operar esta orden"],
  ["TECHNICIAN_BUSY", 409, "El técnico ya tiene otro trabajo operativo"],
  ["RESOURCE_INACTIVE", 409, "El recurso relacionado está inactivo"],
  ["ORDER_CLOSED", 409, "La orden está cerrada"],
  ["MATERIAL_COST_UNAVAILABLE", 409, "El material no tiene costo de referencia"],
  ["ORDER_PRODUCTIVE_TIME_REQUIRED", 422, "La orden requiere tiempo productivo de al menos un técnico"],
];

describe("OrdersService public failures", () => {
  it.each(failureCases)(
    "maps %s without exposing repository outcomes",
    async (kind, statusCode, message) => {
      const repository = repositoryWithSuccess();
      vi.mocked(repository.updateOrder).mockResolvedValueOnce({ kind });
      const service = createOrdersService(repository, () => fixedNow);

      const operation = service.updateOrder(
        orderId,
        updateInput,
        actor(["ORDERS_MANAGE"]),
      );

      await expect(operation).rejects.toMatchObject({
        name: "ApiError",
        statusCode,
        code: kind,
        message,
      });
    },
  );

  it("maps an invalid temporal range to the public validation contract", async () => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.adjustClosedOrder).mockResolvedValueOnce({
      kind: "INVALID_TEMPORAL_RANGE",
    });
    const service = createOrdersService(repository, () => fixedNow);

    await expect(
      service.adjustClosedOrder(orderId, adjustInput, actor(["ORDERS_MANAGE"])),
    ).rejects.toMatchObject({
      name: "ApiError",
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });
});
