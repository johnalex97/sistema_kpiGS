import type { ActivityTeamInput } from "../../models/activity";

function percentageHundredths(value: string): number | null {
  if (!/^(?:100\.00|\d{1,2}\.\d{2})$/.test(value)) return null;
  const hundredths = Math.round(Number(value) * 100);
  return hundredths > 0 && hundredths <= 10_000 ? hundredths : null;
}

export function activityTeamErrors(members: ActivityTeamInput[]): string[] {
  const errors: string[] = [];
  if (members.length === 0) return ["Agrega al menos un técnico al equipo."];
  if (new Set(members.map((member) => member.technicianId)).size !== members.length) errors.push("Un técnico no puede repetirse en el equipo.");
  if (members.filter((member) => member.role === "RESPONSIBLE").length !== 1) errors.push("El equipo debe tener exactamente un responsable.");
  const values = members.map((member) => percentageHundredths(member.participationPercentage));
  if (values.some((value) => value === null)) errors.push("Cada participación debe usar dos decimales y ser mayor que 0.00%.");
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total !== 10_000) errors.push(`La participación suma ${(total / 100).toFixed(2)}%; debe sumar 100.00%.`);
  return errors;
}
