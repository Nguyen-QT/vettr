---
globs: ["**/docs/roadmap/04-future-epics.md"]
---
# 🗺️ Future Epics & Long-Term Strategic Backlog (Phases 34–43)

This tracking file contains large-lift feature sets, complex multi-domain subsystems, and speculative architecture designs. All items listed here require a rigorous, individual *Mandatory Task Breakdown Rule* pass to map out concrete technical layers before execution begins.

---

### 📦 Phase 34: Client CRM
- **Status:** Unscoped.
- **Objectives:** Build a comprehensive per-client dashboard logging absolute history vectors: past sessions, historically attached design assets, transaction volumes, cancellation offenses, and structural client metadata notes (e.g., specific sizing attributes, sensitivities). Currently, no per-client history schema structures exist.

### 📦 Phase 35: Finances / Payouts / Deposit Tracker
- **Status:** Unscoped.
- **Objectives:** Construct an aggregate financial data ledger reporting deposit holds, cleared payout line items, outstanding balances, and gross revenue metrics. This layer will serve strictly as a read-only reporting mapping that aggregates Stripe Connected Account records established in Phase 24—it is not a secondary mechanism for moving money.

### 📦 Phase 36: Trusted Client Deposit Exemption Engine
- **Status:** Scoped.
- [ ] **36.1: Trusted Client Deposit Exemption Engine**
  - [ ] 36.1.1: Data Gateway (`ClientProfile.trusted Boolean @default(false)` global schema attribute modification + migration script).
  - [ ] 36.1.2: Domain Service -- Booking-Owned Trusted Read/Write (Implement `setClientTrusted` service logic and expand `BookingRequestDepositView` with cross-domain client relation parameters).
  - [ ] 36.1.3: Domain Service -- Billing Exemption Check (Configure `createDepositPaymentIntent` and `getPayableDeposits` to immediately bypass deposit collection loops when `clientTrusted` evaluates to true).
  - [ ] 36.1.4: Controller/Action Boundary (`setClientTrustedAction` bound strictly to trusted session validation checks).
  - [ ] 36.1.5: Domain Hook & Logic (Isolate toggling functions into unique, single-purpose mutation hooks matching independent state isolation mandates).
  - [ ] 36.1.6: View & Route (Expose interface controls on cards across panels and ensure dashboard prompts adapt cleanly to exemptions; update specs).

### 📦 Phase 37: VIP / Close-Friends Client Tiers
- **Status:** Unscoped.
- **Objectives:** Deploy a distinct priority relationship status module allowing artists to tightly manage gated, invite-only booking access constraints. This functions as a closed-book access rule—it must remain decoupled from service-level `ComplexityTier` parameters.

### 📦 Phase 38: Placement & Canvas Metadata
- **Status:** Unscoped.
- **Objectives:** Expand booking schemas to capture layout definitions and structural canvas context options (e.g., body canvas positions, base specifications). Fields will slice cleanly into Step 2 of the Phase 17 multi-step wizard.

### 📦 Phase 39: Reference Image Annotations
- **Status:** Unscoped.
- **Objectives:** Allow clients to apply specific technical textual descriptions directly to individual reference photo elements during wizard entry flow sequences.

### 📦 Phase 40: Artist Custom Response Templates
- **Status:** Unscoped.
- **Objectives:** Build automated, quick-copy notification layouts and message presets handling client interactions for confirmation updates, declines, or out-of-bounds follow-ups.

### 📦 Phase 41: In-App Client/Artist Chat
- **Status:** Unscoped.
- **Objectives:** Engineer a dedicated in-platform messaging context linked directly to the identifier of a single `BookingRequest`, removing operational reliance on manual off-platform channels.

### 📦 Phase 42: Interactive Moodboard / Canvas Design Tool
- **Status:** Unscoped.
- **Objectives:** A highly interactive concept visualization builder featuring canvas serialization, structural concept tagging, and coordinate snap frameworks. This layer represents a multi-phase infrastructure epic that will likely absorb the basic annotation schemas of Phases 38–39.

### 📦 Phase 43: Artist Subscription Billing
- **Status:** Unscoped.
- **Objectives:** Implement platform SaaS fee collection routing rules charged natively to the artist profile. 
- **Hard Prerequisite:** Requires a complete, standalone migration refactoring the Stripe Connect gateway from Accounts v1 to Accounts v2 to leverage unified Account customer mapping variables before subscription billing code may be initiated.
