import { requestJson } from "./http";
import type {
  ActivityDetail,
  ActivityListFilters,
  ActivityPage,
  ActivityTeamInput,
  ActivityType,
  AdjustActivityInput,
  CancelActivityInput,
  CompleteActivityInput,
  CreateActivityInput,
  ManualActivityInput,
  PauseActivityInput,
  UpdateActivityInput,
} from "../models/activity";

export interface ActivityApi {
  listTypes(signal?: AbortSignal): Promise<ActivityType[]>;
  list(filters: ActivityListFilters, signal?: AbortSignal): Promise<ActivityPage>;
  detail(id: string, signal?: AbortSignal): Promise<ActivityDetail>;
  create(input: CreateActivityInput): Promise<ActivityDetail>;
  createManual(input: ManualActivityInput): Promise<ActivityDetail>;
  update(id: string, input: UpdateActivityInput): Promise<ActivityDetail>;
  replaceTeam(id: string, version: number, team: ActivityTeamInput[]): Promise<ActivityDetail>;
  start(id: string, version: number): Promise<ActivityDetail>;
  pause(id: string, input: PauseActivityInput): Promise<ActivityDetail>;
  resume(id: string, version: number): Promise<ActivityDetail>;
  complete(id: string, input: CompleteActivityInput): Promise<ActivityDetail>;
  cancel(id: string, input: CancelActivityInput): Promise<ActivityDetail>;
  adjust(id: string, input: AdjustActivityInput): Promise<ActivityDetail>;
}

function activityQuery(filters: ActivityListFilters): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

function activityPath(id: string, operation?: string): string {
  const base = `/activities/${encodeURIComponent(id)}`;
  return operation ? `${base}/${operation}` : base;
}

function mutation<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  return requestJson<T>(path, { method, body: JSON.stringify(body) });
}

export function createActivityApi(): ActivityApi {
  return {
    listTypes: (signal) => requestJson<ActivityType[]>("/activity-types", { signal }),
    list: (filters, signal) => requestJson<ActivityPage>(`/activities?${activityQuery(filters)}`, { signal }),
    detail: (id, signal) => requestJson<ActivityDetail>(activityPath(id), { signal }),
    create: (input) => mutation<ActivityDetail>("/activities", "POST", input),
    createManual: (input) => mutation<ActivityDetail>("/activities/manual", "POST", input),
    update: (id, input) => mutation<ActivityDetail>(activityPath(id), "PATCH", input),
    replaceTeam: (id, version, team) => mutation<ActivityDetail>(activityPath(id, "team"), "PUT", { version, team }),
    start: (id, version) => mutation<ActivityDetail>(activityPath(id, "start"), "POST", { version }),
    pause: (id, input) => mutation<ActivityDetail>(activityPath(id, "pause"), "POST", input),
    resume: (id, version) => mutation<ActivityDetail>(activityPath(id, "resume"), "POST", { version }),
    complete: (id, input) => mutation<ActivityDetail>(activityPath(id, "complete"), "POST", input),
    cancel: (id, input) => mutation<ActivityDetail>(activityPath(id, "cancel"), "POST", input),
    adjust: (id, input) => mutation<ActivityDetail>(activityPath(id, "adjustments"), "POST", input),
  };
}
