export type PasswordValidationCode =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_LOWERCASE_REQUIRED"
  | "PASSWORD_UPPERCASE_REQUIRED"
  | "PASSWORD_NUMBER_REQUIRED"
  | "PASSWORD_SPECIAL_REQUIRED";

export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; code: PasswordValidationCode };

export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < 12) {
    return { valid: false, code: "PASSWORD_TOO_SHORT" };
  }
  if (password.length > 128) {
    return { valid: false, code: "PASSWORD_TOO_LONG" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, code: "PASSWORD_LOWERCASE_REQUIRED" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, code: "PASSWORD_UPPERCASE_REQUIRED" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, code: "PASSWORD_NUMBER_REQUIRED" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, code: "PASSWORD_SPECIAL_REQUIRED" };
  }
  return { valid: true };
}

function deriveKey(
  password: string,
  salt: Buffer,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const nodeOptions: NodeScryptOptions = {
      N: options.N,
      r: options.r,
      p: options.p,
      maxmem: options.maxmem,
    };
    scrypt(
      password,
      salt,
      derivedKeyLength,
      nodeOptions,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      },
    );
  });
}

export async function hashPassword(
  password: string,
  options: ScryptOptions = productionScryptOptions,
): Promise<string> {
  const salt = randomBytes(saltLength);
  const hash = await deriveKey(password, salt, options);
  return [
    "scrypt",
    "v1",
    options.N,
    options.r,
    options.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    const [algorithm, version, nText, rText, pText, saltText, hashText, extra] =
      encodedHash.split("$");
    if (
      algorithm !== "scrypt" ||
      version !== "v1" ||
      extra !== undefined ||
      !nText ||
      !rText ||
      !pText ||
      !saltText ||
      !hashText
    ) {
      return false;
    }

    const N = Number(nText);
    const r = Number(rText);
    const p = Number(pText);
    if (
      !Number.isInteger(N) ||
      N < 1024 ||
      N > productionScryptOptions.N ||
      (N & (N - 1)) !== 0 ||
      !Number.isInteger(r) ||
      r < 1 ||
      r > 32 ||
      !Number.isInteger(p) ||
      p < 1 ||
      p > 16
    ) {
      return false;
    }

    const salt = Buffer.from(saltText, "base64");
    const expectedHash = Buffer.from(hashText, "base64");
    if (
      salt.length !== saltLength ||
      expectedHash.length !== derivedKeyLength
    ) {
      return false;
    }

    const actualHash = await deriveKey(password, salt, {
      N,
      r,
      p,
      maxmem: productionScryptOptions.maxmem,
    });
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions as NodeScryptOptions,
} from "node:crypto";

export interface ScryptOptions {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

const productionScryptOptions: ScryptOptions = {
  N: 131_072,
  r: 8,
  p: 1,
  maxmem: 268_435_456,
};

const derivedKeyLength = 64;
const saltLength = 16;
