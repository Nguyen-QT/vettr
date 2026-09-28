---
globs: ["**/docs/roadmap/04-future-epics.md"]
---
# 🗺️ Future Epics & Long-Term Strategic Backlog (Phases 27, 28, 32–36, 41–48)

This tracking file contains large-lift feature sets, complex multi-domain subsystems, security/infra hardening, and speculative architecture designs. All items listed here require a rigorous, individual *Mandatory Task Breakdown Rule* pass to map out concrete technical layers before execution begins. Phase numbers reflect global priority rank across the entire unstarted backlog (see `03-polish-and-config.md` for the lower-lift/cosmetic phases interleaved between these).

---

### 📦 Phase 27: Auth Session Security & Lifecycle Hardening
- **Status:** Unscoped.
- **Objectives:** Gaps surfaced during review of the Phase 26 dual-role/session work, ordered by priority for production risk:
  - **27.1** Login throttling/lockout — `loginArtist`/`loginClient` do scrypt-verify with no rate limit or attempt counter; no backstop against credential stuffing beyond hash cost. Highest priority: active, unmitigated attack surface.
  - **27.2** Defensive error isolation on internal DB paths — `linkOrCreateClientProfileForAccount` uses `findUniqueOrThrow` inside a transaction; the calling action (`setUpClientProfileAction`, the actual name in code — the roadmap's `becomeClientAction` label in Phase 26 doesn't match `actions.ts`, worth reconciling when Phase 26 closes) doesn't catch it, so an edge-case failure bubbles as an uncaught 500. Apply the same try/catch isolation discipline architecture.md §6 requires for Stripe calls to this internal DB path.
  - **27.3** Email verification before session issuance — `signupClient` grants a session immediately on account creation with no proof of email ownership.
  - **27.4** Session TTL/cleanup — session rows are created on every login/signup and never pruned; `switchActiveRole`/`getSessionWithAccount` only filter expired rows at read time — no sweep/cron job exists. Growth/scale risk, not an active exploit.
  - **27.5** Audit trail on security-relevant events — role switches, failed logins, and "become a client" links aren't logged anywhere; given CLAUDE.md's cancellation/precharge flagging requirements on `ClientProfile`, an audit trail on identity/role changes belongs at this level. Lowest urgency of the five: compliance/forensics value, not a live gap.
  - **Callout:** once Phase 26's remaining item (`26.1.6.2`) lands, verify the existing "Become a client" + `RoleSwitcher` dual-role design already covers an artist booking as a client with another artist — this was a note from refinement, not a confirmed gap.

### 📦 Phase 28: Domain Testing Architecture & Test Layer Migration
- **Status:** Unscoped.
- **Objectives:** Migrate all existing domain tests to use a lightweight, mocked Prisma layer for fast unit testing, while establishing a dedicated real-database integration and E2E testing framework to validate complex multi-domain database constraints and transaction boundary guarantees. Extended scope, priority-ordered: (1) controller/action-layer (`actions.ts`) test coverage — the thin action layer doing session-check + validation + redirect branching is currently untested despite testing.md's edge-case mandate, and it directly wraps the security-sensitive paths in Phase 27 above; (2) hook-level unit tests using `@testing-library/react`'s `renderHook` for every domain hook (none currently exist, despite every service having a `.test.ts`).

### 📦 Phase 32: Trusted Client Deposit Exemption Engine
- **Status:** Scoped.
- [ ] **32.1: Trusted Client Deposit Exemption Engine**
  - [ ] 32.1.1: Data Gateway (`ClientProfile.trusted Boolean @default(false)` global schema attribute modification + migration script).
  - [ ] 32.1.2: Domain Service -- Booking-Owned Trusted Read/Write (Implement `setClientTrusted` service logic and expand `BookingRequestDepositView` with cross-domain client relation parameters).
  - [ ] 32.1.3: Domain Service -- Billing Exemption Check (Configure `createDepositPaymentIntent` and `getPayableDeposits` to immediately bypass deposit collection loops when `clientTrusted` evaluates to true).
  - [ ] 32.1.4: Controller/Action Boundary (`setClientTrustedAction` bound strictly to trusted session validation checks).
  - [ ] 32.1.5: Domain Hook & Logic (Isolate toggling functions into unique, single-purpose mutation hooks matching independent state isolation mandates).
  - [ ] 32.1.6: View & Route (Expose interface controls on cards across panels and ensure dashboard prompts adapt cleanly to exemptions; update specs).

