import { describe, expect, it } from "vitest";
import { changePasswordSchema, loginSchema } from "../../src/auth/auth.schemas.js";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../../src/auth/password.js";

const testScryptOptions = {
  N: 1024,
  r: 8,
  p: 1,
  maxmem: 16 * 1024 * 1024,
};

describe("password policy", () => {
  it.each([
    ["Short1!", "PASSWORD_TOO_SHORT"],
    ["alllowercase1!", "PASSWORD_UPPERCASE_REQUIRED"],
    ["ALLUPPERCASE1!", "PASSWORD_LOWERCASE_REQUIRED"],
    ["NoNumbersHere!", "PASSWORD_NUMBER_REQUIRED"],
    ["NoSpecial1234", "PASSWORD_SPECIAL_REQUIRED"],
    ["A".repeat(129) + "1!", "PASSWORD_TOO_LONG"],
  ])("rejects %s with %s", (password, code) => {
    expect(validatePassword(password)).toEqual({
      valid: false,
      code,
    });
  });

  it("accepts a password satisfying every rule", () => {
    expect(validatePassword("GeekLocal-2026!")).toEqual({ valid: true });
  });
});

describe("authentication request schemas", () => {
  it("normalizes email without trimming the password", () => {
    expect(
      loginSchema.parse({
        email: "  ADMIN@GeekSolution.Local ",
        password: " GeekLocal-2026! ",
      }),
    ).toEqual({
      email: "admin@geeksolution.local",
      password: " GeekLocal-2026! ",
    });
  });

  it("rejects equal current and new passwords", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "GeekLocal-2026!",
      newPassword: "GeekLocal-2026!",
    });

    expect(result.success).toBe(false);
  });

  it("rejects oversized login and current passwords", () => {
    expect(
      loginSchema.safeParse({
        email: "admin@geeksolution.local",
        password: "A".repeat(129),
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "A".repeat(129),
        newPassword: "GeekLocal-2026!",
      }).success,
    ).toBe(false);
  });
});

describe("password hashing", () => {
  it("creates different versioned hashes for the same password", async () => {
    const first = await hashPassword("GeekLocal-2026!", testScryptOptions);
    const second = await hashPassword("GeekLocal-2026!", testScryptOptions);

    expect(first).toMatch(/^scrypt\$v1\$/);
    expect(second).not.toBe(first);
    expect(await verifyPassword("GeekLocal-2026!", first)).toBe(true);
    expect(await verifyPassword("WrongPassword-2026!", first)).toBe(false);
  });

  it("rejects malformed or unsupported hashes without throwing", async () => {
    await expect(
      verifyPassword("GeekLocal-2026!", "invalid"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(
        "GeekLocal-2026!",
        "scrypt$v2$1024$8$1$c2FsdA==$aGFzaA==",
      ),
    ).resolves.toBe(false);
  });
});
