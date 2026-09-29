---
globs: ["**/docs/roadmap/04-future-epics.md"]
---
# 🗺️ Future Epics & Long-Term Strategic Backlog (Phases 32–36, 41–48, 51)

This tracking file contains large-lift feature sets, complex multi-domain subsystems, security/infra hardening, and speculative architecture designs. All items listed here require a rigorous, individual *Mandatory Task Breakdown Rule* pass to map out concrete technical layers before execution begins. Phase numbers reflect global priority rank across the entire unstarted backlog (see `03-polish-and-config.md` for the lower-lift/cosmetic phases interleaved between these; Phases 27, 28, and 50 have been promoted into `02-active-core.md`).

---

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

### 📦 Phase 51: Client-to-Artist Dual-Role Direction
- **Status:** Unscoped.
- **Objectives:** Phase 26's dual-role design is one-directional by construction — `becomeClientAction`/`RoleSwitcher` let an existing artist account also operate as a client, but there is no equivalent path for an existing client account to gain artist access. Confirmed during Phase 26 closeout: `src/domains/auth/actions.ts` only exports `loginArtist`, no `signupArtist` — artist accounts are provisioned out-of-band (curated onboarding), not self-serve like `signupClient`. `Account.artistId`/`clientProfileId` are already direction-agnostic nullable unique FKs, so the data model needs no change; this is purely an onboarding-flow decision. Before scoping, resolve whether artist access should stay admin/business-curated (an internal "grant artist access to this client account" tool, no public signup) or become self-serve (a public `signupArtist`-equivalent flow, raising the same vetting/quality-control questions the business presumably wanted by not exposing artist signup in the first place).
