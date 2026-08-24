import { Prisma } from "../../generated/prisma/client.js";
import type { WeeklyKpiFacts, WeeklySourceRows } from "./kpis.types.js";

const ZERO = "0.0000";
const credit = (value: Prisma.Decimal) => value.toDecimalPlaces(4).toFixed(4);

export function buildWeeklyFacts(rows: WeeklySourceRows): Map<string, WeeklyKpiFacts> {
  const facts = new Map<string, WeeklyKpiFacts>();
  for (const technician of rows.technicians) {
    facts.set(technician.id, {
      technicianId: technician.id,
      code: technician.code,
      fullName: technician.fullName,
      targetJobs: technician.targetJobs ?? 0,
      completedCredits: ZERO,
      eligibleCredits: ZERO,
      onTimeEligibleCredits: ZERO,
      registeredMinutes: 0,
      productiveMinutes: 0,
      attributableRecurrenceCredits: ZERO,
      weights: rows.weights,
    });
  }

  const minutesByOrder = new Map<string, Map<string, number>>();
  for (const activity of rows.activities) {
    const fact = facts.get(activity.technicianId);
    if (!fact) continue;
    fact.registeredMinutes += activity.registeredMinutes;
    fact.productiveMinutes += activity.productiveMinutes;
    if (!activity.orderId || activity.productiveMinutes <= 0) continue;
    const order = minutesByOrder.get(activity.orderId) ?? new Map<string, number>();
    order.set(activity.technicianId, (order.get(activity.technicianId) ?? 0) + activity.productiveMinutes);
    minutesByOrder.set(activity.orderId, order);
  }

  for (const order of rows.orders) {
    const minutes = minutesByOrder.get(order.id);
    if (!minutes) continue;
    const total = [...minutes.values()].reduce((sum, value) => sum + value, 0);
    if (total <= 0) continue;
    for (const [technicianId, technicianMinutes] of minutes) {
      const fact = facts.get(technicianId);
      if (!fact) continue;
      const share = new Prisma.Decimal(technicianMinutes).div(total);
      fact.completedCredits = credit(new Prisma.Decimal(fact.completedCredits).plus(share));
      if (order.scheduledFor) {
        fact.eligibleCredits = credit(new Prisma.Decimal(fact.eligibleCredits).plus(share));
        if (order.endedAt <= order.scheduledFor) {
          fact.onTimeEligibleCredits = credit(new Prisma.Decimal(fact.onTimeEligibleCredits).plus(share));
        }
      }
    }
  }

  for (const recurrence of rows.recurrences) {
    const minutes = minutesByOrder.get(recurrence.originalOrderId);
    const attributable = [...new Set(recurrence.attributableTechnicianIds)]
      .filter((technicianId) => facts.has(technicianId));
    if (attributable.length === 0) continue;
    const total = attributable.reduce((sum, technicianId) => sum + (minutes?.get(technicianId) ?? 0), 0);
    for (const technicianId of attributable) {
      const share = attributable.length === 1 || total === 0
        ? new Prisma.Decimal(1).div(attributable.length)
        : new Prisma.Decimal(minutes?.get(technicianId) ?? 0).div(total);
      const fact = facts.get(technicianId)!;
      fact.attributableRecurrenceCredits = credit(
        new Prisma.Decimal(fact.attributableRecurrenceCredits).plus(share),
      );
    }
  }
  return facts;
}
