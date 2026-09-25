---
globs: ["**/docs/roadmap/02-active-core.md"]
---
# ⚡ Active Core Sprint Plane (Phases 25–26)

> ⚠️ **Global Structural Mandate:** Any task introducing domain input validation MUST follow the `constants.ts` / `types.ts` / `[domain].schema.ts` split defined in the global architecture rules.

---

### 📦 Phase 25: Universal Back Navigation ◄ CURRENT FOCUS
- [x] **25.1: Universal Back Navigation** (Audit every client/artist sub-page, form view, modal overlay, and drawer layer for a consistent, structured parent back navigation control. Replace scattered layout links with a shared navigation primitive. Scope confirmed with the user: back controls go on true sub-pages/drill-downs only -- settings sub-pages, checkout, client profile, login/signup, `/book/[artistId]`, `/artists`, and the calendar's mobile stack -- not on the artist's top-level tab pages (dashboard/requests/appointments/calendar root), which already have persistent tab nav covering "where do I go." Standardizes on `ChevronLeftIcon` (lucide-react), matching the one existing back pattern already in the app (the calendar's mobile stack). Also adds a shared `src/app/client/layout.tsx`, mirroring `ArtistDashboardLayout`, since no shared client-side layout exists today -- `/client/page.tsx` hand-rolls its own header inline and login/signup/profile render bare `<main>`), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 25.1.1: UI Primitive & Config (a shared `BackNav` component, `src/components/ui/back-nav.tsx` -- ghost icon button + `ChevronLeftIcon` + optional adjacent label, in two modes: `href` for page-to-page `<Link>` back navigation, and `onClick` for in-page stack navigation, supporting the `autoFocus` behavior the calendar's mobile stack already relies on. Zero business logic, no page wiring).
  - [x] 25.1.2: View & Route -- Calendar Mobile Stack (refactor `ArtistCalendarView.tsx`'s local `MobileScreenHeader` to render via `BackNav`'s `onClick` mode instead of its own duplicated markup; no behavior change).
  - [x] 25.1.3: View & Route -- Client Area (new `src/app/client/layout.tsx` mirroring `ArtistDashboardLayout`'s shell -- wordmark link to `/client`, logout form; `/client/page.tsx` drops its inline header; `BackNav` added to `/client/profile/page.tsx` (back to `/client`, replacing its existing one-off `Link`), `/client/login/page.tsx` and `/client/signup/page.tsx` (back to `/`); e2e spec updates for any assertions on the old inline header markup).
  - [x] 25.1.4: View & Route -- Artist Settings, Checkout & Login (`BackNav` added to `src/app/artist/[artistId]/settings/layout.tsx` (back to `/artist/[artistId]`, shown once for all four settings sub-pages); `CheckoutView.tsx`'s existing one-off "Back" `Link` replaced with `BackNav` (same target); `BackNav` added to `/artist/login/page.tsx` (back to `/`); e2e spec updates as needed).
  - [x] 25.1.5: View & Route -- Booking Entry Points (`BackNav` added to `/book/[artistId]/page.tsx` (back to `/artists`) and `/artists/page.tsx` (back to `/`); e2e spec updates as needed).

---

### 📦 Phase 26: Unified Dual-Role Accounts & Explicit Role-Switching
> Resolves the identity collision where `Account.email @unique` blocks an artist from booking as a client under the same email profile.
- [ ] **26.1: Dual-Role Core Engine Setup**
  - **Prerequisite Architecture pass:** Enforce the design constraint that an artist's linked client identity must use a standard `ClientProfile` row so precharge models apply naturally.
  - **Unscoped Execution Plane:** Propose and execute the 6-layer *Mandatory Task Breakdown Rule* pass (Data Gateway through View layer) targeting session validation shifts, `SessionWithAccount` role mutations, role-switch server actions, and route protection updates inside `src/proxy.ts` before writing code.
