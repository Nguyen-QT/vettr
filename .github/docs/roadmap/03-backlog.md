---
globs: ["**/docs/roadmap/03-backlog.md"]
---
# Product Backlog

Everything not yet in `02-active-core.md`'s active sprint, merged on 2026-10-12 from the former `03-polish-and-config.md` and `04-future-epics.md`. Phase numbers are stable IDs, not a priority rank. The order of the priority index below is the work order. Every phase needs its own 6-layer breakdown pass (`git-workflow.md` §3) before any code.

Retired numbers: 62–64 were folded into 53.7/53.8 (`02-active-core.md`) and 56.13 moved into Phase 56 there. 25.2 became 38.4. Do not reuse these numbers.

---

## Priority Index

### Gates go-live (53.3)
These run alongside the gates in `02-active-core.md` (28.8, 28.11, 50, 53.4–53.8, 53.10, 56.8–56.13, 58.1–58.9).
1. **31: Required Field Visual Indicator** (Client & artist forms) ➔ A workspace-wide marker for required fields, linked to the Zod schemas. Goes first so every form built after it uses the convention.
2. **30: Post-Submission UX** (Client) ➔ Confirmation email plus copy on the existing `BookingSubmittedConfirmation`. The screen itself shipped in 54.5.4.4.
3. **40: Min/Max Budget Inputs** (Client) ➔ Replace the Step 2 budget slider with minimum and maximum scroll inputs stepping in 5s. After 58.4, which adds the budget maximum.
4. **38.4: Profile Back Button** (Client) ➔ `ChevronLeftIcon` back control on `/@handle` for signed-in clients, back to `/client`. After 50.
5. **39: Artist Profile Management** (Artist) ➔ Artists edit their `avatarUrl`, `bio`, `location` and `handle`.
6. **35: Tier Reference Gallery Management** (Artist) ➔ Artists upload, reorder and remove `TierReferenceImage` examples. After 53.5.
7. **33.1: Slot Rules Configurability** (Scheduling) ➔ Per-artist duration thresholds and slot intervals instead of global definitions.
8. **33.2: Manual Scheduling Overrides** (Scheduling) ➔ Artists force an appointment into an unavailable or conflicting slot behind a multi-step confirmation. After 33.1, so the bypass is built on the new rules.
9. **61: Business Event Logging** (Platform) ➔ Booking and payment lifecycle events beyond the security audit stream. After 53.9's logger.
10. **42: Client CRM** (Artist) ➔ Per-client history: completed sessions, spend, design assets, cancellation strikes and notes. Can read 61's events.
11. **34: Database-Backed Tiers** (Payments) ➔ Replace the hardcoded `ComplexityTier` literals with per-artist database records.
### Post-launch
1. **59: Client Passkeys** (Auth) ➔ Passkey sign-in on top of the email code. First post-launch item; fully designed below.
2. **66: Sign-In Notification Emails** (Auth) ➔ An email to artists and clients after every successful sign-in. After 59, so passkey sign-ins send it too.
3. **29: Hook State Hygiene** (Tech debt) ➔ Fix the `set-state-in-effect` sites. Before 28.5 (`02-active-core.md`), so the hook tests don't pin behaviour 29 changes.
4. **57: Payment Event Ledger** (Payments) ➔ Append-only payment events and removal of billing's imports of booking (architecture.md §4). Before 32, 36 and 43, which would each add to that dependency.
5. **60: Platform Admin Dashboard** (Platform) ➔ Admin-only health, Connect onboarding and manual refund tools. Builds on 56.11's decision.
6. **36: Financial Reporting** (Payments) ➔ Read-only deposits, payouts and revenue reporting. Reads 57's ledger.
7. **37: Active-Page Context** (Navigation) ➔ Breadcrumbs or active-nav highlighting. After 50.
8. **38.2–38.3: Layout Consistency** (Navigation) ➔ Nested viewport-unit audit; settings back button restyle.
9. **32: Trusted Client Deposit Exemption** (Payments) ➔ Already scoped; artists exempt trusted clients from deposits.
10. **41: Artist Response Templates** (Artist) ➔ Quick-copy presets for approvals, declines and follow-ups.
11. **70: Client Request Status Timeline** (Client) ➔ Clear stages from Submitted to Confirmed, with the artist's usual reply time. Before 44, whose chat attaches to the same per-request view.
12. **44: In-App Chat** (Client & artist) ➔ Messaging tied to a `BookingRequest`, replacing SMS and Instagram threads, with email/SMS links straight to the thread.
13. **45: VIP / Close-Friends Tiers** (Client) ➔ Invite-only booking access, separate from complexity tiers.
14. **43: Artist Subscription Billing** (Payments) ➔ Platform SaaS fee charged to artists. Needs the Connect Accounts v2 migration first.
15. **67: Artist Intake Form Builder** (Artist) ➔ Per-artist required, optional and hidden fields, plus custom questions. Before 46, which it likely absorbs.
16. **68: Booking Page Branding** (Artist) ➔ Per-artist cover image and accent colour on `/@handle`. After 67.
17. **69: Multi-Craft Service Model** (Platform) ➔ Nails, lashes and aesthetics alongside tattoo work. After 68; also needs 34 and 67.
18. **46: Placement & Canvas Metadata** (Client booking) ➔ Body placement fields in the booking wizard.
19. **47: Reference Image Annotations** (Client booking) ➔ Clients add notes to individual reference photos.
20. **48: Moodboard / Canvas Design Tool** (Client booking) ➔ Interactive concept builder; likely absorbs 46–47.
21. **55: SMS OTP Channel** (Auth) ➔ Phone codes as a second channel. After 59.
22. **52: Constant-Time Artist Login** (Auth) ➔ Equal response time on every login rejection. After 53.6.
23. **51: Client-to-Artist Dual Role** (Auth) ➔ Decide how a client account gains artist access. Needs a product decision first.
24. **49: Domain Service Refactor** (Tech debt) ➔ No scope yet; needs a scoping conversation.
25. **65: Recovered Tech Debt** (Tech debt) ➔ Dead code and a duplicated guard flagged in 28.7.

