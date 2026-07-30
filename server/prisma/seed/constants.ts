import type { Prisma } from "../../generated/prisma/client.js";

export type SeedClient = Prisma.TransactionClient;

export const seedCodes = {
  roles: {
    admin: "ADMIN",
    supervisor: "SUPERVISOR",
    technician: "TECHNICIAN",
  },
  technicians: ["TEC-001", "TEC-002", "TEC-003"],
  clients: ["CLI-001", "CLI-002"],
  orders: ["GS-2026-0001", "GS-2026-0002", "GS-2026-0003"],
  kpiVersion: 1,
} as const;

export const seedIds = {
  contacts: {
    primary: "10000000-0000-4000-8000-000000000001",
    secondary: "10000000-0000-4000-8000-000000000002",
  },
  orderHistory: {
    first: "20000000-0000-4000-8000-000000000001",
    second: "20000000-0000-4000-8000-000000000002",
  },
  activities: {
    planned: "30000000-0000-4000-8000-000000000001",
    unplanned: "30000000-0000-4000-8000-000000000002",
  },
  pauses: {
    completed: "40000000-0000-4000-8000-000000000001",
  },
  materialUsage: {
    order: "50000000-0000-4000-8000-000000000001",
    activity: "50000000-0000-4000-8000-000000000002",
  },
  recurrences: {
    technical: "60000000-0000-4000-8000-000000000001",
    equipment: "60000000-0000-4000-8000-000000000002",
  },
} as const;
