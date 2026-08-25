# Task 3 report — Auth gate and authentication screens

## Scope delivered

- Added `AuthGate`, which blocks private children for `checking`, `unavailable`,
  `anonymous`, and authenticated provisional-password states. Only a definitive
  authenticated user receives the children.
- Added the shared `PasswordChangeForm` for Task 4's future voluntary flow, plus
  `PasswordField`, `AuthLayout`, login, mandatory-password-change, and retry
  pages.
- Added an accessible technical-status auth surface matching the approved
  direction: ink/navy field, compact paper credential surface, cyan technical
  pulse, 320 px mobile treatment, visible focus, and a static pulse when reduced
  motion is requested.
- No credential, token, cookie, or user persistence was introduced.

## TDD evidence

### RED

1. Added `src/auth/AuthGate.test.tsx` before `AuthGate.tsx` and all new auth
   views. `npm test -- src/auth/AuthGate.test.tsx` failed with Vite import
   resolution for the absent `./AuthGate` module (0 tests collected), the
   expected missing-feature failure.
2. Added `src/pages/auth-pages.test.tsx` before auth page production modules.
   `npm test -- src/pages/auth-pages.test.tsx` failed with Vite import
   resolution for the absent `./ForcedPasswordChangePage` module (0 tests
   collected), the expected missing-feature failure.
3. For the required pending submission behavior, temporarily omitted the submit
   `disabled` binding, then added the focused behavioral test. `npm test --
   src/pages/auth-pages.test.tsx` failed exactly because the visible
   `Actualizando contraseña…` button was not disabled.
4. Added a defensive test for an inconsistent `authenticated`/missing-user
   context. `npm test -- src/auth/AuthGate.test.tsx` failed because private
   content was rendered; the gate now routes that state to login.

### GREEN

- Implemented the smallest components and translations to satisfy the tests,
  then restored the pending submit binding.
- `npm test -- src/auth/AuthGate.test.tsx src/pages/auth-pages.test.tsx`:
  2 files, 19 tests passed.

## Files changed

- `src/auth/AuthGate.tsx`
- `src/auth/AuthGate.test.tsx`
- `src/components/auth/AuthLayout.tsx`
- `src/components/auth/PasswordField.tsx`
- `src/components/auth/PasswordChangeForm.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/ForcedPasswordChangePage.tsx`
- `src/pages/SessionUnavailablePage.tsx`
- `src/pages/auth-pages.test.tsx`
- `src/styles.css`

## Behaviour and accessibility covered

- Login sends the supplied email/password once, translates known login errors,
  and does not render raw backend error detail.
- Password visibility has changing accessible labels; confirmation blocks the
  request locally; all six `PASSWORD_*` policy codes map to Spanish guidance;
  the relevant field obtains `aria-describedby` and `aria-invalid`.
- A pending password mutation disables its submit action while leaving the
  forced-flow logout action enabled. The unavailable view exposes retry.
- The forced form has no cancellation control. `PasswordChangeForm` supports an
  optional cancel control for the voluntary profile dialog in Task 4.

## Final verification

| Command | Result |
| --- | --- |
| `npm test -- src/auth/AuthGate.test.tsx src/pages/auth-pages.test.tsx` | 2 files, 19 tests passed |
| `npm test` | 10 files, 52 tests passed |
| `npm run lint` | exit 0, no warnings |
| `npm run build` | exit 0; TypeScript and Vite build succeeded |
| `git diff --check` | exit 0; no whitespace errors |

## Concerns / handoff

- Task 3 intentionally does not mount `AuthProvider`/`AuthGate` in `App`; that
  integration belongs to Task 4. Until then, the application shell is not yet
  gated at the root.
- The password-policy messages reflect the six backend `PASSWORD_*` codes.
  Non-policy responses intentionally use safe, non-raw fallback text.
