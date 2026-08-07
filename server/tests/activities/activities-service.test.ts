import { describe, expect, it, vi } from "vitest";
import { createActivitiesService } from "../../src/activities/activities.service.js";
import type {
  ActivitiesRepository,
  ActivityDetailRecord,
  ActivityFailureKind,
  ActivitySummaryRecord,
  ActivityTypeRecord,
} from "../../src/activities/activities.repository.types.js";
import type {
  ActivityActorContext,
  ActivityListFilters,
  AdjustActivityInput,
  CancelActivityInput,
  CompleteActivityInput,
  CreateActivityInput,
  ManualActivityInput,
  PauseActivityInput,
  ReplaceActivityTeamInput,
  UpdateActivityInput,
} from "../../src/activities/activities.types.js";

const fixedNow = new Date("2026-08-07T12:00:00.000Z");
const activityId = "10000000-0000-4000-8000-000000000001";
const foreignActivityId = "10000000-0000-4000-8000-000000000004";
const missingActivityId = "10000000-0000-4000-8000-000000000005";
const technicianId = "10000000-0000-4000-8000-000000000002";
const otherTechnicianId = "10000000-0000-4000-8000-000000000003";

const listFilters: ActivityListFilters = { page: 2, pageSize: 10 };
const createInput: CreateActivityInput = {
  branchId: "20000000-0000-4000-8000-000000000001",
  activityTypeId: "20000000-0000-4000-8000-000000000002",
  description: "Revisar equipo",
};
const manualInput: ManualActivityInput = {
  ...createInput,
  startedAt: new Date("2026-08-07T10:00:00.000Z"),
  endedAt: new Date("2026-08-07T11:00:00.000Z"),
  result: "Equipo operativo",
  justification: "Registro de visita previa",
};
const updateInput: UpdateActivityInput = { version: 1, description: "Revisar fuente" };
const teamInput: ReplaceActivityTeamInput = {
  version: 1,
  team: [{ technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
};
const versionInput = { version: 1 };
const pauseInput: PauseActivityInput = { version: 1, reason: "Esperando repuesto" };
const completeInput: CompleteActivityInput = { version: 1, result: "Completado" };
const cancelInput: CancelActivityInput = { version: 1, reason: "Solicitud del cliente" };
const adjustInput: AdjustActivityInput = { version: 1, reason: "Corrección auditada" };

function actor(
  permissions: string[],
  linkedTechnicianId: string | null = null,
): ActivityActorContext {
  return {
    userId: "40000000-0000-4000-8000-000000000001",
    technicianId: linkedTechnicianId,
    permissions,
    requestId: "request-1",
  };
}

function activityType(): ActivityTypeRecord {
  return { id: "type-1", code: "SUPPORT", name: "Soporte", description: null, displayOrder: 1 } as ActivityTypeRecord;
}

function summary(): ActivitySummaryRecord {
  return {
    id: activityId,
    status: "PENDING",
    description: "Revisar equipo",
    result: null,
    startedAt: null,
    endedAt: null,
    pausedMinutes: 0,
    productiveMinutes: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    version: 1,
    sucursal: { id: "branch-1", code: "MAIN", name: "Principal", cliente: { id: "client-1", code: "CLI-001", tradeName: "Acme" } },
    orden: null,
    tipoActividad: activityType(),
    tecnicos: [{ tecnico: { id: technicianId, code: "TEC-001", fullName: "Ana Técnica" } }],
  } as ActivitySummaryRecord;
}

function detail(): ActivityDetailRecord {
  return {
    ...summary(),
    observations: null,
    tecnicos: [{
      role: "RESPONSIBLE",
      participationPercentage: { toFixed: () => "100.00" },
      startedAt: null,
      endedAt: null,
      tecnico: { id: technicianId, code: "TEC-001", fullName: "Ana Técnica" },
    }],
    pausas: [],
  } as unknown as ActivityDetailRecord;
}

function repositoryWithSuccess(): ActivitiesRepository {
  const record = detail();
  return {
    listActivityTypes: vi.fn(async () => [activityType()]),
    listActivities: vi.fn(async () => ({ items: [summary()], totalItems: 21 })),
    findActivityById: vi.fn(async () => record),
    createActivity: vi.fn<ActivitiesRepository["createActivity"]>(async () => ({ kind: "CREATED", activity: record })),
    createManualActivity: vi.fn<ActivitiesRepository["createManualActivity"]>(async () => ({ kind: "CREATED", activity: record })),
    updateActivity: vi.fn<ActivitiesRepository["updateActivity"]>(async () => ({ kind: "UPDATED", activity: record })),
    replaceActivityTeam: vi.fn<ActivitiesRepository["replaceActivityTeam"]>(async () => ({ kind: "UPDATED", activity: record })),
    startActivity: vi.fn<ActivitiesRepository["startActivity"]>(async () => ({ kind: "UPDATED", activity: record })),
    pauseActivity: vi.fn<ActivitiesRepository["pauseActivity"]>(async () => ({ kind: "UPDATED", activity: record })),
    resumeActivity: vi.fn<ActivitiesRepository["resumeActivity"]>(async () => ({ kind: "UPDATED", activity: record })),
    completeActivity: vi.fn<ActivitiesRepository["completeActivity"]>(async () => ({ kind: "UPDATED", activity: record })),
    cancelActivity: vi.fn<ActivitiesRepository["cancelActivity"]>(async () => ({ kind: "UPDATED", activity: record })),
    adjustCompletedActivity: vi.fn<ActivitiesRepository["adjustCompletedActivity"]>(async () => ({ kind: "UPDATED", activity: record })),
  };
}

function expectForbidden(operation: Promise<unknown>) {
  return expect(operation).rejects.toMatchObject({
    name: "ApiError",
    statusCode: 403,
    code: "FORBIDDEN",
    message: "No tiene permiso para realizar esta acción",
  });
}

function expectActivityNotFound(operation: Promise<unknown>) {
  return expect(operation).rejects.toMatchObject({
    name: "ApiError",
    statusCode: 404,
    code: "ACTIVITY_NOT_FOUND",
    message: "La actividad solicitada no existe",
  });
}

const mutationMethods = [
  "createActivity", "createManualActivity", "updateActivity", "replaceActivityTeam",
  "startActivity", "pauseActivity", "resumeActivity", "completeActivity",
  "cancelActivity", "adjustCompletedActivity",
] as const satisfies readonly (keyof ActivitiesRepository)[];

function expectNoMutationCalls(repository: ActivitiesRepository): void {
  for (const method of mutationMethods) expect(repository[method]).not.toHaveBeenCalled();
}

describe("ActivitiesService reads", () => {
  it("delegates catalog and all reads with an ALL scope", async () => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository, () => fixedNow);
    const manager = actor(["ACTIVITIES_VIEW_ALL", "ACTIVITIES_MANAGE"]);

    await expect(service.listActivityTypes(manager)).resolves.toEqual([activityType()]);
    const listed = await service.listActivities(listFilters, manager);
    await expect(service.getActivity(activityId, manager)).resolves.toMatchObject({ id: activityId });

    expect(repository.listActivityTypes).toHaveBeenCalledWith();
    expect(repository.listActivities).toHaveBeenCalledWith(listFilters, { kind: "ALL" });
    expect(repository.findActivityById).toHaveBeenCalledWith(activityId, { kind: "ALL" });
    expect(listed.pagination).toEqual({ page: 2, pageSize: 10, totalItems: 21, totalPages: 3 });
  });

  it("forces a linked technician scope for create-own and operate-own readers", async () => {
    for (const permission of ["ACTIVITIES_CREATE_OWN", "ACTIVITIES_OPERATE_OWN"]) {
      const repository = repositoryWithSuccess();
      const service = createActivitiesService(repository, () => fixedNow);
      const technician = actor([permission], technicianId);

      await service.listActivities({ ...listFilters, technicianId: otherTechnicianId }, technician);
      await service.getActivity(activityId, technician);

      const scope = { kind: "TECHNICIAN", technicianId };
      expect(repository.listActivities).toHaveBeenCalledWith(
        { ...listFilters, technicianId: otherTechnicianId }, scope,
      );
      expect(repository.findActivityById).toHaveBeenCalledWith(activityId, scope);
    }
  });

  it("returns zero pages for an empty activity list", async () => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.listActivities).mockResolvedValueOnce({ items: [], totalItems: 0 });

    await expect(createActivitiesService(repository).listActivities(
      listFilters, actor(["ACTIVITIES_VIEW_ALL"]),
    )).resolves.toMatchObject({ pagination: { totalPages: 0 } });
  });

  it("allows a linked technician to read the activity-type catalog", async () => {
    const repository = repositoryWithSuccess();

    await expect(createActivitiesService(repository).listActivityTypes(
      actor(["ACTIVITIES_CREATE_OWN"], technicianId),
    )).resolves.toEqual([activityType()]);
    expect(repository.listActivityTypes).toHaveBeenCalledTimes(1);
  });

  it("denies the catalog without a qualifying activity permission", async () => {
    const repository = repositoryWithSuccess();

    await expectForbidden(createActivitiesService(repository).listActivityTypes(actor([])));
    expect(repository.listActivityTypes).not.toHaveBeenCalled();
  });

  it("conceals foreign and missing scoped details as the same not-found result", async () => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.findActivityById).mockResolvedValueOnce(null);

    await expect(createActivitiesService(repository).getActivity(
      activityId, actor(["ACTIVITIES_OPERATE_OWN"], otherTechnicianId),
    )).rejects.toMatchObject({ statusCode: 404, code: "ACTIVITY_NOT_FOUND" });
  });

  it("denies reads without a qualifying permission or linked technician before repository access", async () => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository);

    await expectForbidden(service.listActivities(listFilters, actor(["ACTIVITIES_OPERATE_OWN"])));
    await expectForbidden(service.getActivity(activityId, actor(["ACTIVITIES_MANAGE"])));
    expect(repository.listActivities).not.toHaveBeenCalled();
    expect(repository.findActivityById).not.toHaveBeenCalled();
  });
});

