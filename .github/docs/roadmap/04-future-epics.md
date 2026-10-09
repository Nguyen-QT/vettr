---
globs: ["**/docs/roadmap/04-future-epics.md"]
---
# 🗺️ Future Epics & Long-Term Strategic Backlog (Phases 32–36, 41–48, 51–52, 55, 57, 59)

This tracking file contains large-lift feature sets, complex multi-domain subsystems, security/infra hardening, and speculative architecture designs. All items listed here require a rigorous, individual *Mandatory Task Breakdown Rule* pass to map out concrete technical layers before execution begins. Phase numbers are stable IDs, not a priority rank — the work order lives in the Priority Queue at the top of `02-active-core.md` (see `03-polish-and-config.md` for the lower-lift/cosmetic phases; Phases 27, 28, 50 and 54 have been promoted into `02-active-core.md`).

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

### 📦 Phase 52: Constant-Time Login Responses (deferred from former 27.6)
- **Status:** Deferred, low priority — moved out of Phase 27 (user decision). Not needed while login timing is a minor side-channel; revisit only once gateway-level rate limiting exists and login timing is the last remaining account-enumeration channel (i.e. after 27.7 unifies signup responses).
- **Objectives:** `loginArtist`/`loginClient` return an identical error *message* across all rejection branches, but not in identical *time*: a nonexistent email, a wrong-role account, and a locked account all short-circuit before `verifyPassword` runs, while an existing, unlocked account with a wrong password runs a full scrypt hash first — a measurable gap that lets an attacker bucket emails into "no live account" vs. "a real account was checked," independent of the response body. Candidate design: one shared helper runs `verifyPassword` against a lazily built, cached dummy hash produced by the real `hashPassword` (same scrypt params/keylen) on every early-return branch (no account, wrong role, missing `artistId`/`clientProfileId`, locked — which also retires 27.1's accepted locked-account tradeoff); result discarded. A response-time floor is a weaker fit because scrypt time grows under load.
- **Why deferred:** (1) dummy hashing makes every unauthenticated probe for an unknown email burn a scrypt — a cheap CPU-DoS vector with no IP rate limiting in the repo; (2) real mitigation belongs at the gateway (per-IP/per-email throttling), which doesn't exist yet and whose hosting platform is unconfirmed; (3) low severity — a timing side-channel, not an account-takeover path.
- **Prerequisite:** gateway/edge rate limiting (own roadmap item) before this is worth the CPU cost. Requires a rigorous *Mandatory Task Breakdown Rule* pass before execution; prior draft breakdown: helper `services/verifyAgainstDummyHash.ts` (unit-tested with mocked `hashPassword`/`verifyPassword`, hash built once) → `loginArtist.ts` early returns (replace the 27.1 "verifyPassword not called while locked" assertion) → `loginClient.ts`; Data Gateway/Controller/UI/Hook/View layers N/A.

### 📦 Phase 55: SMS OTP Channel
- **Status:** Unscoped. Deferred from Phase 54 (user decision: email code first, SMS later).
- **Objectives:** Add phone/SMS as a second one-time-code channel for Phase 54's booking-submission gate and portal sign-in. Open questions for the scoping pass: SMS provider (e.g. Twilio Verify, which owns code storage/rate limiting itself, vs. sending raw codes through the existing `EmailOtpChallenge` model generalised with a channel column), per-message cost, E.164 normalisation (`ClientProfile.phone` is free-form and unverified today), a verified unique phone on `Account`, whether a phone-only identity is allowed (`Account.email` and `ClientProfile.email` are required and unique today), and an e2e capture sink mirroring the email one.
- **Sequencing (added 2026-10-09):** if both are pursued, Phase 59 (client passkeys) goes first: passkeys cost nothing per sign-in and resist phishing, while SMS adds per-message cost and SIM-swap risk. Passkeys are a separate credential, not an OTP channel, so they don't settle the channel-generalisation question above.

### 📦 Phase 57: Payment Event Ledger & Billing-Owned Payment State
- **Status:** Unscoped. Found on 2026-10-07 alongside Phase 56 (`02-active-core.md`). This is the long-term version of that work, not a go-live gate.
- **Objectives:**
  1. **Append-only `PaymentEvent` log owned by billing.**
     - Every Stripe webhook is stored once, unique on the Stripe event id, before it is processed. Local intents (payment created, refund requested) are stored too.
     - Payment and refund status are derived from this timeline instead of from mutable flags.
     - Today's idempotency only works because `depositPaid`/`depositRefunded` only ever flip to true. That stops holding once Phase 56 adds pending/failed refunds and disputes.
  2. **Remove billing's imports of booking.**
     - `createDepositPaymentIntent`, `confirmDepositPayment`, `confirmDepositRefund`, `refundDeposit` and `finalizeCheckout` all call booking services, while booking's cancel paths call billing's `refundDeposit`.
     - That two-way dependency breaks `architecture.md` §4: booking is the higher-level orchestrator, so billing must not call it.
     - Moving deposit state (`depositAmount`, `depositPaid`, `stripePaymentIntentId`, `depositRefunded`, `stripeRefundId`) into billing-owned tables keyed by `bookingRequestId` means billing never writes booking's table. Booking then reads deposit status through billing's public interface.
- **Open questions for scoping:**
  - Does booking still need a copy of `depositPaid` on `BookingRequest` for its own queries?
  - How is `finalizeCheckout`'s billing → booking call reversed?
  - Does Phase 36's read-only finance reporting read from this ledger?
  - How is any state Phase 56 already put into billing-owned tables folded into the ledger?

### 📦 Phase 59: Client Passkeys (WebAuthn) on Top of the Email Code
> Added 2026-10-09. A returning client signs in with a passkey (Face ID, Touch ID, Windows Hello, a security key or a synced passkey) instead of waiting for an email code, at `/client/login`, the portal gate and the booking wizard's Details & Verify step. Phase 54's email code stays the root of trust: it is the only way to create a client account, the step-up for enrolling a passkey on an old session, and the recovery path when a device is lost.
- **Status:** Unscoped. Post-launch: queued right after 53.3 (Priority Queue item 7 in `02-active-core.md`), not a go-live gate. Every item needs its own 6-layer breakdown pass before any code, scoped against the post-54.8 auth code.
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
  - Every new UI surface asserts `toHaveScreenshot()` with linux + win32 baselines.
  - Real-DB integration cases: parallel verifications of one assertion yield one session; parallel registrations stop at the cap.
  - Before production, smoke-test on staging with a real platform authenticator and a synced passkey (iCloud Keychain, Google Password Manager) — the virtual authenticator doesn't cover cross-device sign-in.
- [ ] **59.1: Passkey Enrolment & Management on `/client/profile`** — *unscoped.* Dependencies, `webauthnRelyingParty.ts`, the challenge signer, the schema changes and audit values, registration/rename/remove services, the cron prune, actions, the Passkeys section with the stale-session step-up, and `e2e/passkeyHelpers.ts`. Also updates the privacy policy (53.8) for the new stored data: public keys and device metadata (biometrics never leave the device).
- [ ] **59.2: Passkey Sign-In at `/client/login` and the Portal Gate** — *unscoped.* Authentication options/verify services and actions; `ClientSignInForm` gains the button and conditional UI (the pending conditional request is aborted when the client moves to the email-code step); the integration cases above.
- [ ] **59.3: Passkey Sign-In in the Booking Wizard** — *unscoped.* `InlineBookingVerification` offers the passkey and `useBookingVerification` calls the 59.2 action. E2E proves the draft survives and the booking attaches to the passkey account's profile, with the "Booking as … / Not you?" banner showing. Design-pass decision: conditional UI on the wizard's email field too, or the button only.
- [ ] **59.4: Passkey Enrolment Prompts** — *unscoped.* A dismissible "sign in faster next time" card on `/client` after an email-code sign-in, and an "Add a passkey" offer on `BookingSubmittedConfirmation`. Shown only when the browser supports passkeys, the session is fresh and the account has none. Dismissal is remembered per device in `localStorage`.
- **Deferred (not items):** artist passkeys, as a password replacement or second factor (interacts with 27.1's lockout and Phase 52); the WebAuthn Signal API (`signalUnknownCredential` after an unknown-credential failure, `signalAllAcceptedCredentials` after a removal) as a progressive enhancement; a passkey-only mode that turns email codes off (needs an account-recovery story first); revoking sessions on passkey removal; moving the two inline `NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` reads (`src/app/layout.tsx`, `createConnectOnboardingLink.ts`) onto the new helper.
