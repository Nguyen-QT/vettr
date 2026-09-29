---
globs: ["**/docs/roadmap/02-active-core.md"]
---
# ⚡ Active Core Sprint Plane (Phases 25–28, 50)

> ⚠️ **Global Structural Mandate:** Any task introducing domain input validation MUST follow the `constants.ts` / `types.ts` / `[domain].schema.ts` split defined in the global architecture rules.

---

### 📦 Phase 26: Unified Dual-Role Accounts & Explicit Role-Switching
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
    - [x] **26.1.3.3** Controller/Action — `src/proxy.ts` route guards read `session.activeRole` instead of `session.role`.
    - [x] **26.1.4.1** UI Primitive — `BecomeClientForm` component.
    - [x] **26.1.4.2** UI Primitive — `RoleSwitcher` component (toggle link, shown only when both roles are linked).
    - [x] **26.1.5.1** Domain Hook — `useBecomeClient` hook.
    - [x] **26.1.5.2** Domain Hook — `useSwitchActiveRole` hook.
    - [x] **26.1.6.1** View & Route — `/artist/[artistId]/settings/become-client` page + settings nav link.
    - [x] **26.1.6.2** View & Route — wire `RoleSwitcher` into artist dashboard layout and client portal layout.

---

### 📦 Phase 27: Auth Session Security & Lifecycle Hardening ◄ CURRENT FOCUS
- **Status:** Unscoped.
- **Objectives:** Gaps surfaced during review of the Phase 26 dual-role/session work, ordered by priority for production risk:
  - **27.1** Login throttling/lockout — `loginArtist`/`loginClient` do scrypt-verify with no rate limit or attempt counter; no backstop against credential stuffing beyond hash cost. Highest priority: active, unmitigated attack surface.
  - **27.2** Defensive error isolation on internal DB paths — `linkOrCreateClientProfileForAccount` uses `findUniqueOrThrow` inside a transaction; the calling action (`setUpClientProfileAction`, the actual name in code — the roadmap's `becomeClientAction` label in Phase 26 doesn't match `actions.ts`, worth reconciling when Phase 26 closes) doesn't catch it, so an edge-case failure bubbles as an uncaught 500. Apply the same try/catch isolation discipline architecture.md §6 requires for Stripe calls to this internal DB path.
  - **27.3** Email verification before session issuance — `signupClient` grants a session immediately on account creation with no proof of email ownership.
  - **27.4** Session TTL/cleanup — session rows are created on every login/signup and never pruned; `switchActiveRole`/`getSessionWithAccount` only filter expired rows at read time — no sweep/cron job exists. Growth/scale risk, not an active exploit.
  - **27.5** Audit trail on security-relevant events — role switches, failed logins, and "become a client" links aren't logged anywhere; given CLAUDE.md's cancellation/precharge flagging requirements on `ClientProfile`, an audit trail on identity/role changes belongs at this level. Lowest urgency of the five: compliance/forensics value, not a live gap.
  - **Callout:** once Phase 26's remaining item (`26.1.6.2`) lands, verify the existing "Become a client" + `RoleSwitcher` dual-role design already covers an artist booking as a client with another artist — this was a note from refinement, not a confirmed gap.

---

### 📦 Phase 28: Domain Testing Architecture & Test Layer Migration
- **Status:** Unscoped.
- **Objectives:** Migrate all existing domain tests to use a lightweight, mocked Prisma layer for fast unit testing, while establishing a dedicated real-database integration and E2E testing framework to validate complex multi-domain database constraints and transaction boundary guarantees. Extended scope, priority-ordered: (1) controller/action-layer (`actions.ts`) test coverage — the thin action layer doing session-check + validation + redirect branching is currently untested despite testing.md's edge-case mandate, and it directly wraps the security-sensitive paths in Phase 27 above; (2) hook-level unit tests using `@testing-library/react`'s `renderHook` for every domain hook (none currently exist, despite every service having a `.test.ts`).

---

### 📦 Phase 50: Primary Nav Header & Avatar Identity Menu
> Splits the dashboard header into a left-aligned Primary Nav (daily-operations links) and a right-aligned Avatar dropdown (account/context actions), isolating destructive/context-switch actions behind a divider. Collapses Primary Nav into a mobile slide-out drawer; Avatar dropdown stays anchored top-right at all viewports.
- [ ] **50.1: Nav & Identity Menu Restructure**
  - Data Gateway / Domain Service / Controller layers: N/A — pure presentational composition reusing existing `RoleSwitcherContainer` and `logoutAction`.
  - [ ] **50.1.4.1** UI Primitive — install shadcn `dropdown-menu`, `avatar`, `sheet` components.
  - [ ] **50.1.4.2** UI Primitive — `UserMenu` component: Avatar trigger, dropdown with Settings | (RoleSwitcherContainer row) | --- | Log out.
  - [ ] **50.1.4.3** UI Primitive — `PrimaryNav` component: Dashboard | Requests | Appointments | Calendar links + existing `NavCountBadge`s (artist-only; client portal has no equivalent routes).
  - [ ] **50.1.4.4** UI Primitive — `MobileNavDrawer`: Sheet triggered by a ☰ icon, collapses `PrimaryNav` below the responsive breakpoint.
  - [ ] **50.1.6.1** View & Route — wire `PrimaryNav` + `MobileNavDrawer` + `UserMenu` into `ArtistDashboardLayout` (`src/app/artist/[artistId]/layout.tsx`), replacing the current inline nav/logout markup.
  - [ ] **50.1.6.2** View & Route — wire `UserMenu` only into `ClientLayout` (`src/app/client/(portal)/layout.tsx`); add a Settings entry → `/client/profile` (client portal currently has none).
    
