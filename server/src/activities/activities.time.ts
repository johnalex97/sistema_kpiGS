export interface TimeRange {
  startedAt: Date;
  endedAt: Date;
}

export interface ActivityMinutes {
  pausedMinutes: number;
  productiveMinutes: number;
  productiveSegments: TimeRange[];
}

const minute = 60_000;

function isInvalidRange(range: TimeRange): boolean {
  return range.endedAt.getTime() < range.startedAt.getTime();
}

export function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  if (
    left.endedAt.getTime() <= left.startedAt.getTime() ||
    right.endedAt.getTime() <= right.startedAt.getTime()
  ) {
    return false;
  }
  return (
    left.startedAt.getTime() < right.endedAt.getTime() &&
    right.startedAt.getTime() < left.endedAt.getTime()
  );
}

export function overlapsAny(
  candidate: TimeRange,
  productiveSegments: readonly TimeRange[],
): boolean {
  return productiveSegments.some((segment) => rangesOverlap(candidate, segment));
}

export function calculateActivityMinutes(
  startedAt: Date,
  endedAt: Date,
  pauses: readonly TimeRange[],
): ActivityMinutes {
  const activityRange = { startedAt, endedAt };
  if (isInvalidRange(activityRange)) {
    throw new Error("La fecha de finalización no puede ser anterior al inicio");
  }

  const sortedPauses = [...pauses].sort(
    (left, right) => left.startedAt.getTime() - right.startedAt.getTime(),
  );
  let previousPause: TimeRange | undefined;
  for (const pause of sortedPauses) {
    if (
      isInvalidRange(pause) ||
      pause.startedAt.getTime() < startedAt.getTime() ||
      pause.endedAt.getTime() > endedAt.getTime() ||
      (previousPause !== undefined && rangesOverlap(previousPause, pause))
    ) {
      throw new Error("Las pausas deben estar dentro de la actividad y no solaparse");
    }
    previousPause = pause;
  }

  const productiveSegments: TimeRange[] = [];
  let cursor = startedAt;
  for (const pause of sortedPauses) {
    if (pause.startedAt.getTime() === pause.endedAt.getTime()) {
      continue;
    }
    if (cursor.getTime() < pause.startedAt.getTime()) {
      productiveSegments.push({ startedAt: cursor, endedAt: pause.startedAt });
    }
    cursor = pause.endedAt;
  }
  if (cursor.getTime() < endedAt.getTime()) {
    productiveSegments.push({ startedAt: cursor, endedAt });
  }

  const pausedMilliseconds = sortedPauses.reduce(
    (total, pause) => total + pause.endedAt.getTime() - pause.startedAt.getTime(),
    0,
  );
  const productiveMilliseconds = endedAt.getTime() - startedAt.getTime() - pausedMilliseconds;
  if (productiveMilliseconds < 0) {
    throw new Error("Los minutos productivos no pueden ser negativos");
  }

  return {
    pausedMinutes: Math.floor(pausedMilliseconds / minute),
    productiveMinutes: Math.floor(productiveMilliseconds / minute),
    productiveSegments,
  };
}
