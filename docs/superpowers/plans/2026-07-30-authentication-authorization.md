# Authentication and Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure local authentication with PostgreSQL-backed opaque sessions, mandatory first password change, account lockout, permission middleware, and deploy-ready cookie settings.

**Architecture:** Keep the existing Express composition and introduce an authentication module split into validation, cryptography, repository, service, controller, and middleware boundaries. Store only SHA-256 session-token hashes in PostgreSQL, expose the raw token only through an HttpOnly cookie, and load authorization permissions from the existing role-permission model.

**Tech Stack:** Node.js 24, TypeScript 6, Express 5, Prisma 7, PostgreSQL 18, Zod 4, Vitest 4, Supertest, and `node:crypto`.

## Global Constraints

- Work against the existing database `"Sistema_kpiGS"` and preserve all current data.
- Create an incremental Prisma migration; never edit `20260730160241_initial_schema`.
- Keep `public` for local development and `test` for database integration tests.
- Use `scrypt` with `N=131072`, `r=8`, `p=1`, `maxmem=268435456`, a 16-byte salt, and a 64-byte derived key.
- Never log or return passwords, session tokens, password hashes, or session-token hashes.
- Store the session token only in the `gs_session` HttpOnly cookie; store only its SHA-256 hash in PostgreSQL.
- Use `SameSite=Lax`, `Path=/`, no `Domain`, no `Max-Age`, and no `Expires`.
- Require `Secure=true` in production and allow `Secure=false` only for local HTTP development or tests.
- Default session lifetime is 480 minutes, idle timeout is 30 minutes, and last-seen writes are throttled to once per 5 minutes.
- Five consecutive failures lock an account for 15 minutes.
- Treat an unknown, inactive, deleted, passwordless, or locked account as `401 INVALID_CREDENTIALS` with the same public response.
- Require an allowed `Origin` on every mutable authentication endpoint and every future mutable authenticated endpoint.
- Enforce permissions in the backend with default denial.
- Do not implement password recovery, MFA, OAuth, user-management UI, login UI, or deployment configuration in this phase.
- Do not commit or push during execution unless the user explicitly authorizes it; commit commands below are checkpoints for a future authorized workflow.

---

## File map

```text
server/
├── prisma/
│   ├── migrations/<timestamp>_authentication_sessions/migration.sql
│   ├── schema.prisma
│   └── seed/
│       └── identity.ts
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.repository.ts
│   │   ├── auth.routes.ts
│   │   ├── auth.schemas.ts
│   │   ├── auth.service.ts
│   │   ├── auth.types.ts
│   │   ├── password.ts
│   │   └── session-token.ts
│   ├── config/env.ts
│   ├── middlewares/
│   │   ├── authentication.middleware.ts
│   │   ├── origin.middleware.ts
│   │   └── permission.middleware.ts
│   ├── routes/index.ts
│   └── types/express.d.ts
├── tests/
│   ├── auth/
│   │   ├── auth-http.test.ts
│   │   ├── auth-service.test.ts
│   │   ├── auth-test-context.ts
│   │   ├── authorization.test.ts
│   │   ├── password.test.ts
│   │   └── session-token.test.ts
│   ├── database/
│   │   ├── auth-persistence.test.ts
│   │   └── seed.test.ts
│   └── env.test.ts
└── .env.example
```

Each source file owns one boundary. HTTP-specific cookie work remains in the
controller, business state transitions remain in the service, and Prisma
queries remain in the repository.

---

### Task 1: Authentication environment contract

**Files:**
- Modify: `server/src/config/env.ts`
- Modify: `server/tests/env.test.ts`
- Modify: `server/vitest.config.ts`
- Modify: `server/.env.example`

**Interfaces:**
- Consumes: existing `parseEnvironment(input: EnvironmentInput): Environment`
- Produces: `Environment.AUTH_SESSION_TTL_MINUTES`, `AUTH_SESSION_IDLE_MINUTES`, `AUTH_COOKIE_SECURE`, `AUTH_MAX_FAILED_ATTEMPTS`, and `AUTH_LOCK_MINUTES`

- [ ] **Step 1: Write failing configuration tests**

