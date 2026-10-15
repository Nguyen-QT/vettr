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

### 📦 Phase 26: Unified Dual-Role Accounts & Explicit Role-Switching
- **Completed:** Resolved identity collisions by introducing a server-trusted `Session.activeRole` database layer to decouple an account's home identity from its per-session runtime context. Extracted shared Instagram and age validation rules to a core utility module, deployed transactional user profiling linking workflows, and implemented dedicated role-toggle primitives (`RoleSwitcher`) across dashboard layout grids.

### 📦 Phase 27: Auth Session Security & Lifecycle Hardening
- **Completed:** Hardened application-wide identity boundaries by implementing an account-scoped failed login lockout engine with Node-consistent timing fallback mechanics. Isolated critical database transaction boundaries from front-end code using safe, try/catch service primitives. Built out an email ownership validation pipeline integrated with a secure, automated session-cleanup cron network and deployed a structured database auditing model mapping security-relevant actions to append-only forensic event streams.

### 📦 Phase 28.8: `updateClientProfile` Unexpected-Error Isolation
- **Completed:** `updateClientProfile`, `updatePendingBookingRequest` and `cancelBookingRequest` no longer throw unexpected DB errors to the client portal as an uncaught 500. Each returns a typed failure with one generic "try again" message and logs only an opaque id and the Prisma error code. `cancelBookingRequest` separates a failure before commit (an error result, with no refund or PaymentIntent cancel) from a `refundDeposit` throw after commit (still a success, logged as a failed refund). The actions and hooks didn't change: the hooks already show a typed failure inline.
- **Follow-ups:** the five gaps it flagged but didn't fix are Phase 73 in `03-backlog.md`.

### 📦 Phase 28.11: Abuse Test Tier
- **Completed:** Artist login now reserves an attempt with one atomic `UPDATE` (`reserveLoginAttempt`) before checking the password, replacing `recordFailedLoginAttempt`'s compare-and-swap. A parallel burst gets at most 5 passwords checked per lock cycle, and no failure is lost. Integration tests prove the lockout and the 10-per-24h email-code send cap hold under parallel bursts, including alternating sign-in and booking requests. E2E specs drive the lockout through `/artist/login` and show that a capped address gets the normal sign-in screen and no code.
- **Follow-ups:** lockout DoS → Phase 71 (shipped, below); failed-attempt decay and audit rows while locked → Phase 72; constant-time artist login → Phase 52; telling a lost connection from a SQL fault in `P2010` errors → 53.7; per-IP limits, including the public `getAvailableSlotsAction` → 53.6; `/api/uploadthing` limits → 53.5.

### 📦 Phase 54: Private Portal, Canonical Artist Handles & Passwordless Client Booking
- **Completed:** Re-engineered the application's core entry point into a private portal gate by deprecating the public marketplace directory in favour of public `/@handle` profiles with automated lowercase redirect normalization. Fully transitioned the client lifecycle to a passwordless model, replacing standard password sign-up flows with a 6-digit email OTP challenge matrix. Orchestrated a transactional user-provisioning engine that securely handles inline verification, profile linking, and session issuance simultaneously at the final step of the revised booking submission wizard.

### 📦 Phase 71: Artist Lockout Recovery
- **Completed:** A locked-out or forgetful artist can now get back in without the operator. `/artist/forgot-password` emails a single-use reset link (`PasswordResetToken`: 256-bit token, only its sha256 stored, 1-hour expiry, at most 3 live links per account, 60s cooldown, serialised by a row lock on `Account`). Every outcome shows the same confirmation copy and a padded response time, so it adds no enumeration channel. `/artist/reset-password` sets a new password (12–128 characters, new passwords only), clears `failedLoginAttempts`/`lockedUntil`, deletes the account's other links and sessions, and signs the artist straight in, so an attacker can't re-arm the lock before they do. The guarded delete lets exactly one of parallel resets win. Integration tests prove the burst and race cases, and an E2E spec drives the locked-artist flow.
- **Follow-ups:** an old-password login already in flight can still create a session after a reset, and unknown or expired links write no audit row → Phase 72; per-IP limits on the two new actions → 53.6; a "your password was changed" email → Phase 66; stored mixed-case artist emails never get a link → 58.3.
