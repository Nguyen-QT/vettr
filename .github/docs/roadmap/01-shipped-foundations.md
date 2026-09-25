---
globs: ["**/*.md"]
---
# 📦 Shipped Foundations Archive (Phases 1–24.1)

This ledger tracks the high-level completions, core technical parameters, and critical domain invariants established during the completed phases of the application workspace.

---

### 📦 Phase 1: Database Foundation & Domain Mapping
- **Completed:** Initialized core PostgreSQL schema architecture natively via Prisma. Configured entity relationships and cross-table schemas mapping boundaries out explicitly for `Artist`, `ClientProfile`, `IntakeRequest`, and `TimeSlot`.

### 📦 Phase 2: Core Intake Engine & Visual Guardrails
- **Completed:** Formulated Zod validation layers enforcing strict custom regex constraints on Instagram handles. Implemented core UploadThing backend endpoint route handlers, built the standalone `services/validateComplexity.ts` business logic domain with full unit coverage, and deployed Next.js React Server Actions connecting `VisualIntakeForm.tsx` via custom logic orchestration hooks.

### 📦 Phase 3: Artist Decision Dashboard
- **Completed:** Scaffolded mobile-first layouts tailored for working artists. Engineered interactive dashboard review layout cards supporting 1-click Instagram profile links and asset maps, and built the structural status mutator actions executing internal state overrides.

### 📦 Phase 4: Concurrency Rules & Financial Logic
- **Completed:** Built concurrency-safe slot allocation logic (`confirmTimeSlot`) preventing double-bookings. Bound required email capture validation schemas (Phase 4.2), deployed the `getOperatingWindows` schedule override grid (Phase 4.3), implemented application-layer `estimatedPrice` review enforcements (Phase 4.4), created the future-appointments appointments view list grid (Phase 4.5), and established the artist-specific `TierReferenceImage` layout gallery (Phase 4.6).

### 📦 Phase 5: Authentication & Access Control
- **Completed:** Deployed custom hand-rolled authentication middleware (`src/proxy.ts`) providing layout protection across portals. Set up guest-capable self-service booking links, constructed a three-option root landing directory `/`, implemented client-led cancellation/modification timing policies (Phase 5.4), built single-transaction reschedule slot shifts (Phase 5.5), and configured the `STRIKE_THRESHOLD = 1` client strike enforcement engine (Phase 5.6).

### 📦 Phase 6: Critical Access & Onboarding Fixes
- **Completed:** Resolved prefill field locks on the intake layout form for authenticated clients. Enforced a mandatory 18+ Date of Birth gating schema constraint (`@db.Date` via Phase 6.2), and implemented advisory `clientMaxEndTime` metadata tags (Phase 6.3).

### 📦 Phase 7: Financial Engine, Payments & Policy Enforcement
- **Completed:** Embedded in-app Stripe Elements Checkout collecting deposits based on per-artist `ComplexityTier` configs. Executed thorough cross-domain boundary refactors removing direct multi-table database queries, built an automatic refund/forfeiture execution webhook loop backstop, and deployed the 50% upfront precharge calculation engine for flagged accounts. Finalized full appointment day-of checkout addon accounting trackers.

### 📦 Phase 8: Domain Rename — Intake to Booking
- **Completed:** Conducted full-depth codebase migration renaming all code blocks, folders, types, and DB columns from `IntakeRequest` to `BookingRequest`.

### 📦 Phases 9–23: Architectural Safety, CRM, & Layout Refactors
- **Completed:** Integrated shared confirm-dialog layout blocks gating all destructive changes. Created client profile dashboard editing menus, added cancellation strikes badges to `RequestCard`, built structural text wizard explainers, and expanded form fields to support dropzone image removals/previews. Deployed live Stripe test-mode workflows and browser suites directly inside the GitHub Actions CI pipeline. Resolved multi-submit bugs via Stripe idempotency keys, made `ClientProfile.email` unique via database merges, converted the booking form into a 4-step wizard stepper layout, expanded appointment cards into full side drawers, engineered desktop-split/mobile-stacked calendar agenda grids with Framer Motion transitions, split operating settings into clear sub-routes, tabbed appointment views with search param state sync, deployed a unified stats aggregation home screen grid, and established client-side `CASH | CARD` payment preference selectors with artist-overrides at final checkout.

### 📦 Phase 24: Artist Bank Payouts via Stripe Connect
- **Completed:** Onboarded artists as Stripe Connect Express accounts. Updated `Artist` schemas to capture connected account tokens and dynamic capability flags. Built the foundational domain workflows inside a fresh `billing` service container, integrating Connect status syncs, webhook update triggers, onboarding link parameters, and custom payment intent generation blocks. Deployed accompanying state orchestration hooks (`useArtistConnectOnboarding`) and view panels.

### 📦 Phase 25: Universal Back Navigation 
- **Completed:** Audited every client/artist sub-page, form view, modal overlay, and drawer layer for a consistent, structured parent back navigation control. Replaced scattered layout links with a shared navigation primitive. Standardizes on `ChevronLeftIcon` (lucide-react), matching the one existing back pattern already in the app (the calendar's mobile stack). Also adds a shared `src/app/client/layout.tsx`, mirroring `ArtistDashboardLayout`, since no shared client-side layout exists today.