Add literal behavior tests:

```ts
it("provides safe local authentication defaults", () => {
  const result = parseEnvironment(validInput);

  expect(result.AUTH_SESSION_TTL_MINUTES).toBe(480);
  expect(result.AUTH_SESSION_IDLE_MINUTES).toBe(30);
  expect(result.AUTH_COOKIE_SECURE).toBe(false);
  expect(result.AUTH_MAX_FAILED_ATTEMPTS).toBe(5);
  expect(result.AUTH_LOCK_MINUTES).toBe(15);
});

it("requires secure cookies in production", () => {
  expect(() =>
    parseEnvironment({
      ...validInput,
      NODE_ENV: "production",
      AUTH_COOKIE_SECURE: "false",
    }),
  ).toThrow("AUTH_COOKIE_SECURE debe ser true en producción");
});

it("rejects an idle timeout greater than the absolute lifetime", () => {
  expect(() =>
    parseEnvironment({
      ...validInput,
      AUTH_SESSION_TTL_MINUTES: "30",
      AUTH_SESSION_IDLE_MINUTES: "31",
    }),
  ).toThrow("AUTH_SESSION_IDLE_MINUTES");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
cd server
npm run test -- tests/env.test.ts
```

Expected: FAIL because the authentication properties do not exist.

- [ ] **Step 3: Implement the environment schema**

Add these Zod fields:

```ts
AUTH_SESSION_TTL_MINUTES: z.coerce.number().int().min(15).max(1440).default(480),
AUTH_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(480).default(30),
AUTH_COOKIE_SECURE: z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true"),
AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
AUTH_LOCK_MINUTES: z.coerce.number().int().min(5).max(1440).default(15),
```

After parsing, reject production with an insecure cookie and reject an idle
timeout larger than the absolute timeout. Add the five typed properties to
`Environment` and return them from `parseEnvironment`.

Set explicit authentication defaults in `vitest.config.ts` and document them
in `.env.example`:

```dotenv
AUTH_SESSION_TTL_MINUTES=480
AUTH_SESSION_IDLE_MINUTES=30
AUTH_COOKIE_SECURE=false
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCK_MINUTES=15
SEED_ADMIN_EMAIL=admin@geeksolution.local
SEED_ADMIN_PASSWORD=REPLACE_WITH_A_PRIVATE_PASSWORD
SEED_ADMIN_DISPLAY_NAME=Administrador Geek Solution
```

- [ ] **Step 4: Run tests, typecheck, and lint**

```powershell
npm run test -- tests/env.test.ts
npm run typecheck
npm run lint
```

Expected: all commands pass.

- [ ] **Step 5: Record the checkpoint**

Future authorized commit:

```powershell
git add server/src/config/env.ts server/tests/env.test.ts server/vitest.config.ts server/.env.example
git commit -m "feat(auth): validate session configuration"
```

---

### Task 2: Session persistence and incremental migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<generated>_authentication_sessions/migration.sql`
- Create: `server/tests/database/auth-persistence.test.ts`
- Modify: `server/database/verify-database.sql`

**Interfaces:**
- Consumes: existing `Usuario` model and Prisma migration workflow
- Produces: Prisma model `Sesion`, `Usuario.mustChangePassword`, `Usuario.passwordChangedAt`, and `Usuario.sesiones`

- [ ] **Step 1: Write the failing database contract test**

Add a database integration test that creates an active user and persists a
session:

```ts
it("persists a revocable session without storing the raw token", async () => {
  const user = await database.usuario.create({
    data: {
      email: "auth.persistence@example.test",
      displayName: "Auth Persistence",
      status: "ACTIVE",
      passwordHash: "scrypt$v1$fixture",
    },
  });

  const session = await database.sesion.create({
    data: {
      userId: user.id,
      tokenHash: "a".repeat(64),
      lastSeenAt: new Date("2026-07-30T12:00:00.000Z"),
      expiresAt: new Date("2026-07-30T20:00:00.000Z"),
    },
  });

  expect(session.tokenHash).toBe("a".repeat(64));
  expect(session.revokedAt).toBeNull();
});
```

The test cleanup must delete its session first, then its user, using exact IDs.

