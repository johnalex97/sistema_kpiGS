import { createHash, randomBytes } from "node:crypto";

const sessionTokenBytes = 32;
const touchIntervalMs = 5 * 60 * 1000;

export interface SessionTiming {
  revokedAt: Date | null;
  expiresAt: Date;
  lastSeenAt: Date;
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function createSessionToken(): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = randomBytes(sessionTokenBytes).toString("base64url");
  return {
    rawToken,
    tokenHash: hashSessionToken(rawToken),
  };
}

export function isSessionUsable(
  session: SessionTiming,
  now: Date,
  idleMinutes: number,
): boolean {
  if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  const idleExpiresAt =
    session.lastSeenAt.getTime() + idleMinutes * 60 * 1000;
  return idleExpiresAt > now.getTime();
}

export function shouldTouchSession(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= touchIntervalMs;
}
