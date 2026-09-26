---
globs: ["**/docs/roadmap/02-active-core.md"]
---
# ⚡ Active Core Sprint Plane (Phases 25–26)

> ⚠️ **Global Structural Mandate:** Any task introducing domain input validation MUST follow the `constants.ts` / `types.ts` / `[domain].schema.ts` split defined in the global architecture rules.

---

### 📦 Phase 26: Unified Dual-Role Accounts & Explicit Role-Switching ◄ CURRENT FOCUS
> Resolves the identity collision where `Account.email @unique` blocks an artist from booking as a client under the same email profile.
- [ ] **26.1: Dual-Role Core Engine Setup**
  - **Prerequisite Architecture pass:** Enforce the design constraint that an artist's linked client identity must use a standard `ClientProfile` row so precharge models apply naturally.
  - **Architecture decision (confirmed):** `Account.role` stays the account's permanent home role; a new `Session.activeRole` column holds the per-session effective role (dual-role accounts may hold concurrent sessions in different roles; `activeRole` must stay server-trusted for `src/proxy.ts` gating, so it lives in the DB, not a client-readable cookie). Becoming dual-role is an explicit "Become a client" settings action (never automatic, never auto-switches into the new role afterward). Shared Instagram-handle/18+ validation primitives move to `src/lib/clientProfileValidation.ts`; the `ClientProfile` find-or-link matching logic stays auth-owned (not shared with booking's guest-checkout `resolveGuestClientProfile`, whose overwrite-on-repeat-visit semantics are wrong for a one-time authenticated link).
  - **Confirmed 6-layer sub-task breakdown** (each leaf = one isolated PR; do not combine):
    - [x] **26.1.1.1** Data Gateway — add `Session.activeRole AccountRole` column + migration (backfill from `Account.role`). No app code.
    - [x] **26.1.2.1** Domain Service — extract shared `ClientProfile` validation primitives (Instagram regex, 18+ age gate) to `src/lib/clientProfileValidation.ts`; re-point `booking/constants.ts` + `booking.schema.ts` at it (behavior-preserving).
    - [x] **26.1.2.2** Domain Service — `createSession` accepts `activeRole` (required; caller passes the account's role — landed as required, not optional/defaulted, in PR #202).
    - [x] **26.1.2.3** Domain Service — surface `activeRole` on `SessionWithAccount`/`getSessionWithAccount`; `logoutAction` redirect keyed off `activeRole` instead of `role`.
    - [x] **26.1.2.4** Domain Service — `linkOrCreateClientProfileForAccount` service (mocked-Prisma unit test).
    - [x] **26.1.2.5** Domain Service — `switchActiveRole` service (mocked-Prisma unit test).
    - [x] **26.1.3.1** Controller/Action — `becomeClientAction` (+ Zod schema in `auth.schema.ts`).
    - [x] **26.1.3.2** Controller/Action — `switchActiveRoleAction` (+ Zod schema), redirects to `/artist/{artistId}` or `/client`.
    - [ ] **26.1.3.3** Controller/Action — `src/proxy.ts` route guards read `session.activeRole` instead of `session.role`.
    - [ ] **26.1.4.1** UI Primitive — `BecomeClientForm` component.
    - [ ] **26.1.4.2** UI Primitive — `RoleSwitcher` component (toggle link, shown only when both roles are linked).
    - [ ] **26.1.5.1** Domain Hook — `useBecomeClient` hook.
    - [ ] **26.1.5.2** Domain Hook — `useSwitchActiveRole` hook.
    - [ ] **26.1.6.1** View & Route — `/artist/[artistId]/settings/become-client` page + settings nav link.
    - [ ] **26.1.6.2** View & Route — wire `RoleSwitcher` into artist dashboard layout and client portal layout.