- [ ] **Step 2: Verify RED**

```powershell
npm run test:db -- tests/database/auth-persistence.test.ts
```

Expected: FAIL because `database.sesion` and the generated type do not exist.

- [ ] **Step 3: Add the Prisma model**

Add to `Usuario`:

```prisma
mustChangePassword Boolean   @default(true) @map("must_change_password")
passwordChangedAt  DateTime? @map("password_changed_at") @db.Timestamptz(3)
sesiones           Sesion[]
```

Add:

```prisma
model Sesion {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash") @db.VarChar(64)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  lastSeenAt DateTime  @map("last_seen_at") @db.Timestamptz(3)
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz(3)
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz(3)
  ipAddress  String?   @map("ip_address") @db.VarChar(45)
  userAgent  String?   @map("user_agent") @db.VarChar(500)

  usuario Usuario @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([userId, revokedAt])
  @@index([expiresAt])
  @@map("sesion")
}
```

- [ ] **Step 4: Generate and inspect the migration**

With the local `.env` already configured:

```powershell
npx prisma migrate dev --name authentication_sessions
npm run db:generate
```

Inspect the generated SQL. It must contain only:

- two `ALTER TABLE usuario ADD COLUMN` operations;
- `CREATE TABLE sesion`;
- one unique index for `token_hash`;
- indexes for user/revocation and expiry;
- one restricted foreign key to `usuario`.

It must not contain `DROP TABLE`, `DROP COLUMN`, or data deletion.

- [ ] **Step 5: Apply the migration to the test schema**

```powershell
$env:DATABASE_URL=(Get-Content .env | Select-String '^DATABASE_TEST_URL=').Line.Split('=',2)[1]
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
```

Then update `verify-database.sql` to include `sesion` in the inventory without
hardcoding a total that hides missing tables.

- [ ] **Step 6: Verify GREEN**

```powershell
npm run db:validate
npm run test:db -- tests/database/auth-persistence.test.ts
npm run db:verify
```

Expected: schema valid, session test passes, and verification lists the new
table and constraints.

- [ ] **Step 7: Record the checkpoint**

```powershell
git add server/prisma server/tests/database/auth-persistence.test.ts server/database/verify-database.sql
git commit -m "feat(auth): persist revocable sessions"
```

---

### Task 3: Password validation and scrypt hashing

**Files:**
- Create: `server/src/auth/password.ts`
- Create: `server/src/auth/auth.schemas.ts`
- Create: `server/tests/auth/password.test.ts`

**Interfaces:**
- Produces:
  - `validatePassword(password: string): PasswordValidationResult`
  - `hashPassword(password: string, options?: ScryptOptions): Promise<string>`
  - `verifyPassword(password: string, encodedHash: string): Promise<boolean>`
  - `loginSchema`
  - `changePasswordSchema`

- [ ] **Step 1: Write failing password-policy tests**

```ts
describe("validatePassword", () => {
  it.each([
    ["Short1!", "PASSWORD_TOO_SHORT"],
    ["alllowercase1!", "PASSWORD_UPPERCASE_REQUIRED"],
    ["ALLUPPERCASE1!", "PASSWORD_LOWERCASE_REQUIRED"],
    ["NoNumbersHere!", "PASSWORD_NUMBER_REQUIRED"],
    ["NoSpecial1234", "PASSWORD_SPECIAL_REQUIRED"],
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
```

The break caught is accepting a password that omits a required category or
falls outside 12–128 characters.

- [ ] **Step 2: Verify policy tests RED**

```powershell
npm run test -- tests/auth/password.test.ts
```

Expected: FAIL because `password.ts` does not exist.

- [ ] **Step 3: Implement the policy and Zod request schemas**

Return one stable code per failed rule, in length/lowercase/uppercase/number/
special order. `loginSchema` must normalize email with `.trim().toLowerCase()`
but must not trim the password. `changePasswordSchema` must require distinct
current and new passwords and call the same password policy.

- [ ] **Step 4: Write failing hashing tests**