### 📦 Phase 33: Per-Artist Slot Rules & Service Duration Configuration
- [ ] **33.1: Slot Rules Configurability** (Unscoped -- Deconstruct and widen global schedule definitions, dynamically linking duration thresholds and fixed slot selections directly to metadata records configured by the artist).

### 📦 Phase 34: Per-Artist Customizable Tiers/Service Types
- [ ] **34.1: Tier Configurability** (Unscoped -- Restructure the hardcoded `ComplexityTier` literal definitions across both the booking and billing systems into dynamic database-backed options).

### 📦 Phase 35: Tier Reference Gallery Management UI
- [ ] **35.1: Artist-Facing Gallery Management** (Deploy file management triggers allowing artists to dynamically upload, reorder, or scrub assets tracking `TierReferenceImage` collections).

### 📦 Phase 36: Finances / Payouts / Deposit Tracker
- **Status:** Unscoped.
- **Objectives:** Construct an aggregate financial data ledger reporting deposit holds, cleared payout line items, outstanding balances, and gross revenue metrics. This layer will serve strictly as a read-only reporting mapping that aggregates Stripe Connected Account records established in Phase 24—it is not a secondary mechanism for moving money.

### 📦 Phase 41: Artist Custom Response Templates
- **Status:** Unscoped.
- **Objectives:** Build automated, quick-copy notification layouts and message presets handling client interactions for confirmation updates, declines, or out-of-bounds follow-ups.

### 📦 Phase 42: Client CRM
- **Status:** Unscoped.
- **Objectives:** Build a comprehensive per-client dashboard logging absolute history vectors: past sessions, historically attached design assets, transaction volumes, cancellation offenses, and structural client metadata notes (e.g., specific sizing attributes, sensitivities). Currently, no per-client history schema structures exist.

### 📦 Phase 43: Artist Subscription Billing
- **Status:** Unscoped.
- **Objectives:** Implement platform SaaS fee collection routing rules charged natively to the artist profile.
- **Hard Prerequisite:** Requires a complete, standalone migration refactoring the Stripe Connect gateway from Accounts v1 to Accounts v2 to leverage unified Account customer mapping variables before subscription billing code may be initiated.

### 📦 Phase 44: In-App Client/Artist Chat
- **Status:** Unscoped.
- **Objectives:** Engineer a dedicated in-platform messaging context linked directly to the identifier of a single `BookingRequest`, removing operational reliance on manual off-platform channels.

### 📦 Phase 45: VIP / Close-Friends Client Tiers
- **Status:** Unscoped.
- **Objectives:** Deploy a distinct priority relationship status module allowing artists to tightly manage gated, invite-only booking access constraints. This functions as a closed-book access rule—it must remain decoupled from service-level `ComplexityTier` parameters.

### 📦 Phase 46: Placement & Canvas Metadata
- **Status:** Unscoped.
- **Objectives:** Expand booking schemas to capture layout definitions and structural canvas context options (e.g., body canvas positions, base specifications). Fields will slice cleanly into Step 2 of the Phase 17 multi-step wizard.

### 📦 Phase 47: Reference Image Annotations
- **Status:** Unscoped.
- **Objectives:** Allow clients to apply specific technical textual descriptions directly to individual reference photo elements during wizard entry flow sequences.

### 📦 Phase 48: Interactive Moodboard / Canvas Design Tool
- **Status:** Unscoped.
- **Objectives:** A highly interactive concept visualization builder featuring canvas serialization, structural concept tagging, and coordinate snap frameworks. This layer represents a multi-phase infrastructure epic that will likely absorb the basic annotation schemas of Phases 46–47.