describe("ActivitiesService mutations", () => {
  it("delegates every manager mutation with the injected clock", async () => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository, () => fixedNow);
    const manager = actor(["ACTIVITIES_MANAGE"]);

    await service.createActivity(createInput, manager);
    await service.createManualActivity(manualInput, manager);
    await service.updateActivity(activityId, updateInput, manager);
    await service.replaceActivityTeam(activityId, teamInput, manager);
    await service.startActivity(activityId, versionInput, manager);
    await service.pauseActivity(activityId, pauseInput, manager);
    await service.resumeActivity(activityId, versionInput, manager);
    await service.completeActivity(activityId, completeInput, manager);
    await service.cancelActivity(activityId, cancelInput, manager);
    await service.adjustCompletedActivity(activityId, adjustInput, manager);

    expect(repository.createActivity).toHaveBeenCalledWith(createInput, manager, fixedNow);
    expect(repository.createManualActivity).toHaveBeenCalledWith(manualInput, manager, fixedNow);
    expect(repository.updateActivity).toHaveBeenCalledWith(activityId, updateInput, manager, fixedNow);
    expect(repository.replaceActivityTeam).toHaveBeenCalledWith(activityId, teamInput, manager, fixedNow);
    expect(repository.startActivity).toHaveBeenCalledWith(activityId, versionInput, manager, fixedNow);
    expect(repository.pauseActivity).toHaveBeenCalledWith(activityId, pauseInput, manager, fixedNow);
    expect(repository.resumeActivity).toHaveBeenCalledWith(activityId, versionInput, manager, fixedNow);
    expect(repository.completeActivity).toHaveBeenCalledWith(activityId, completeInput, manager, fixedNow);
    expect(repository.cancelActivity).toHaveBeenCalledWith(activityId, cancelInput, manager, fixedNow);
    expect(repository.adjustCompletedActivity).toHaveBeenCalledWith(activityId, adjustInput, manager, fixedNow);
  });

  it("normalizes technician own pending and manual creates to exactly self at 100 percent", async () => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository, () => fixedNow);
    const technician = actor(["ACTIVITIES_CREATE_OWN"], technicianId);
    const selfTeam = [{ technicianId, role: "RESPONSIBLE" as const, participationPercentage: "100.00" }];

    await service.createActivity(createInput, technician);
    await service.createManualActivity(manualInput, technician);

    expect(repository.createActivity).toHaveBeenCalledWith({ ...createInput, team: selfTeam }, technician, fixedNow);
    expect(repository.createManualActivity).toHaveBeenCalledWith({ ...manualInput, team: selfTeam }, technician, fixedNow);
  });

  it("rejects technician foreign or group creation before every repository mutation", async () => {
    const technician = actor(["ACTIVITIES_CREATE_OWN"], technicianId);
    const groupTeam = [
      { technicianId, role: "RESPONSIBLE" as const, participationPercentage: "50.00" },
      { technicianId: otherTechnicianId, role: "PARTICIPANT" as const, participationPercentage: "50.00" },
    ];
    for (const input of [{ ...createInput, team: groupTeam }, { ...createInput, team: [{ technicianId: otherTechnicianId, role: "RESPONSIBLE" as const, participationPercentage: "100.00" }] }]) {
      const repository = repositoryWithSuccess();
      const service = createActivitiesService(repository);
      await expectForbidden(service.createActivity(input, technician));
      await expectForbidden(service.createManualActivity({ ...manualInput, team: input.team }, technician));
      expectNoMutationCalls(repository);
    }
  });

  it.each([
    { name: "an empty team", team: [] },
    { name: "a self participant", team: [{ technicianId, role: "PARTICIPANT" as const, participationPercentage: "100.00" }] },
    { name: "a non-100 self percentage", team: [{ technicianId, role: "RESPONSIBLE" as const, participationPercentage: "99.99" }] },
  ])("rejects own creation with $name before every repository mutation", async ({ team }) => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository);
    const technician = actor(["ACTIVITIES_CREATE_OWN"], technicianId);

    await expectForbidden(service.createActivity({ ...createInput, team }, technician));
    await expectForbidden(service.createManualActivity({ ...manualInput, team }, technician));
    expectNoMutationCalls(repository);
  });

  it.each([
    ["no create permission", actor(["ACTIVITIES_OPERATE_OWN"], technicianId)],
    ["no linked technician", actor(["ACTIVITIES_CREATE_OWN"])],
  ] as const)("denies pending and manual own creation with %s", async (_name, deniedActor) => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository);

    await expectForbidden(service.createActivity(createInput, deniedActor));
    await expectForbidden(service.createManualActivity(manualInput, deniedActor));
    expectNoMutationCalls(repository);
  });

  it("allows linked technicians to delegate own timer operations and cancellation", async () => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository, () => fixedNow);
    const technician = actor(["ACTIVITIES_OPERATE_OWN", "ACTIVITIES_CREATE_OWN"], technicianId);

    await service.startActivity(activityId, versionInput, technician);
    await service.pauseActivity(activityId, pauseInput, technician);
    await service.resumeActivity(activityId, versionInput, technician);
    await service.completeActivity(activityId, completeInput, technician);
    await service.cancelActivity(activityId, cancelInput, technician);

    expect(repository.startActivity).toHaveBeenCalledWith(activityId, versionInput, technician, fixedNow);
    expect(repository.pauseActivity).toHaveBeenCalledWith(activityId, pauseInput, technician, fixedNow);
    expect(repository.resumeActivity).toHaveBeenCalledWith(activityId, versionInput, technician, fixedNow);
    expect(repository.completeActivity).toHaveBeenCalledWith(activityId, completeInput, technician, fixedNow);
    expect(repository.cancelActivity).toHaveBeenCalledWith(activityId, cancelInput, technician, fixedNow);
    expect(repository.findActivityById).toHaveBeenNthCalledWith(1, activityId, { kind: "TECHNICIAN", technicianId });
    expect(repository.findActivityById).toHaveBeenNthCalledWith(2, activityId, { kind: "TECHNICIAN", technicianId });
    expect(repository.findActivityById).toHaveBeenNthCalledWith(3, activityId, { kind: "TECHNICIAN", technicianId });
    expect(repository.findActivityById).toHaveBeenNthCalledWith(4, activityId, { kind: "TECHNICIAN", technicianId });
    expect(repository.findActivityById).toHaveBeenNthCalledWith(5, activityId, { kind: "TECHNICIAN", technicianId });
  });

  it.each([
    {
      name: "start",
      actor: actor(["ACTIVITIES_OPERATE_OWN"], technicianId),
      invoke: (service: ReturnType<typeof createActivitiesService>, id: string, operationActor: ActivityActorContext) => service.startActivity(id, versionInput, operationActor),
    },
    {
      name: "pause",
      actor: actor(["ACTIVITIES_OPERATE_OWN"], technicianId),
      invoke: (service: ReturnType<typeof createActivitiesService>, id: string, operationActor: ActivityActorContext) => service.pauseActivity(id, pauseInput, operationActor),
    },
    {
      name: "resume",
      actor: actor(["ACTIVITIES_OPERATE_OWN"], technicianId),
      invoke: (service: ReturnType<typeof createActivitiesService>, id: string, operationActor: ActivityActorContext) => service.resumeActivity(id, versionInput, operationActor),
    },
    {
      name: "complete",
      actor: actor(["ACTIVITIES_OPERATE_OWN"], technicianId),
      invoke: (service: ReturnType<typeof createActivitiesService>, id: string, operationActor: ActivityActorContext) => service.completeActivity(id, completeInput, operationActor),
    },
    {
      name: "cancel",
      actor: actor(["ACTIVITIES_CREATE_OWN"], technicianId),
      invoke: (service: ReturnType<typeof createActivitiesService>, id: string, operationActor: ActivityActorContext) => service.cancelActivity(id, cancelInput, operationActor),
    },
  ])("returns the same not-found result for foreign and missing own $name activities", async (scenario) => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.findActivityById).mockResolvedValue(null);
    const service = createActivitiesService(repository, () => fixedNow);
    const scope = { kind: "TECHNICIAN" as const, technicianId };

    await expectActivityNotFound(scenario.invoke(service, foreignActivityId, scenario.actor));
    await expectActivityNotFound(scenario.invoke(service, missingActivityId, scenario.actor));

    expect(repository.findActivityById).toHaveBeenNthCalledWith(1, foreignActivityId, scope);
    expect(repository.findActivityById).toHaveBeenNthCalledWith(2, missingActivityId, scope);
    expectNoMutationCalls(repository);
  });

  it("maps a participant ownership rejection without leaking activity existence", async () => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.startActivity).mockResolvedValueOnce({ kind: "FORBIDDEN" });
    const technician = actor(["ACTIVITIES_OPERATE_OWN"], otherTechnicianId);

    await expectForbidden(createActivitiesService(repository, () => fixedNow).startActivity(activityId, versionInput, technician));
    expect(repository.findActivityById).toHaveBeenCalledWith(
      activityId, { kind: "TECHNICIAN", technicianId: otherTechnicianId },
    );
    expect(repository.startActivity).toHaveBeenCalledWith(activityId, versionInput, technician, fixedNow);
  });

  it.each([
    {
      name: "pause with create-own instead of operate-own",
      invoke: (service: ReturnType<typeof createActivitiesService>, operationActor: ActivityActorContext) => service.pauseActivity(activityId, pauseInput, operationActor),
      operationActor: actor(["ACTIVITIES_CREATE_OWN"], technicianId),
    },
    {
      name: "resume with create-own instead of operate-own",
      invoke: (service: ReturnType<typeof createActivitiesService>, operationActor: ActivityActorContext) => service.resumeActivity(activityId, versionInput, operationActor),
      operationActor: actor(["ACTIVITIES_CREATE_OWN"], technicianId),
    },
    {
      name: "complete with create-own instead of operate-own",
      invoke: (service: ReturnType<typeof createActivitiesService>, operationActor: ActivityActorContext) => service.completeActivity(activityId, completeInput, operationActor),
      operationActor: actor(["ACTIVITIES_CREATE_OWN"], technicianId),
    },
    {
      name: "pause without a linked technician",
      invoke: (service: ReturnType<typeof createActivitiesService>, operationActor: ActivityActorContext) => service.pauseActivity(activityId, pauseInput, operationActor),
      operationActor: actor(["ACTIVITIES_OPERATE_OWN"]),
    },
    {
      name: "resume without a linked technician",
      invoke: (service: ReturnType<typeof createActivitiesService>, operationActor: ActivityActorContext) => service.resumeActivity(activityId, versionInput, operationActor),
      operationActor: actor(["ACTIVITIES_OPERATE_OWN"]),
    },
    {
      name: "complete without a linked technician",
      invoke: (service: ReturnType<typeof createActivitiesService>, operationActor: ActivityActorContext) => service.completeActivity(activityId, completeInput, operationActor),
      operationActor: actor(["ACTIVITIES_OPERATE_OWN"]),
    },
    {
      name: "cancel without a linked technician",
      invoke: (service: ReturnType<typeof createActivitiesService>, operationActor: ActivityActorContext) => service.cancelActivity(activityId, cancelInput, operationActor),
      operationActor: actor(["ACTIVITIES_CREATE_OWN"]),
    },
  ])("denies $name before repository access", async ({ invoke, operationActor }) => {
    const repository = repositoryWithSuccess();

    await expectForbidden(invoke(createActivitiesService(repository), operationActor));
    expect(repository.findActivityById).not.toHaveBeenCalled();
    expectNoMutationCalls(repository);
  });

  it("denies unauthorized mutations before repository access", async () => {
    const repository = repositoryWithSuccess();
    const service = createActivitiesService(repository);

    await expectForbidden(service.updateActivity(activityId, updateInput, actor(["ACTIVITIES_CREATE_OWN"], technicianId)));
    await expectForbidden(service.replaceActivityTeam(activityId, teamInput, actor(["ACTIVITIES_CREATE_OWN"], technicianId)));
    await expectForbidden(service.startActivity(activityId, versionInput, actor(["ACTIVITIES_OPERATE_OWN"])));
    await expectForbidden(service.cancelActivity(activityId, cancelInput, actor(["ACTIVITIES_OPERATE_OWN"], technicianId)));
    await expectForbidden(service.adjustCompletedActivity(activityId, adjustInput, actor(["ACTIVITIES_OPERATE_OWN"], technicianId)));
    expectNoMutationCalls(repository);
  });
});