```ts
it("creates different versioned hashes for the same password", async () => {
  const first = await hashPassword("GeekLocal-2026!", testScryptOptions);
  const second = await hashPassword("GeekLocal-2026!", testScryptOptions);

  expect(first).toMatch(/^scrypt\$v1\$/);
  expect(second).not.toBe(first);
  expect(await verifyPassword("GeekLocal-2026!", first)).toBe(true);
  expect(await verifyPassword("WrongPassword-2026!", first)).toBe(false);
});

it("rejects malformed stored hashes without throwing", async () => {
  await expect(verifyPassword("GeekLocal-2026!", "invalid")).resolves.toBe(false);
});
```

Use cheap injected parameters only in tests:

```ts
const testScryptOptions = { N: 1024, r: 8, p: 1, maxmem: 16 * 1024 * 1024 };
```

- [ ] **Step 5: Verify hashing tests RED**

Expected: policy tests pass and hash tests fail because hashing is not
implemented.

- [ ] **Step 6: Implement asynchronous scrypt**

Use `randomBytes(16)`, `promisify(scrypt)`, explicit production parameters,
64-byte output, Base64 encoding, strict format parsing, length comparison, and
`timingSafeEqual`. Reject unsupported algorithm/version/parameters by returning
`false`, not by leaking a parsing error.

- [ ] **Step 7: Verify GREEN**

```powershell
npm run test -- tests/auth/password.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 8: Record the checkpoint**

```powershell
git add server/src/auth/password.ts server/src/auth/auth.schemas.ts server/tests/auth/password.test.ts
git commit -m "feat(auth): hash and validate passwords"
```

---

### Task 4: Opaque session-token primitives

**Files:**
- Create: `server/src/auth/session-token.ts`
- Create: `server/tests/auth/session-token.test.ts`

**Interfaces:**
- Produces:
  - `createSessionToken(): { rawToken: string; tokenHash: string }`
  - `hashSessionToken(rawToken: string): string`
  - `isSessionUsable(session, now, idleMinutes): boolean`
  - `shouldTouchSession(lastSeenAt, now): boolean`

- [ ] **Step 1: Write failing token tests**

```ts
it("generates a URL-safe token and a deterministic SHA-256 hash", () => {
  const created = createSessionToken();

  expect(created.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(hashSessionToken(created.rawToken)).toBe(created.tokenHash);
  expect(created.tokenHash).not.toContain(created.rawToken);
});

it("rejects absolute, idle, and revoked sessions", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  expect(isSessionUsable(activeSession, now, 30)).toBe(true);
  expect(isSessionUsable({ ...activeSession, revokedAt: now }, now, 30)).toBe(false);
  expect(isSessionUsable({ ...activeSession, expiresAt: now }, now, 30)).toBe(false);
  expect(
    isSessionUsable(
      { ...activeSession, lastSeenAt: new Date("2026-07-30T11:29:59.999Z") },
      now,
      30,
    ),
  ).toBe(false);
});

it("touches a session only after five minutes", () => {
  const lastSeenAt = new Date("2026-07-30T12:00:00.000Z");
  expect(shouldTouchSession(lastSeenAt, new Date("2026-07-30T12:04:59.999Z"))).toBe(false);
  expect(shouldTouchSession(lastSeenAt, new Date("2026-07-30T12:05:00.000Z"))).toBe(true);
});
```

- [ ] **Step 2: Verify RED**

```powershell
npm run test -- tests/auth/session-token.test.ts
```

- [ ] **Step 3: Implement token helpers**

Generate 32 bytes with `randomBytes`, encode as `base64url`, and hash with
`createHash("sha256").update(rawToken, "utf8").digest("hex")`. Treat equality
at expiration or idle boundaries as expired. Use exactly 300,000 milliseconds
for touch throttling.

- [ ] **Step 4: Verify GREEN and record the checkpoint**

```powershell
npm run test -- tests/auth/session-token.test.ts
npm run typecheck
npm run lint
git add server/src/auth/session-token.ts server/tests/auth/session-token.test.ts
git commit -m "feat(auth): create opaque session tokens"
```

Do not execute the commit without authorization.

---

### Task 5: Idempotent administrative seed

**Files:**
- Modify: `server/prisma/seed.ts`
- Modify: `server/prisma/seed/identity.ts`
- Modify: `server/tests/database/seed.test.ts`
- Modify: `server/prisma.config.ts` if seed environment loading requires it

**Interfaces:**
- Consumes: `validatePassword`, `hashPassword`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_DISPLAY_NAME`
- Produces: an active `ADMIN` user with `mustChangePassword=true`

