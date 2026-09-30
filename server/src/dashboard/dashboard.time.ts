function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const desired = Date.UTC(year, month - 1, day);
  let guess = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += desired - represented;
  }
  return new Date(guess);
}

export function getOperationalDayBounds(date: string, timeZone: string) {
  const local = new Date(`${date}T00:00:00.000Z`);
  const start = localMidnightUtc(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    timeZone,
  );
  const next = new Date(local.getTime() + 86_400_000);
  const end = localMidnightUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { start, end };
}