const failures: Array<[ActivityFailureKind, number, string]> = [
  ["ACTIVITY_NOT_FOUND", 404, "La actividad solicitada no existe"],
  ["ACTIVITY_TYPE_NOT_FOUND", 404, "El tipo de actividad solicitado no existe"],
  ["VERSION_CONFLICT", 409, "La actividad fue modificada por otro usuario"],
  ["INVALID_ACTIVITY_STATE", 409, "La transición de estado no es válida"],
  ["ACTIVE_TIMER_EXISTS", 409, "El técnico ya tiene otra actividad activa"],
  ["TIME_OVERLAP", 409, "El intervalo de tiempo se superpone con otra actividad"],
  ["INVALID_PARTICIPATION_TOTAL", 400, "La participación del equipo no es válida"],
  ["TECHNICIAN_NOT_ASSIGNED_TO_ORDER", 400, "El técnico no está asignado a la orden"],
  ["RESOURCE_INACTIVE", 409, "El recurso relacionado está inactivo"],
  ["FORBIDDEN", 403, "No tiene permiso para realizar esta acción"],
];

describe("ActivitiesService public failures", () => {
  it.each(failures)("maps %s to its public API error", async (kind, statusCode, message) => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.updateActivity).mockResolvedValueOnce({ kind });

    await expect(createActivitiesService(repository).updateActivity(
      activityId, updateInput, actor(["ACTIVITIES_MANAGE"]),
    )).rejects.toMatchObject({ name: "ApiError", statusCode, code: kind, message });
  });

  it("maps invalid temporal ranges to the public validation contract", async () => {
    const repository = repositoryWithSuccess();
    vi.mocked(repository.adjustCompletedActivity).mockResolvedValueOnce({ kind: "INVALID_TEMPORAL_RANGE" });

    await expect(createActivitiesService(repository).adjustCompletedActivity(
      activityId, adjustInput, actor(["ACTIVITIES_MANAGE"]),
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });
});