- [ ] **Step 1: Write the failing seed test**

Run the seed through an exported function with explicit input rather than
mutating global process state:

```ts
await seedDatabase(database, {
  adminEmail: "admin.seed@geeksolution.example.test",
  adminPassword: "AdminSeed-2026!",
  adminDisplayName: "Administrador Seed",
});
await seedDatabase(database, {
  adminEmail: "admin.seed@geeksolution.example.test",
  adminPassword: "AdminSeed-2026!",
  adminDisplayName: "Administrador Seed",
});

const admin = await database.usuario.findUniqueOrThrow({
  where: { email: "admin.seed@geeksolution.example.test" },
  include: { roles: { include: { rol: true } } },
});

expect(admin.status).toBe("ACTIVE");
expect(admin.mustChangePassword).toBe(true);
expect(admin.passwordHash).toMatch(/^scrypt\$v1\$/);
expect(await verifyPassword("AdminSeed-2026!", admin.passwordHash!)).toBe(true);
expect(admin.roles.map(({ rol }) => rol.code)).toContain("ADMIN");
```

Also test that supplying only email or only password rejects before changing
data.

- [ ] **Step 2: Verify RED**

```powershell
npm run test:db -- tests/database/seed.test.ts
```

Expected: FAIL because seed input and administrator hashing are absent.

- [ ] **Step 3: Refactor seed entry and implement administrator provisioning**

Define:

```ts
export interface SeedOptions {
  adminEmail?: string;
  adminPassword?: string;
  adminDisplayName?: string;
}

export async function seedDatabase(
  database: PrismaClient,
  options: SeedOptions,
): Promise<SeedSummary>
```

Keep the existing CLI entry as a thin adapter from `process.env`. Normalize the
email, validate the password, hash it before the transaction, upsert the user,
assign `ADMIN`, set `ACTIVE`, and revoke existing sessions when replacing the
hash. If neither credential variable exists, preserve the current passwordless
demo behavior.

- [ ] **Step 4: Verify idempotency and secret handling**

```powershell
npm run test:db -- tests/database/seed.test.ts
npm run db:seed
```

Run `db:seed` twice. Counts must remain stable. Verify test output and seed
summary contain no supplied password or hash.

- [ ] **Step 5: Record the checkpoint**

```powershell
git add server/prisma/seed.ts server/prisma/seed/identity.ts server/tests/database/seed.test.ts server/prisma.config.ts
git commit -m "feat(auth): provision initial administrator"
```

---

### Task 6: Authentication repository and service

**Files:**
- Create: `server/src/auth/auth.types.ts`
- Create: `server/src/auth/auth.repository.ts`
- Create: `server/src/auth/auth.service.ts`
- Create: `server/tests/auth/auth-test-context.ts`
- Create: `server/tests/auth/auth-service.test.ts`
- Create: `server/tests/database/auth-persistence.test.ts` additions

**Interfaces:**
- Produces:
  - `AuthPrincipal`
  - `PublicUser`
  - `AuthRepository`
  - `createAuthService(dependencies)`
  - `login(input, context)`
  - `authenticate(rawToken, now)`
  - `logout(rawToken, context)`
  - `changePassword(principal, input, context)`

- [ ] **Step 1: Define types and write failing login tests**

`AuthPrincipal` must contain:

```ts
export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  technicianId: string | null;
  roles: string[];
  permissions: string[];
}
```

Use the real test PostgreSQL schema, unique per-test emails, and cleanup by ID.
Do not mock Prisma.

Test successful login:

```ts
const result = await service.login(
  { email: user.email.toUpperCase(), password: "GeekLogin-2026!" },
  requestContext,
);

expect(result.user.email).toBe(user.email);
expect(result.user.roles).toEqual(["ADMIN"]);
expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
expect(await database.sesion.count({ where: { userId: user.id } })).toBe(1);
```