---

## Phase Detail

### Phase 29: Hook State Hygiene Debt
- [ ] **29.1: Fix the `react-hooks/set-state-in-effect` sites** (Re-engineer state flows flagged inside theme controls, deposit forms, and schedule options to consume mount utilities natively without triggering validation cascade warnings).
- [ ] **29.2: Retrofit Independent Mutation State Isolation onto Pre-Existing Hooks** (Refactor legacy schedule configurations to isolate transaction updates into unique independent execution state pairs).

---

### Phase 30: Post-Submission Request Confirmation UX
- [ ] **30.1: Client Post-Submission Flow** (Unscoped -- Define what a client sees/does immediately after submitting a booking request: confirmation screen state, messaging on "no auto-booking, artist will review", and any status page or email. Currently underspecified per CLAUDE.md's "no auto-booking" model).
- **Scope update (2026-10-12):** most of this shipped in 54.5.4.4. `BookingSubmittedConfirmation` already tells the client the artist will review the request and links to `/client`. What's left: a confirmation email to the client after a request is submitted, and any copy changes to `BookingSubmittedConfirmation`. No new route: `/book/[artistId]` is now a 308 redirect to `/@handle/book` (54.1.6.2).
- **Scope update (2026-10-14, Venue review):** the confirmation email links to the client portal (`/client`), going through sign-in if the session has expired. A link to the single request waits for the per-request route that Phase 70 adds.

---

### Phase 31: Required Field Visual Indicator Standard
- [ ] **31.1: Required Field Visual Indicator** (Unscoped -- Establish a consistent visual marker, e.g. asterisk + semantic color token per frontend.md's token rules, for required fields across all forms, tying into validation.md's existing schema-layer constraints so required-ness is visually surfaced, not just enforced server-side).

---

### Phase 32: Trusted Client Deposit Exemption Engine
- **Status:** Scoped.
- [ ] **32.1: Trusted Client Deposit Exemption Engine**
  - [ ] 32.1.1: Data Gateway (`ClientProfile.trusted Boolean @default(false)` global schema attribute modification + migration script).
  - [ ] 32.1.2: Domain Service -- Booking-Owned Trusted Read/Write (Implement `setClientTrusted` service logic and expand `BookingRequestDepositView` with cross-domain client relation parameters).
  - [ ] 32.1.3: Domain Service -- Billing Exemption Check (Configure `createDepositPaymentIntent` and `getPayableDeposits` to immediately bypass deposit collection loops when `clientTrusted` evaluates to true).
  - [ ] 32.1.4: Controller/Action Boundary (`setClientTrustedAction` bound strictly to trusted session validation checks).
  - [ ] 32.1.5: Domain Hook & Logic (Isolate toggling functions into unique, single-purpose mutation hooks matching independent state isolation mandates).
  - [ ] 32.1.6: View & Route (Expose interface controls on cards across panels and ensure dashboard prompts adapt cleanly to exemptions; update specs).

---

### Phase 33: Per-Artist Slot Rules & Service Duration Configuration
- [ ] **33.1: Slot Rules Configurability** (Unscoped -- Deconstruct and widen global schedule definitions, dynamically linking duration thresholds and fixed slot selections directly to metadata records configured by the artist).

- [ ] **33.2: Manual Scheduling Overrides & Collision Bypass** (Unscoped -- Formulate a high-privilege exception handling engine allowing working artists to explicitly bypass automated calendar cadences, operating windows, and anti-collision constraints. Rather than disabling system rules, this introduces an isolated, authenticated state path that explicitly marks overlapping or non-standard appointments while preserving downstream transaction and booking integrity).

- **Order:** 33.1 before 33.2. 33.2 marks appointments that break the slot rules, and 33.1 reshapes those rules; building the bypass first would mean reworking it afterwards.

---

### Phase 34: Per-Artist Customizable Tiers/Service Types
- [ ] **34.1: Tier Configurability** (Unscoped -- Restructure the hardcoded `ComplexityTier` literal definitions across both the booking and billing systems into dynamic database-backed options).

---

### Phase 35: Tier Reference Gallery Management UI
- [ ] **35.1: Artist-Facing Gallery Management** (Deploy file management triggers allowing artists to dynamically upload, reorder, or scrub assets tracking `TierReferenceImage` collections).
- **Order:** after 53.5 (upload endpoint hardening), which changes how the UploadThing endpoint is authenticated.

---

### Phase 36: Finances / Payouts / Deposit Tracker
- **Status:** Unscoped.
- **Objectives:** Construct an aggregate financial data ledger reporting deposit holds, cleared payout line items, outstanding balances, and gross revenue metrics. This layer will serve strictly as a read-only reporting mapping that aggregates Stripe Connected Account records established in Phase 24—it is not a secondary mechanism for moving money.

---

### Phase 37: Global Navigation & Active-Page Context Clarity
- [ ] **37.1: Active-Page Context Indicators** (Unscoped -- Make it obvious to users which page/section they're currently in, via breadcrumbs, active-nav-item highlighting, or page-title treatment, across the dashboard/settings/booking flows).

---

### Phase 38: Layout & Responsive Consistency Polish
- [ ] **38.1: Request Page Padding Standardization** (**SUPERSEDED by 54.1.6.2** — `/book/[artistId]` becomes a redirect; the booking page moves to `/@handle/book`.) (`/book/[artistId]/page.tsx` padding adjustments matching container class standards).
- [ ] **38.2: Nested Viewport Unit Audit** (Workspace-wide component check tracking down and eliminating hardcoded nested sizing constraints).
- [ ] **38.3: Settings Back-Button Consistency** (The settings page back navigation currently renders as a full-width bar, inconsistent with the standard nav affordances used elsewhere in the app; restyle to match).
- [ ] **38.4: Client-Facing Profile Back Button** (Added 2026-10-12 as 25.2; renumbered here because Phase 25 has shipped. Add the shared `ChevronLeftIcon` back control to public `/@handle` profiles so a signed-in client can return to `/client`. Do it after Phase 50, which rebuilds the header, and alongside 38.3).

---

### Phase 39: Artist Profile Management UI
- [ ] **39.1: Profile Editing** (Unscoped -- Deconstruct dynamic dashboard text forms writing fields for `avatarUrl`, `bio`, and `location` using the public interfaces of the `directory` context).
- **Scope addition (from Phase 54):** also let artists edit their `handle`, validated with `artistHandleSchema` (`src/lib/artistHandle.ts`). Changing a handle breaks links already shared to the old `/@handle`; the design pass decides whether old handles redirect.

---

### Phase 40: Budget Input Enhancements
- [ ] **40.1: Minimum/Maximum Budget Inputs** (Rescoped 2026-10-12; replaces the earlier "slider & wheel picker polish" scope. Remove the static budget slider from the booking wizard. Clients enter a minimum and a maximum budget with scroll inputs that step in increments of 5, bound to the booking validation schema).
- **Order:** after 58.4, which adds the budget maximum to `clientBudgetRangeSchema`, so both changes use the same schema.

---

### Phase 41: Artist Custom Response Templates
- **Status:** Unscoped.
- **Objectives:** Build automated, quick-copy notification layouts and message presets handling client interactions for confirmation updates, declines, or out-of-bounds follow-ups.

---

### Phase 42: Client CRM
- **Status:** Unscoped.
- **Objectives:** Build a comprehensive per-client dashboard logging absolute history vectors: past sessions, historically attached design assets, transaction volumes, cancellation offenses, and structural client metadata notes (e.g., specific sizing attributes, sensitivities). Currently, no per-client history schema structures exist.

---

### Phase 43: Artist Subscription Billing
- **Status:** Unscoped.
- **Objectives:** Implement platform SaaS fee collection routing rules charged natively to the artist profile.
- **Hard Prerequisite:** Requires a complete, standalone migration refactoring the Stripe Connect gateway from Accounts v1 to Accounts v2 to leverage unified Account customer mapping variables before subscription billing code may be initiated.

---

### Phase 44: In-App Client/Artist Chat
- **Status:** Unscoped.
- **Objectives:** Engineer a dedicated in-platform messaging context linked directly to the identifier of a single `BookingRequest`, removing operational reliance on manual off-platform channels.
- **Scope update (2026-10-14, Venue review):** Venue gets two things right: every message lives on the appointment rather than scattered across Instagram DMs, and its emails and texts link straight into the thread. Keep both, but put the link behind sign-in.
  - New-message emails (and SMS once Phase 55 lands) link to the request's thread under `/client`, on the per-request route Phase 70 adds. The proxy already sends signed-out visitors to sign-in with a `redirectTo`, and `safeRedirectPath` allows `/client` paths, so the link brings them straight back to the thread.
  - The link alone grants no access. Venue's links work for anyone who holds them and are lost with the email; Vettr's thread stays reachable from the portal.
  - The artist side links to the request under `/artist/[artistId]`, behind the same proxy guard.

---

### Phase 45: VIP / Close-Friends Client Tiers
- **Status:** Unscoped.
- **Objectives:** Deploy a distinct priority relationship status module allowing artists to tightly manage gated, invite-only booking access constraints. This functions as a closed-book access rule—it must remain decoupled from service-level `ComplexityTier` parameters.

---

### Phase 46: Placement & Canvas Metadata
- **Status:** Unscoped.
- **Objectives:** Expand booking schemas to capture layout definitions and structural canvas context options (e.g., body canvas positions, base specifications). Fields will slice cleanly into Step 2 of the Phase 17 multi-step wizard.

---

### Phase 47: Reference Image Annotations
- **Status:** Unscoped.
- **Objectives:** Allow clients to apply specific technical textual descriptions directly to individual reference photo elements during wizard entry flow sequences.

---

### Phase 48: Interactive Moodboard / Canvas Design Tool
- **Status:** Unscoped.
- **Objectives:** A highly interactive concept visualization builder featuring canvas serialization, structural concept tagging, and coordinate snap frameworks. This layer represents a multi-phase infrastructure epic that will likely absorb the basic annotation schemas of Phases 46–47.

---

### Phase 49: Domain Service Refactor — Design Pattern TBD
- **Status:** Unscoped.
- **Objectives:** Revisit domain services against architecture.md's SOLID/single-responsibility rules once a specific target pattern and target services are chosen. No concrete scope exists yet; needs a follow-up scoping conversation before any task breakdown.

---

### Phase 51: Client-to-Artist Dual-Role Direction
- **Status:** Unscoped.
- **Objectives:** Phase 26's dual-role design is one-directional by construction — `becomeClientAction`/`RoleSwitcher` let an existing artist account also operate as a client, but there is no equivalent path for an existing client account to gain artist access. Confirmed during Phase 26 closeout: `src/domains/auth/actions.ts` only exports `loginArtist`, no `signupArtist` — artist accounts are provisioned out-of-band (curated onboarding), not self-serve like `signupClient`. `Account.artistId`/`clientProfileId` are already direction-agnostic nullable unique FKs, so the data model needs no change; this is purely an onboarding-flow decision. Before scoping, resolve whether artist access should stay admin/business-curated (an internal "grant artist access to this client account" tool, no public signup) or become self-serve (a public `signupArtist`-equivalent flow, raising the same vetting/quality-control questions the business presumably wanted by not exposing artist signup in the first place).

---

### Phase 52: Constant-Time Login Responses (deferred from former 27.6)
- **Status:** Deferred, low priority — moved out of Phase 27 (user decision). Not needed while login timing is a minor side-channel; revisit only once gateway-level rate limiting exists and login timing is the last remaining account-enumeration channel (i.e. after 27.7 unifies signup responses).
- **Objectives:** `loginArtist`/`loginClient` return an identical error *message* across all rejection branches, but not in identical *time*: a nonexistent email, a wrong-role account, and a locked account all short-circuit before `verifyPassword` runs, while an existing, unlocked account with a wrong password runs a full scrypt hash first — a measurable gap that lets an attacker bucket emails into "no live account" vs. "a real account was checked," independent of the response body. Candidate design: one shared helper runs `verifyPassword` against a lazily built, cached dummy hash produced by the real `hashPassword` (same scrypt params/keylen) on every early-return branch (no account, wrong role, missing `artistId`/`clientProfileId`, locked — which also retires 27.1's accepted locked-account tradeoff); result discarded. A response-time floor is a weaker fit because scrypt time grows under load.
- **Why deferred:** (1) dummy hashing makes every unauthenticated probe for an unknown email burn a scrypt — a cheap CPU-DoS vector with no IP rate limiting in the repo; (2) real mitigation belongs at the gateway (per-IP/per-email throttling), which doesn't exist yet and whose hosting platform is unconfirmed; (3) low severity — a timing side-channel, not an account-takeover path.
- **Prerequisite:** gateway/edge rate limiting (own roadmap item) before this is worth the CPU cost. Requires a rigorous *Mandatory Task Breakdown Rule* pass before execution; prior draft breakdown: helper `services/verifyAgainstDummyHash.ts` (unit-tested with mocked `hashPassword`/`verifyPassword`, hash built once) → `loginArtist.ts` early returns (replace the 27.1 "verifyPassword not called while locked" assertion) → `loginClient.ts`; Data Gateway/Controller/UI/Hook/View layers N/A.
- **Scope update (2026-10-12):** `loginClient` was deleted in 54.8 (clients sign in by email code), so this now covers `loginArtist` only.

---

### Phase 55: SMS OTP Channel
- **Status:** Unscoped. Deferred from Phase 54 (user decision: email code first, SMS later).
- **Objectives:** Add phone/SMS as a second one-time-code channel for Phase 54's booking-submission gate and portal sign-in. Open questions for the scoping pass: SMS provider (e.g. Twilio Verify, which owns code storage/rate limiting itself, vs. sending raw codes through the existing `EmailOtpChallenge` model generalised with a channel column), per-message cost, E.164 normalisation (`ClientProfile.phone` is free-form and unverified today), a verified unique phone on `Account`, whether a phone-only identity is allowed (`Account.email` and `ClientProfile.email` are required and unique today), and an e2e capture sink mirroring the email one.
- **Sequencing (added 2026-10-09):** if both are pursued, Phase 59 (client passkeys) goes first: passkeys cost nothing per sign-in and resist phishing, while SMS adds per-message cost and SIM-swap risk. Passkeys are a separate credential, not an OTP channel, so they don't settle the channel-generalisation question above.
- **Venue review (2026-10-14):** Venue sends separate email links per artist, so a client who books three artists manages three links. The proposed answer was one verified phone number pulling every request into one portal, with an SMS code at the final submit tap. Vettr already does both by verified email: the code is asked for only at final submit (54.5), and one account holds a client's requests with every artist (54.7). Phone-keyed identity therefore adds nothing on its own; it stays the open "phone-only identity" question above.

---

### Phase 57: Payment Event Ledger & Billing-Owned Payment State
- **Status:** Unscoped. Found on 2026-10-07 alongside Phase 56 (`02-active-core.md`). This is the long-term version of that work, not a go-live gate.
- **Objectives:**
  1. **Append-only `PaymentEvent` log owned by billing.**
     - Every Stripe webhook is stored once, unique on the Stripe event id, before it is processed. Local intents (payment created, refund requested) are stored too.
     - Payment and refund status are derived from this timeline instead of from mutable flags.
     - Today's idempotency only works because `depositPaid`/`depositRefunded` only ever flip to true. That stops holding once Phase 56 adds pending/failed refunds and disputes.
  2. **Remove billing's imports of booking.**
     - `createDepositPaymentIntent`, `confirmDepositPayment`, `confirmDepositRefund`, `refundDeposit` and `finalizeCheckout` all call booking services, while booking's cancel paths call billing's `refundDeposit`.
     - That two-way dependency breaks `architecture.md` §4: booking is the higher-level orchestrator, so billing must not call it.
     - Moving deposit state (`depositAmount`, `depositPaid`, `stripePaymentIntentId`) into billing-owned tables keyed by `bookingRequestId` means billing never writes booking's table. (56.6 already moves `depositRefunded` and `stripeRefundId` into `DepositRefund`.) Booking then reads deposit status through billing's public interface.
- **Open questions for scoping:**
  - Does booking still need a copy of `depositPaid` on `BookingRequest` for its own queries?
  - How is `finalizeCheckout`'s billing → booking call reversed?
  - Does Phase 36's read-only finance reporting read from this ledger?
  - How is any state Phase 56 already put into billing-owned tables folded into the ledger?

---

### Phase 59: Client Passkeys (WebAuthn) on Top of the Email Code
> Added 2026-10-09. A returning client signs in with a passkey (Face ID, Touch ID, Windows Hello, a security key or a synced passkey) instead of waiting for an email code, at `/client/login`, the portal gate and the booking wizard's Details & Verify step. Phase 54's email code stays the root of trust: it is the only way to create a client account, the step-up for enrolling a passkey on an old session, and the recovery path when a device is lost.
- **Status:** Unscoped. The first post-launch item, queued right after 53.3; not a go-live gate. Every item needs its own 6-layer breakdown pass before any code, scoped against the post-54.8 auth code.
- **Prerequisites:**
  - 54.8 — client passwords and `ClientLoginForm` are gone, so `ClientSignInForm` is the only client sign-in.
  - 58.6 — passkey eligibility relies on a CLIENT-home account never gaining an `artistId`, exactly as OTP sign-in does.
  - 53.4 — the Permissions-Policy must allow WebAuthn.
  - 53.6 — per-IP limits on the unauthenticated passkey actions.
  - 53.7 — alerting for counter regressions.
- **Order:** numeric. 59.1 adds the data model and enrolment, so 59.2–59.4 have credentials to use.
- **Design (confirmed direction; each item's leaf pass may refine it):**
  - **Library:** `@simplewebauthn/server` in auth services and `@simplewebauthn/browser` in auth hooks, so nothing hand-parses CBOR/COSE. Pin exact versions in the leaf that adds them. Unit tests mock `@simplewebauthn/server`; the real cryptography is proved in e2e by Chromium's virtual authenticator.
  - **Who:** only CLIENT-home accounts with a `clientProfileId` — the rule `signInClientWithEmailOtp` already applies. ARTIST-home accounts, dual-role ones included, can neither register nor use a passkey: a passkey session plus the role switcher must not bypass the artist password (the same reason Phase 54 never gives an ARTIST-home account an OTP session). Artist passkeys are deferred (below).
  - **The inbox stays the weakest link, by design:** there is no passkey-only mode and no way to turn email codes off. A passkey makes sign-in faster and phishing-resistant, but the account is still only as strong as its inbox. UI copy and docs must not call it two-factor.
  - **Relying party:**
    - RP ID is the hostname of `NEXT_PUBLIC_APP_URL` (`localhost` in dev and e2e, `staging.vettr.studio`, `vettr.studio`); the expected origin is that URL's exact origin. Staging uses its own hostname, never the parent `vettr.studio`, so staging and production passkeys can't cross.
    - A new `src/lib/webauthnRelyingParty.ts` owns this and fails closed in production when the variable is missing (no `localhost` fallback).
    - Relies on 53.3.1.1's `www` → apex 308: a ceremony started on `www` fails the origin check.
    - The RP ID is permanent: changing the production hostname after launch orphans every passkey.
  - **Data model (auth-owned):**
    - `PasskeyCredential`: `accountId` (Cascade), `credentialId` (base64url, unique), `publicKey Bytes`, `signCount BigInt` (WebAuthn counters are unsigned 32-bit, which overflows `Int`), `transports`, `deviceType`, `backedUp`, `nickname`, `createdAt`, `lastUsedAt`; indexed on `accountId`. At most `MAX_PASSKEYS_PER_ACCOUNT = 10`.
    - `Account.webauthnUserId`: a random 32-byte opaque user handle, unique, set at first registration. Never the email or account id, because authenticators store it and return it.
    - `ConsumedPasskeyChallenge`: one row per used challenge (unique), with `consumedAt` indexed for pruning.
    - Audit enum values (27.5) for registration, sign-in and removal, with reasons for success, invalid assertion, unknown credential, counter regression, stale session and the cap. The final list is fixed in the Data leaf; the `types.ts` mirrors are extended by the first writer (54.3.1.1 precedent).
  - **Challenges write nothing until used:**
    - The options actions touch no table. Each challenge is 32 random bytes in a short-lived (5 min, matching the browser `timeout`) httpOnly `SameSite=Strict` cookie, HMAC-signed with a new `WEBAUTHN_CHALLENGE_SECRET` over `{challenge, purpose, accountId?, expiresAt}`. The expected challenge therefore always comes from server state, and a sign-in challenge can't be used for registration (or for another account).
    - Single use: the verify transaction inserts the challenge into `ConsumedPasskeyChallenge`; a P2002 means replay. The unauthenticated sign-in path writes nothing until a valid assertion arrives.
    - Rejected alternative: a challenge row per options call, as `EmailOtpChallenge` does — conditional UI requests options on every visit to the sign-in pages.
    - Two tabs mid-ceremony overwrite each other's cookie; the first fails with the generic message and can retry.
  - **Registration:**
    - Needs a CLIENT-active session for an eligible account whose `Session.createdAt` is within `PASSKEY_ENROLMENT_FRESHNESS_MS` (10 min). A stale session first re-runs the existing email-code sign-in inline, with the email fixed to the session account's; the new session it issues is fresh. This stops a stolen 30-day session cookie from planting a permanent passkey, and needs no new OTP purpose.
    - Options: `residentKey: "required"` (discoverable, so sign-in needs no email), `userVerification: "required"` (biometric or PIN, since the passkey stands in for proof of inbox access), `attestation: "none"`, `excludeCredentials` set to the account's existing credentials.
    - The cap check and the insert run in one transaction that locks the `Account` row, so parallel registrations can't pass the cap.
  - **Sign-in:**
    - Username-less: empty `allowCredentials` and no email submitted, so nothing can be enumerated or email-bombed.
    - Two entry points, both hidden when the browser lacks WebAuthn: conditional UI (the `webauthn` autofill token on the email field; confirm `email webauthn` vs `username webauthn` browser support in the UI leaf) and an explicit "Sign in with a passkey" button.
    - Verify order: signed challenge cookie → credential by id → `verifyAuthenticationResponse` with `requireUserVerification` → the returned `userHandle` must equal the account's `webauthnUserId` → eligibility re-check → one transaction that consumes the challenge, compare-and-swaps `signCount` (`updateMany` scoped to the stored value), sets `lastUsedAt`/`backedUp` and calls `createSession(accountId, "CLIENT", tx)`.
    - A counter that goes backwards while non-zero (synced passkeys always report 0) rejects the sign-in, writes an audit row and raises a 53.7 critical alert.
    - Every failure returns one generic message pointing to the email code. No response-time floor: credential ids are random, so failure timing reveals nothing. A cancelled or timed-out ceremony (`NotAllowedError`) is silent, not an error.
  - **Booking wizard:** Details & Verify offers a passkey, which calls the 59.2 sign-in action. That action sets the CLIENT session cookie; the page re-renders with hook state kept, and `useBookingVerification` (54.5.5.2) moves to the signed-in submit (54.5.3.3) when `isSignedInClient` flips. A local flag covers the gap before the new props arrive, as `hasRedeemedCode` does. No new booking orchestration service; booking → auth stays the only dependency direction. An ARTIST-view session is handled as on the OTP path (54.5.3.4).
  - **Management:** a Passkeys section on `/client/profile` — list (nickname, created, last used, a "Synced" pill when `backedUp`), rename, remove, add. Removing needs a session but not a fresh one, since the worst outcome is falling back to email codes. Removal doesn't revoke sessions.
  - **Housekeeping:** the session-cleanup cron route gets a third independent try/catch that prunes `ConsumedPasskeyChallenge` rows older than 24h (54.3.3.2 precedent). `WEBAUTHN_CHALLENGE_SECRET` joins `.env.example`, the CI dummy-env block and the 53.1.6.1 runbook. Zod schemas check the outer `RegistrationResponseJSON`/`AuthenticationResponseJSON` shape (base64url fields, `type: "public-key"`) with a size cap on each field before anything reaches the library.
- **§7 edge cases:**
  - *Concurrency:* one assertion submitted twice → `ConsumedPasskeyChallenge` unique, one session. Parallel registrations at the cap → `Account` row lock. The same authenticator registered twice → `excludeCredentials` plus unique `credentialId`, generic error. Two sign-ins with one non-synced key → `signCount` compare-and-swap, the loser is rejected.
  - *Failure:* the library throws on malformed input → caught, generic error. A DB failure → generic retry message; logs carry `{operation, reason, accountId?}` only, never credential ids, public keys or user handles.
  - *Privacy:* no email in the sign-in ceremony; identical copy on every failure branch.
  - *Security:* exact RP ID and origin; user verification required; attestation none; 5-min single-use challenges signed and bound to purpose and account; stale-session step-up; ARTIST-home exclusion.
  - *Boundaries:* expiry checked on the Node clock; synced passkeys with counter 0; an account that loses CLIENT eligibility after enrolling (rejected by the eligibility re-check); a passkey removed on the server but still offered by the device (unknown credential → generic error).
- **Testing:**
  - Playwright runs Chromium only, so a CDP virtual authenticator (`WebAuthn.addVirtualAuthenticator`: ctap2, internal, resident key, user verification) in a new `e2e/passkeyHelpers.ts` drives registration, sign-in, removal and the wizard path. Conditional UI is covered by hook tests with `@simplewebauthn/browser` mocked.
  - E2E follows 28.10's tiers (`testing.md` §2): behaviour checks on every surface and aria snapshots on the portal ones (the Passkeys section, the `/client` prompt). The passkey button changes two existing tier 3 pages, client sign-in and the wizard's Details & Verify step, so their linux + win32 baselines are regenerated and viewed.
  - Real-DB integration cases: parallel verifications of one assertion yield one session; parallel registrations stop at the cap.
  - Before production, smoke-test on staging with a real platform authenticator and a synced passkey (iCloud Keychain, Google Password Manager) — the virtual authenticator doesn't cover cross-device sign-in.
- [ ] **59.1: Passkey Enrolment & Management on `/client/profile`** — *unscoped.* Dependencies, `webauthnRelyingParty.ts`, the challenge signer, the schema changes and audit values, registration/rename/remove services, the cron prune, actions, the Passkeys section with the stale-session step-up, and `e2e/passkeyHelpers.ts`. Also updates the privacy policy (53.8) for the new stored data: public keys and device metadata (biometrics never leave the device).
- [ ] **59.2: Passkey Sign-In at `/client/login` and the Portal Gate** — *unscoped.* Authentication options/verify services and actions; `ClientSignInForm` gains the button and conditional UI (the pending conditional request is aborted when the client moves to the email-code step); the integration cases above.
- [ ] **59.3: Passkey Sign-In in the Booking Wizard** — *unscoped.* `InlineBookingVerification` offers the passkey and `useBookingVerification` calls the 59.2 action. E2E proves the draft survives and the booking attaches to the passkey account's profile, with the "Booking as … / Not you?" banner showing. Design-pass decision: conditional UI on the wizard's email field too, or the button only.
- [ ] **59.4: Passkey Enrolment Prompts** — *unscoped.* A dismissible "sign in faster next time" card on `/client` after an email-code sign-in, and an "Add a passkey" offer on `BookingSubmittedConfirmation`. Shown only when the browser supports passkeys, the session is fresh and the account has none. Dismissal is remembered per device in `localStorage`.
- **Deferred (not items):** artist passkeys, as a password replacement or second factor (interacts with 27.1's lockout and Phase 52); the WebAuthn Signal API (`signalUnknownCredential` after an unknown-credential failure, `signalAllAcceptedCredentials` after a removal) as a progressive enhancement; a passkey-only mode that turns email codes off (needs an account-recovery story first); revoking sessions on passkey removal; moving the two inline `NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` reads (`src/app/layout.tsx`, `createConnectOnboardingLink.ts`) onto the new helper.

---

### Phase 60: Platform Admin Dashboard
- **Status:** Unscoped. Added 2026-10-12.
- **Objectives:** A panel only platform administrators can reach, for monitoring platform health, checking Stripe Connect onboarding anomalies and resolving refunds manually.
- **Depends on 56.11:** 56.11 (a go-live gate) has to decide where a manual refund resolution lives: an in-app admin role or an internal tool such as Retool or Refine. The only roles today are `ARTIST` and `CLIENT`. This phase builds on that decision rather than making it again. Writes go through app endpoints so billing's status rules and logging still apply.

---

### Phase 61: Structured Business Event Logging
- **Status:** Unscoped. Added 2026-10-12. Gates 53.3.
- **Objectives:** Extend logging beyond the security-focused `AuditEvent` stream (27.5) to record business milestones in the booking and payment lifecycles (e.g. `BOOKING_FLOW`, `FINANCIAL_FLOW` events: request submitted, approved, deposit paid, refunded).
- **Order:** after 53.9, which adds the server-only logger and correlation IDs this builds on, and 53.7, which ingests it. Phase 42's client history can read these events.
- **Design pass:** whether these are rows in a database table (queryable, like `AuditEvent`) or structured log lines only; the same non-PII allowlist as architecture.md §8.B.

---

### Phase 65: Recovered Tech Debt
- **Status:** Unscoped. Recovered on 2026-10-12 from 28.7's "Flagged, not fixed" list in `02-active-core.md`, where they were noted but never made into items. Phase numbers 62–64 are retired (folded into 53.7/53.8 before they were used), so this is 65.
- [ ] **65.1: Delete `approveBookingRequest`** (*small.* Legacy action with no callers; 28.7 guarded it rather than deleting it).
- [ ] **65.2: Remove the Dead Scheduling `artistId` Payload** (*small.* Since 28.7.3.2 the scheduling actions take `artistId` from the session, so the `artistId` prop/payload key in `useWeeklyHoursSettings`, `useScheduleOverrides`, `WeeklyHoursSettings` and `BlackoutDateSettings` is ignored).
- [ ] **65.3: Shared `requireArtistId` Guard** (*small.* The guard is duplicated in the billing, booking and scheduling actions; move it to a shared module per architecture.md §4.B).
- [ ] **65.4: Evaluate `next-themes` and a "Match Device" Theme Option** (*small.* Added 2026-10-14 from 50.2's design pass. Theming is hand-rolled: `.dark` on `<html>`, `vettr-theme` in localStorage, and an anti-flash script in `src/app/layout.tsx` that defaults to dark until 50.2.6.3 makes light the default; shadcn's Next.js dark-mode guide uses `next-themes` instead. Adopt it only if a system/device mode is wanted: 50.2's two-option Light / Dark picker doesn't need it, and a device mode would add a third "Device" card to that picker. Before adopting, check its open React 19 "Encountered a script tag" warning on Next 16.2+ (next-themes issues #385, #387) against our Next version. 50.2.4.2 keeps the theme reads and writes in `src/lib/theme.ts`, so a move touches that file, the root layout and `ThemePicker` (50.2.4.3, which replaces `ThemeSwitch`)).

---

### Phase 66: Sign-In Notification Emails
- **Status:** Unscoped. Added 2026-10-14 (user decision: artists and clients, on every sign-in).
- **Objectives:** After every successful sign-in, email the account a short "You signed in to Vettr" notice, so a sign-in the owner didn't make gets noticed.
  - Three places create a session today. Each sends after its transaction commits, never inside it:
    - `loginArtist.ts:62`: artist password sign-in.
    - `signInClientWithEmailOtp.ts:89`: client portal code sign-in.
    - `verifyEmailOtpAndProvisionClient.ts:250`: booking verification. A first-time account (`CLIENT_ACCOUNT_AND_PROFILE_CREATED`) gets a "your account is set up" version instead.
  - Phase 59's passkey sign-ins call the same sender.
  - The send runs in its own try/catch, so a failed email never fails or rolls back the sign-in, and it is awaited before the response returns (architecture.md §8.C). Logs use the same fixed non-PII fields as `sendVerificationEmail`.
  - A new `sendSignInNotificationEmail` sits beside `sendVerificationEmail` in `src/domains/auth/services/`: plain text, sent through `src/lib/resend.ts`, written to `emailCaptureSink` in E2E.
  - Data Gateway: `AuditEventType` has only `LOGIN_FAILED` for artists, so a successful artist login records nothing. Add a success event so the audit trail matches the emails.
  - No new abuse surface: only a successful sign-in sends the email, and sign-ins are already limited (27.1's lockout, the email-code caps).
- **Design pass:**
  - What "wasn't you?" leads to. No artist password reset and no "sign out everywhere" exist yet, so one of them may have to come first.
  - What the email shows. The time is safe; IP address and location count as personal data under UK GDPR (53.8).
  - Clients get two emails per code sign-in (the code, then the notice). Accepted for now; revisit if it reads as noise.
  - The email is transactional, so it needs no unsubscribe link (53.8).

---

### Phase 67: Artist Intake Form Builder
- **Status:** Unscoped. Added 2026-10-14 from the Venue review.
- **Objectives:** Let each artist decide what their booking form asks.
  - Each built-in field can be required, optional or hidden per artist. Venue only half does this: the design idea is optional and reference images are forced, for every artist.
  - Artists add custom questions (short text, a choice, yes/no), e.g. nail health or current gel status for a nail tech.
  - Not configurable: the Instagram handle, at least one reference image and the blacklist screen (CLAUDE.md constraint 2).
  - Answers are stored with the version of the form they were given against, so a later edit never changes what an old request says.
  - The wizard's progress bar is worked out from the steps the artist's form actually has. Venue's jumps from 75% straight to done.
- **Related:** 31 (required-field marker), 34 (database-backed tiers) and 46–48 (46's placement fields could become built-in fields here). Phase 69 builds on this.

---

### Phase 68: Artist Booking Page Branding
- **Status:** Unscoped. Added 2026-10-14 from the Venue review.
- **Objectives:** Make an artist's `/@handle` and `/@handle/book` pages look like theirs. Venue uses a stock background with its own logo fixed in the corner.
  - A cover image and an accent colour per artist. The colour overrides a semantic token on a wrapper around the public pages only, so components still consume tokens.
  - A colour is saved only if it passes a contrast check in both the light and dark themes.
  - No Vettr watermark on the booking page.
- **Design pass:** frontend.md §2 forbids raw colour values in components, so a per-artist colour needs a rule decision first.
- **Order:** after 39 (profile editing) and 67.

---

### Phase 69: Multi-Craft Service Model
- **Status:** Unscoped. Added 2026-10-14 from the Venue review. Needs a product decision first.
- **Objectives:** Support nail art tiers, lash extension styles, aesthetic consultations and other custom creative work, not only tattoos. Venue is built for tattoo artists alone (e.g. "Shop flash designs").
  - Vettr's model is tattoo-shaped today: `ComplexityTier` (`TIER_2` to `FREESTYLE`), body placement and "design reference" copy.
  - Generalise it into a craft per artist and a service catalogue the artist defines.
- **Order:** after 34 (database-backed tiers) and 67 (intake builder), which are its building blocks.

---

### Phase 70: Client Request Status Timeline
- **Status:** Unscoped. Added 2026-10-14 from the Venue review.
- **Objectives:** Show the client where their request is and what happens next. Venue shows a static "appointment pending" with no review time and no next step.
  - A per-request page under `/client` (none exists today; the dashboard lists requests) with the stages Submitted → Under Review → Deposit Requested → Confirmed, plus the end states Declined, Cancelled, Completed and No-show.
  - Stages map onto `RequestStatus` and `depositPaid`: `PENDING` is Submitted, `APPROVED` with the deposit unpaid is Deposit Requested, `APPROVED` with it paid (or none due) is Confirmed. Decide where `AWAITING_SLOT_CONFIRMATION` sits.
  - "Under Review" needs a signal that doesn't exist yet, e.g. when the artist first opens the request.
  - An artist-set "usually replies within N days", shown on the profile and on `BookingSubmittedConfirmation`.
  - Phase 61's business events can supply the timestamps.
- **Already right in Vettr** (same review, no item needed): clients start the booking form without signing in, and the email code is asked for only at the final submit (54.5). Access never depends on keeping a link, because one account holds every request (54.7).
- **Related:** 30 (its email links here once this lands) and 44 (chat sits on the same page).

---
