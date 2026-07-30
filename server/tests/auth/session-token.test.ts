import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashSessionToken,
  isSessionUsable,
  shouldTouchSession,
} from "../../src/auth/session-token.js";

const activeSession = {
  revokedAt: null,
  expiresAt: new Date("2026-07-30T20:00:00.000Z"),
  lastSeenAt: new Date("2026-07-30T11:45:00.001Z"),
};

describe("opaque session tokens", () => {
  it("generates a URL-safe token and deterministic SHA-256 hash", () => {
    const created = createSessionToken();

    expect(created.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(created.rawToken)).toBe(created.tokenHash);
    expect(created.tokenHash).not.toContain(created.rawToken);
  });

  it("rejects absolute, idle, and revoked sessions", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");

    expect(isSessionUsable(activeSession, now, 30)).toBe(true);
    expect(
      isSessionUsable({ ...activeSession, revokedAt: now }, now, 30),
    ).toBe(false);
    expect(
      isSessionUsable({ ...activeSession, expiresAt: now }, now, 30),
    ).toBe(false);
    expect(
      isSessionUsable(
        {
          ...activeSession,
          lastSeenAt: new Date("2026-07-30T11:30:00.000Z"),
        },
        now,
        30,
      ),
    ).toBe(false);
  });

  it("touches a session only after five minutes", () => {
    const lastSeenAt = new Date("2026-07-30T12:00:00.000Z");

    expect(
      shouldTouchSession(
        lastSeenAt,
        new Date("2026-07-30T12:04:59.999Z"),
      ),
    ).toBe(false);
    expect(
      shouldTouchSession(
        lastSeenAt,
        new Date("2026-07-30T12:05:00.000Z"),
      ),
    ).toBe(true);
  });
});