Test invalid password increments the counter, fifth failure sets `lockedUntil`
to exactly `now + 15 minutes`, and unknown/locked/passwordless/inactive users
all throw `ApiError` with status 401 and code `INVALID_CREDENTIALS`.

- [ ] **Step 2: Verify login tests RED**

```powershell
npm run test:db -- tests/auth/auth-service.test.ts
```

- [ ] **Step 3: Implement repository operations**

Keep each Prisma operation explicit:

- `findLoginUser(email)`
- `recordFailedAttempt(userId, now, maxAttempts, lockMinutes)`
- `recordSuccessfulLoginAndCreateSession(...)`
- `findPrincipalByTokenHash(tokenHash)`
- `touchSession(sessionId, now)`
- `revokeSessionByTokenHash(tokenHash, now)`
- `changePasswordAndRotateSession(...)`

Use Prisma transactions for successful login, fifth-attempt locking, and
password change. Include active roles, active role permissions, and optional
technician in principal queries.

- [ ] **Step 4: Implement service login**

Inject:

```ts
interface AuthServiceDependencies {
  repository: AuthRepository;
  now: () => Date;
  hashPassword: typeof hashPassword;
  verifyPassword: typeof verifyPassword;
  createSessionToken: typeof createSessionToken;
  config: AuthConfig;
}
```

Always execute one password verification. Use a valid precomputed dummy scrypt
hash for users that cannot authenticate. Create `expiresAt` from the injected
clock and configured TTL.

- [ ] **Step 5: Verify login GREEN**

Run the focused database test until all login and lockout cases pass.

- [ ] **Step 6: Write failing authentication, logout, and password-change tests**

Cover:

- active token returns the exact `AuthPrincipal`;
- revoked, absolutely expired, and idle-expired tokens return `null`;
- touch occurs only after five minutes;
- logout revokes a known session and succeeds for an unknown token;
- wrong current password returns `401 INVALID_CREDENTIALS`;
- equal new password returns `400 VALIDATION_ERROR`;
- successful change sets `mustChangePassword=false`;
- all other sessions are revoked;
- current session token rotates and the old token stops working.

- [ ] **Step 7: Implement the remaining service methods and verify GREEN**

Use a single transaction for password update, other-session revocation, current
session revocation, replacement-session creation, and audit insertion.

```powershell
npm run test:db -- tests/auth/auth-service.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 8: Record the checkpoint**

```powershell
git add server/src/auth server/tests/auth server/tests/database/auth-persistence.test.ts
git commit -m "feat(auth): implement session authentication service"
```

---

### Task 7: Origin, authentication, and permission middleware

**Files:**
- Create: `server/src/middlewares/origin.middleware.ts`
- Create: `server/src/middlewares/authentication.middleware.ts`
- Create: `server/src/middlewares/permission.middleware.ts`
- Modify: `server/src/types/express.d.ts`
- Create: `server/tests/auth/authorization.test.ts`

**Interfaces:**
- Consumes: `AuthService.authenticate`, `AuthPrincipal`, `Environment.CORS_ORIGINS`
- Produces:
  - `requireAllowedOrigin(allowedOrigins)`
  - `createAuthenticationMiddleware(authService)`
  - `requirePasswordChanged`
  - `requirePermission(permissionCode)`
  - `Express.Request.auth?: AuthPrincipal`

- [ ] **Step 1: Write failing middleware behavior tests**

Register temporary real Express routes in the existing `createApp` test hook:

```ts
app.post(
  "/test/protected",
  requireAllowedOrigin(env.CORS_ORIGINS),
  authentication,
  requirePasswordChanged,
  requirePermission("USERS_MANAGE"),
  (_req, res) => res.status(204).end(),
);
```

Assert:

- missing `Origin` returns `403 ORIGIN_REQUIRED`;
- unknown origin returns `403 ORIGIN_NOT_ALLOWED`;
- missing cookie returns `401 AUTHENTICATION_REQUIRED`;
- `mustChangePassword=true` returns `403 PASSWORD_CHANGE_REQUIRED`;
- missing permission returns `403 FORBIDDEN`;
- valid origin, session, changed password, and permission return 204.

Use a small in-memory `AuthService` fake only at the service interface; assert
HTTP behavior, not fake call counts.

- [ ] **Step 2: Verify RED**

```powershell
npm run test -- tests/auth/authorization.test.ts
```

- [ ] **Step 3: Implement middleware**

Origin middleware must check exact string membership in `allowedOrigins`.
Authentication middleware must parse only the `gs_session` cookie, call the
service, attach `req.auth`, and return the standard `ApiError` on failure.

Permission middleware must use:

```ts
export function requirePermission(code: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth?.permissions.includes(code)) {
      next(new ApiError(403, "No tiene permiso para realizar esta acción", "FORBIDDEN"));
      return;
    }
    next();
  };
}
```

Do not infer permissions from role names.

- [ ] **Step 4: Verify GREEN**

```powershell
npm run test -- tests/auth/authorization.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 5: Record the checkpoint**

```powershell
git add server/src/middlewares server/src/types/express.d.ts server/tests/auth/authorization.test.ts
git commit -m "feat(auth): enforce session permissions"
```

---

### Task 8: Authentication HTTP endpoints and cookies

**Files:**
- Create: `server/src/auth/auth.controller.ts`
- Create: `server/src/auth/auth.routes.ts`
- Modify: `server/src/routes/index.ts`
- Modify: `server/src/app.ts`
- Create: `server/tests/auth/auth-http.test.ts`

**Interfaces:**
- Consumes: auth service, schemas, origin middleware, authentication middleware
- Produces:
  - `createAuthController`
  - `createAuthRouter`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/change-password`

- [ ] **Step 1: Write failing HTTP login tests**

Use real service, repository, PostgreSQL test schema, and Supertest agent:

```ts
const response = await request(app)
  .post("/api/v1/auth/login")
  .set("Origin", "http://localhost:5173")
  .send({ email: admin.email, password: "GeekHttp-2026!" })
  .expect(200);

expect(response.body.data.user).toMatchObject({
  email: admin.email,
  mustChangePassword: true,
  roles: ["ADMIN"],
});
expect(response.headers["set-cookie"][0]).toContain("gs_session=");
expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
expect(response.headers["set-cookie"][0]).not.toContain("Secure");
expect(response.headers["cache-control"]).toBe("no-store");
expect(JSON.stringify(response.body)).not.toContain("passwordHash");
```

Also assert production cookie serialization includes `Secure`, and login
without/with disallowed origin is rejected.

- [ ] **Step 2: Verify login HTTP tests RED**

```powershell
npm run test:db -- tests/auth/auth-http.test.ts
```

- [ ] **Step 3: Implement controller and route composition**

The controller owns:

- Zod parsing and `VALIDATION_ERROR` conversion;
- client IP and bounded user-agent extraction;
- `Cache-Control: no-store`;
- `res.cookie("gs_session", rawToken, cookieOptions)`;
- cookie clearing with exactly matching options;
- public response mapping.

Inject the database-backed auth router through `createApiRouter(env, database)`
and change `createApp` to accept an optional database client for tests while
using the existing lazy singleton in the direct server entry.

- [ ] **Step 4: Write failing `me`, logout, and change-password HTTP tests**

Using the Supertest agent cookie jar, assert:

1. `GET /me` returns the authenticated public principal.
2. A route protected with `requirePasswordChanged` is denied initially.
3. `POST /change-password` with correct current password returns 200 and a
   rotated cookie.
4. The protected route then succeeds.
5. `POST /logout` clears the cookie with `Max-Age=0`.
6. `GET /me` then returns 401.
7. Repeating logout still succeeds.

- [ ] **Step 5: Implement the remaining handlers and verify GREEN**

Return:

- login: `200` with `{ user }`;
- me: `200` with `{ user }`;
- change-password: `200` with `{ user }`;
- logout: `204` without a body.

```powershell
npm run test:db -- tests/auth/auth-http.test.ts
npm run test
npm run typecheck
npm run lint
```

- [ ] **Step 6: Record the checkpoint**

```powershell
git add server/src/auth server/src/routes/index.ts server/src/app.ts server/tests/auth/auth-http.test.ts
git commit -m "feat(auth): expose authentication endpoints"
```

---

### Task 9: Audit guarantees, documentation, and complete verification

**Files:**
- Modify: `server/tests/database/auth-persistence.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: completed authentication module and audit writes
- Produces: verified audit behavior and reproducible local instructions

- [ ] **Step 1: Write failing audit assertions**

Exercise real login, fifth failure, logout, and password change. Query
`auditoria` and assert these exact actions appear:

```ts
expect(actions).toEqual(
  expect.arrayContaining([
    "AUTH_LOGIN_SUCCEEDED",
    "AUTH_ACCOUNT_LOCKED",
    "AUTH_LOGOUT",
    "AUTH_PASSWORD_CHANGED",
  ]),
);
```

Serialize every audit `beforeData`, `afterData`, and `reason`, then assert none
contains the submitted passwords, `gs_session`, raw token, password hash, or
token hash.

- [ ] **Step 2: Verify RED or expose missing coverage**

```powershell
npm run test:db -- tests/database/auth-persistence.test.ts
```

Expected: any event not yet persisted fails by its exact action name.

- [ ] **Step 3: Complete missing audit writes**

Add only the missing transaction-bound audit insertion in the repository or
service. Failed attempts below the lock threshold remain structured logs only.
Never add secret values to audit metadata.

- [ ] **Step 4: Verify audit GREEN**

```powershell
npm run test:db -- tests/database/auth-persistence.test.ts
```

- [ ] **Step 5: Document local use**

Update README with this exact operator flow, without real credentials:

```powershell
cd server
Copy-Item .env.example .env
# Editar .env con DATABASE_URL, DATABASE_TEST_URL,
# SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD.
npm run db:migrate
npm run db:seed
npm run dev
```

Document the four endpoints, mandatory password change, local
`AUTH_COOKIE_SECURE=false`, production requirement `true`, and that the
frontend login screen remains for a later phase.

Mark Stage 5 complete in `docs/plans/implementation-plan.md` only after every
verification below passes. Update `current-state.md` test counts from actual
output, not estimates.

- [ ] **Step 6: Run the complete backend verification**

```powershell
cd server
npm run db:validate
npm run db:generate
npx prisma migrate status
npm run db:seed
npm run db:verify
npm run typecheck
npm run lint
npm run test
npm run test:db
npm run build
npm audit --audit-level=moderate
```

Every command must exit 0. Run an additional compiled API smoke test that:

- imports `dist/src/app.js`;
- starts on port 0;
- logs in with a disposable test account;
- calls `/api/v1/auth/me`;
- logs out;
- shuts down HTTP and Prisma in `finally`.

- [ ] **Step 7: Run frontend regression verification**

From the repository root:

```powershell
npm run lint
npm run test -- --run
npm run build
npm audit --audit-level=moderate
```

- [ ] **Step 8: Run repository and secret checks**

```powershell
git diff --check
git check-ignore server/.env server/generated/prisma
git ls-files server/.env
git status --short
```

`server/.env` must be ignored and absent from `git ls-files`. Search
versionable files for actual database URLs, seed passwords, cookie tokens, and
hashes; placeholders such as `USER:PASSWORD` and test-only fixtures are
allowed after manual review.

- [ ] **Step 9: Record the final checkpoint**

Future authorized commit:

```powershell
git add README.md docs server .gitignore
git commit -m "feat(auth): add secure local authentication"
```

Do not execute this commit or any push without explicit user authorization.

---

## Plan self-review checklist

- Every requirement in the approved specification maps to Tasks 1–9.
- Password recovery, MFA, OAuth, UI login, deployment, and resource ownership
  remain outside this plan.
- Every production behavior begins with a focused failing test.
- PostgreSQL integration tests exercise Prisma and transactions without mocking
  persistence.
- Function names and types used by middleware and controllers are produced by
  earlier tasks.
- No task edits the already-applied initial migration.
- No task stores authentication secrets in Git, logs, responses, or audit data.
- Commit commands are documented checkpoints and remain unauthorized for the
  current working tree.
