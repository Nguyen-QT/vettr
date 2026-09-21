# Vettr — Bespoke Intake & Selection Engine - Project Guide

## 🛠️ Tech Stack & Tooling Core
- **Framework:** Next.js 15+ (App Router, Server Actions)
- **Language:** TypeScript (Strict Mode, explicit types mandatory, `any` forbidden)
- **Database & ORM:** PostgreSQL + Prisma ORM
- **Styling:** Tailwind CSS + Shadcn UI (High-end aesthetic execution)
- **State & Validation:** Zod (Schema validation), React Server Actions

## 🏗️ Architecture & Engineering Best Practices
This project strictly enforces **Domain-Driven Design (DDD)**, **Clean Architecture**, and **SOLID** principles within the Next.js framework:
- **Framework Isolation:** Next.js pages and API routes are "dumb" delivery mechanisms. Business logic lives inside pure domain services.
- **Domain-Driven Structure:** Code is grouped by business boundaries, not technical types.
- **Single Responsibility (SOLID):** UI components only render views. Business mutations live in Server Actions. Data orchestration lives in custom React hooks.
- **Data Encapsulation:** Enforce structural boundaries using the pattern: `Data Gateway (Prisma) -> Domain Service (Business Logic) -> Controller/Action -> View`.
- **Mandatory File-Splitting (Single Responsibility):** Every domain that requires runtime input validation must decompose into three decoupled files at its root: `constants.ts` (domain arrays, baselines, and boundaries), `types.ts` (pure, standalone TypeScript entity contracts — never derived via Zod's `z.infer`), and `[domain].schema.ts` (Zod runtime validation only, importing from the other two). This is a mandatory technical step for every current and future domain (`intake`, `scheduling`, `billing`), not just intake.

### 🎨 Brand System & Semantic Styling Guardrails
- **Visual Aesthetic & Layout (Airbnb-Inspired):** Vettr's visual identity borrows Airbnb's layout language, driven entirely by Vettr's own custom palette (below) -- never Airbnb's actual brand colors.
  - **Typography & Scale:** Large, bold, highly readable headers; generous vertical rhythm between sections; clean sans-serif typography throughout.
  - **Component Structure:** Floating, high-contrast action cards (e.g. an Airbnb-style booking box), rounded pill badges for statuses/tags, subtle divider lines (`<Separator />`) between sections, and clean grid card layouts for listings (the artist directory, booking lists).
  - **Spacing & Density:** Spacious, breathable padding around forms, media, and detail rows -- avoid cramped, dense layouts.
  - **Micro-Details:** Subtle border outlines (`border-border`), soft rounded corners (`--radius` in the `0.5rem`-`0.75rem` range), and soft drop-shadows on floating/sticky elements (e.g. the dashboard header, a sticky action box).
- **Color Mapping (Custom Palette):** Vettr's palette is `#B775DA` (Vibrant Purple), `#C698DE` (Soft Lavender), `#EABEE3` (Soft Pink/Orchid), and `#ECBCC0` (Blush Rose) -- defined as CSS custom properties in `globals.css` (`:root`/`.dark`), never referenced by hex in components. Intended semantic roles:
  - `#B775DA` -- primary accent and primary CTAs: main action buttons, focus rings, active states (`bg-primary`/`ring`-family tokens).
  - `#C698DE` -- secondary highlights: hover states, selected toggles, subtle interactive elements (`bg-secondary`-family tokens).
  - `#EABEE3` -- card fills and muted surfaces, used at low opacity: badge backgrounds, selected-card highlights, light container fills (`bg-muted`/`bg-accent`-family tokens).
  - `#ECBCC0` -- soft statuses and secondary tags: subtle notification tags, soft warnings, secondary chips (a `chart-*`-family token reserved for tag/chip accents, not a primary status color).
- **Strict Semantic Token Rule:** Never hardcode explicit Tailwind color utilities (e.g. `bg-black`, `text-gray-900`, `border-slate-200`, `bg-blue-600`) or raw hex codes inline in components. ALL styling must strictly consume semantic CSS variables and Tailwind token classes (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`, `border-border`, `bg-accent`) -- the palette above only ever enters the codebase via `globals.css`'s token definitions.
- **Dark/Light Mode Native Support:** Components must dynamically adapt to dark and light modes via CSS root/dark tokens defined in `globals.css` without requiring custom state hooks or conditional inline classes.
- **Micro-Polish Deferral:** The layout/color guardrails above apply to every component going forward, not just in a future pass. What's still deferred to a dedicated design pass post-Phase 6 is specifically fine-grained micro-animations, glassmorphism overlays, and marketing polish -- motion and flourish, not the structural aesthetic or color system itself.

## 🧪 Automated Testing Guardrails
- **Mandatory Coverage:** Every core domain service (especially booking logic, slot allocations, and billing multipliers) must have accompanying unit tests.
- **Edge-Case Matrix:** Tests must explicitly cover race conditions, double-booking attempts, invalid timezone bounds, and past cancellation tracking.
- **The CLI Verification Rule:** Before marking any task in the roadmap as complete, Claude must execute `npm run test` in the terminal and verify a 100% green pass rate.
- **Manual E2E Verification Gate:** Playwright (`e2e/`, `playwright.config.ts`) is a second, explicitly *manual* testing layer on top of the automated one above. For any sub-task touching a view/route layer, Claude must add or update the relevant `e2e/*.spec.ts`, run `npm run test:e2e` headless as a sanity check, then point the user to `npm run test:e2e:ui` (Playwright UI Mode) to interactively click through the affected flow themselves before giving their go-ahead to commit. A headless `npm run test:e2e` pass does not substitute for the user's own UI Mode pass.

## 🧭 Project Blueprint & Core Constraints
This app is *not* a standard calendar app (like Calendly). It is a **curation and screening tool**. 
1. **No Auto-Booking:** Clients request slots (11:00 AM, 2:00 PM, 5:30 PM) as start-time candidates only — they never set the service duration. The artist decides duration upon reviewing the request, and no database allocation occurs until the artist manually clicks "Approve". If the artist-decided duration overflows the requested slot's length, the booking consumes the next adjacent slot too and marks it unavailable (for now, capped at two consecutive slots — typically only FREESTYLE services need this).
2. **Visual Enforcement & Filtering:** Every request *must* contain an Instagram handle and at least one high-resolution design reference image. If the text input contains blacklisted terms for basic/simple work (and no advanced modifiers), programmatically reject it with a friendly redirection message before database persistence occurs.
3. **Flexible Pricing & Final Bill:** The schema must support a structural `depositPaid` flag, a dynamic base `estimatedPrice`, and line-item `addons` added dynamically on the day of service.
4. **Flagging Mechanism:** The `ClientProfile` model must track cancellation history and automatically toggle an `enforcePrecharge` state (50% upfront penalty) if flagged.

## 📁 Repository Directory Blueprint
```text
src/
├── app/                      # Next.js Routing Layer (Dumb Delivery)
│   ├── layout.tsx
│   ├── page.tsx              # Landing / Root routing
│   ├── artist/               # Artist Dashboard Routing
│   └── book/                 # Client Intake Form Routing
├── components/               # Cross-cutting UI Components (Shadcn, primitives)
├── domains/                  # CORE DOMAIN LAYER (DDD & Clean Architecture)
│   ├── intake/               # Domain 1: Client briefs, image vetting, handle tracking
│   │   ├── components/       # Domain-specific UI (VisualIntakeForm, RequestCard)
│   │   ├── hooks/            # Presentation state orchestrators (useIntakeApproval)
│   │   ├── services/         # Pure business logic (validateComplexity, routeRequest)
│   │   ├── constants.ts      # Domain arrays, baselines, and boundaries
│   │   ├── types.ts          # Pure TypeScript entity contracts (no z.infer)
│   │   ├── intake.schema.ts  # Zod runtime validation only
│   │   └── actions.ts        # Next.js Server Actions boundary
│   ├── scheduling/           # Domain 2: Slot booking, flex-shifts, concurrent blocks
│   │                         # (same constants.ts / types.ts / scheduling.schema.ts split)
│   └── billing/              # Domain 3: Dynamic tabs, cancellation penalty engines
│                              # (same constants.ts / types.ts / billing.schema.ts split)
├── lib/                      # Framework/Utility infrastructure configuration
│   ├── prisma.ts             # Prisma Client instance singleton
│   └── utils.ts              # Tailwind merging utilities
└── types/                    # System-wide global enterprise type declarations
```

## ⚡ Common Development Commands
- **Install Dependencies:** `npm install`
- **Run Local Dev Server:** `npm run dev`
- **Prisma Studio Visualizer:** `npx prisma studio`
- **Generate Client:** `npx prisma generate`
- **Database Migration:** `npx prisma migrate dev`
- **Execute Test Suite:** `npm run test`

## 🗺️ Current Status & Roadmap
> **Structural mandate (applies to every phase below):** any task that introduces domain input validation must follow the `constants.ts` / `types.ts` / `[domain].schema.ts` split defined in the Architecture section — this is not intake-specific and carries forward into Phase 2's remaining tasks and into the `scheduling`/`billing` domains built in Phases 3-4.

### 📦 Phase 1: Database Foundation & Domain Mapping
- [x] 1.1: Initialize PostgreSQL schema via Prisma.

- [x] 1.2: Setup core entity relationships (`Artist`, `ClientProfile`, `IntakeRequest`, `TimeSlot`).

### 📦 Phase 2: Core Intake Engine & Visual Guardrails
- [x] **2.1: Client Input Validation Layers** (Build Zod schemas for validation, including strict Instagram handle regex and image string array boundaries).

- [x] **2.2: UploadThing Backend Integration** (Configure the UploadThing backend API route handlers and initial server endpoint configurations).

- [x] **2.3: Pure Business Logic Core** (Write `services/validateComplexity.ts` to inspect incoming fields, flag empty sets, and hook up unit tests).

- [x] **2.4: React Server Action Layer** (Build `actions.ts` to intake user submissions, pipe to domain services, and save a PENDING record in Prisma).

- [x] **2.5: Visual Intake Form Component** (Construct the frontend `VisualIntakeForm.tsx` using Shadcn primitives, linking directly to the server action), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 2.5.1: UI Primitive & Config Setup (Shadcn init/primitives, UploadThing client helper, image config).
  - [x] 2.5.2: Domain Hook & Logic (`useVisualIntakeForm` state/validation orchestration).
  - [x] 2.5.3: View & Route (`VisualIntakeForm.tsx` composition + `/book/[artistId]` routing).

### 📦 Phase 3: Artist Decision Dashboard
- [x] **3.1: Dashboard Layout Scaffold** (Build basic layout wrapper with authentic mobile-first rendering tailored for working artists).

- [x] **3.2: Interactive Review Cards** (Build component that accepts intake data and renders 1-click Instagram deep links and reference images).

- [x] **3.3: Action Mutators (Approve/Decline)** (Write server actions to toggle intake request enums and generate automatic response message copies).

### 📦 Phase 4: Concurrency Rules & Financial Logic
- [x] **4.1: Reservation Lock-In Timers & Slot Confirmation UI** (Design database state checks to ensure a time slot isn't allocated to two approved clients concurrently, then wire that confirmation into the artist dashboard. Service duration is an artist decision made at approval time, not a client input; a duration that overflows the requested slot consumes and locks the next adjacent slot too, capped at two consecutive slots for now), decomposed per the Mandatory Task Breakdown Rule:
  - [x] **4.1.1: Scheduling Domain Scaffold** (`constants.ts`/`types.ts`/`scheduling.schema.ts` + the `TimeSlot` overlap-exclusion constraint).
  
  - [x] **4.1.2: `confirmTimeSlot` Domain Service** (concurrency-safe slot allocation, with unit tests covering race conditions and double-booking).

  - [x] **4.1.3: Server Action Boundary** (`confirmTimeSlotAction`).

  - [x] **4.1.4: Data Gateway** (`IntakeRequest.requestedStartTime`, `IntakeRequest.proposedDurationMinutes`, and a new `RequestStatus.AWAITING_SLOT_CONFIRMATION` value).
  
  - [x] **4.1.5: Intake Capture** (client picks a date + one of the artist's fixed daily times (11:00/14:00/17:30) on the intake form; saved as `requestedStartTime`).
  
  - [x] **4.1.6: Review/Propose Domain Service** (artist enters a duration; a single-slot fit atomically books + approves, a two-slot spillover stores the proposal and moves to `AWAITING_SLOT_CONFIRMATION` instead of booking, since that case needs off-platform confirmation with the client first).
  
  - [x] **4.1.7: Confirm-Proposed-Booking Domain Service** (finalizes an `AWAITING_SLOT_CONFIRMATION` request once the artist has confirmed the double-slot booking with the client off-platform).
  
  - [x] **4.1.8: Controller/Action Boundary** (server actions for the review step and the confirm-booking step).
  
  - [x] **4.1.9: Artist Dashboard UI** (duration input on approve, the two outcome messages, and a "Confirm Booking" control for awaiting-confirmation requests).
  
  - [x] **4.1.10: Live Slot Availability** (client's date/time picker reflects real availability instead of any date being pickable -- deliberately sequenced after 4.1.6-4.1.9 so the core approve/confirm mechanics ship first), decomposed per the Mandatory Task Breakdown Rule:
    - [x] **4.1.10.1: Domain Service** (`getAvailableSlots(artistId, date)` in scheduling -- a fixed daily time is available if no `BOOKED` `TimeSlot` overlaps its `[time, time + MAX_SLOT_DURATION_MINUTES)` nominal window, with unit tests).
    - [x] **4.1.10.2: Controller/Action Boundary** (`getAvailableSlotsAction`).
    - [x] **4.1.10.3: Domain Hook & Logic** (`useVisualIntakeForm` fetches availability whenever the picked date changes).
    - [x] **4.1.10.4: View & Route** (disable already-booked time options in the intake form; e2e spec update).

- [x] **4.2: Mandatory Email Capture & Validation** (Enforce required email address input in client intake schemas, forms, and backend handlers to ensure deliverability of booking confirmation and magic link tokens), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 4.2.1: Data Gateway & Domain Service (`ClientProfile.email` migrated to required; `intake.schema.ts`/`types.ts` tightened to match -- bundled into one PR since the Prisma-generated and Zod-inferred types must tighten together for `actions.ts` to type-check).
  - [x] 4.2.2: View & Route (`VisualIntakeForm.tsx` drops the "(optional)" label and marks email required; e2e spec update).

- [x] **4.3: Artist Business Hours & Operating Schedule Engine** (Define recurring weekly working hours, blackout days, and custom date overrides so the client slot picker only renders valid operating windows. No config for a given day defaults to fully open, matching today's behavior, until the artist explicitly restricts it), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 4.3.1: Data Gateway (`ArtistWeeklyHours` and `ArtistScheduleOverride` Prisma models + migration).
  - [x] 4.3.2: Domain Service -- Read (`getOperatingWindows(artistId, date)` in scheduling: override-first, then weekly-hours-row, else default-open, with unit tests).
  - [x] 4.3.3: Domain Service -- Read/Compose (`getAvailableSlots` updated to intersect operating windows with the existing booked-slot check, with unit tests).
  - [x] 4.3.4: Domain Service -- Write (`setWeeklyHours`/`setScheduleOverride` upsert services with validation, with unit tests).
  - [x] 4.3.5: Controller/Action Boundary (server actions wrapping the read/write services for the settings UI).
  - [x] 4.3.6: Domain Hook & Logic (`useArtistScheduleSettings` orchestrating fetch/mutate state).
  - [x] 4.3.7: View & Route (artist-facing "Business Hours" settings section on the dashboard -- weekly hours grid + blackout/override date management; e2e spec).

- [x] **4.4: Mandatory Estimated Price Validation on Review** (Enforce that artists input an explicit estimatedPrice alongside duration when reviewing/approving an intake request. No new migration needed -- estimatedPrice already exists on IntakeRequest as a nullable Decimal; enforcement is at the application layer since rows stay null until reviewed), decomposed per the Mandatory Task Breakdown Rule but shipped as a single bundled PR (unlike 4.2's Data Gateway/Domain Service split, this coupling is a functional regression, not just a type error: making estimatedPrice required in reviewIntakeRequestAction before the UI supplies it would break the live Approve flow on main between merges, confirmed by the e2e suite). Also defaults the estimated price input to TIER_2's baseline minimum for FREESTYLE requests, since a client's own budget guess for freestyle work is often an overestimate:
  - [x] 4.4.1: Domain Service + required Controller/Action passthrough (`reviewIntakeRequestInputSchema` gains `estimatedPrice` validation; `reviewIntakeRequest.ts` persists it on both the immediate-approve and awaiting-confirmation paths; unit tests).
  - [x] 4.4.2: Domain Hook & Logic (`useRequestActions.review()` signature extended to accept `estimatedPrice`).
  - [x] 4.4.3: View & Route (`RequestActions.tsx` adds an estimated-price input alongside duration; e2e spec update).

- [x] **4.5: Artist Upcoming Appointments Dashboard** (A new read-only view of `APPROVED` requests with a future-dated `TimeSlot`, so an approved request doesn't just vanish from the artist's view on the next reload -- it moves to an upcoming-appointments view instead. No new schema needed), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 4.5.1: Domain Service (`getUpcomingAppointments(artistId)` in intake -- `APPROVED` requests with a future-dated `TimeSlot`, joined with client/design references/estimatedPrice; unit tests).
  - [x] 4.5.2: View & Route (new `/artist/[artistId]/appointments` page + a read-only `AppointmentCard`; nav link; e2e spec).

- [x] **4.6: Tiered Reference Gallery** (Show clients example reference images grouped by COMPLEXITY_TIERS to help them choose a tier while filling out the intake form. Per-artist -- clients are judging that specific artist's style/pricing, not a generic gallery. Read-only for clients; artist upload/management UI is a backlog item), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 4.6.1: Data Gateway (`TierReferenceImage` Prisma model: `artistId`, `tier`, `imageUrl` + migration).
  - [x] 4.6.2: Domain Service (`getTierReferenceImages(artistId)` in intake, grouped by tier; unit tests).
  - [x] 4.6.3: View & Route (fetched server-side in `/book/[artistId]/page.tsx`, passed to `VisualIntakeForm`, showing example images for whichever tier is currently selected; e2e spec).

### 📦 Phase 5: Authentication & Access Control ◄ CURRENT FOCUS
> Both Artist and Client are real accounts that log in -- not just a client-facing feature. The artist dashboard has had **no access control at all** since Phase 3: any URL with a guessable/known `artistId` currently works. Hand-rolled (password hashing + DB-backed sessions + middleware), not a library like Auth.js/NextAuth -- Auth.js's Credentials provider isn't meant for real password auth (the maintainers point OAuth/magic-link users at it instead), and its provider/adapter/callback model doesn't map onto this project's `constants.ts`/`types.ts`/`[domain].schema.ts` + domain-service pattern the way a plain domain service does. A shared `Account` (`email`, `passwordHash`, `role: ARTIST | CLIENT`, linked to exactly one of `Artist`/`ClientProfile`) + `Session` model covers both roles with one auth codepath.
- [x] **5.1: Artist Authentication & Route Protection** (Password login for the artist, and middleware protecting `/artist/[artistId]/*` so a session must be an ARTIST account whose linked `artistId` matches the URL. Artist accounts stay manually provisioned for now -- no signup UI; there's a single artist and Account rows are created the same way Artist rows already are, via Prisma Studio/a script), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 5.1.1: Data Gateway (`Account`, `Session`, `AccountRole` enum + migration).
  - [x] 5.1.2: Domain Service (password hashing/verification, session create/lookup/delete, `loginArtist(email, password)`; unit tests).
  - [x] 5.1.3: Controller/Action (`loginAction`/`logoutAction`; sets/clears the session cookie).
  - [x] 5.1.4: Route Protection Middleware (shipped as Next 16's `src/proxy.ts` -- the framework's rename of `middleware.ts`, always Node.js runtime -- guarding `/artist/[artistId]/*`; redirects unauthenticated or artistId-mismatched requests to login. Bundled into one PR with 5.1.5, since the proxy alone would 404 every dashboard route until the login page existed).
  - [x] 5.1.5: View & Route (artist login page; logout control in the dashboard layout; e2e spec).

- [x] **5.2: Client Accounts & Booking Linkage** (Self-service client signup/login, completely decoupled from booking submission -- `submitIntakeRequest` stays guest-capable exactly as it works today. Password-based, same as artist auth (5.1), not magic link -- an eventual in-app chat between client and artist around booking review (backlog) needs frequent, low-friction re-entry that an email round-trip works against; a "new message" notification can still carry a scoped link later as a convenience layered on top of password auth, not a substitute for it. `signupClient` only *links* an `Account` to an existing `ClientProfile` found by email -- it never creates one, since an account with no booking history has nothing yet to manage; signup fails with a friendly message telling them to book first if no match exists, or that an account already exists if the match is already linked. Client-facing routes are session-derived (`/client`, not `/client/[clientProfileId]`) rather than keyed by a URL param. Known limitation, deferred rather than solved now: a guest booking made under a different Instagram handle than the one later used to sign up won't auto-link, and neither will one made under a different email than the one on file, since matching is keyed on a single field at a time (`instagramHandle` at intake, `email` at signup) and `ClientProfile.email` itself isn't unique), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 5.2.1: Domain Service (`signupClient`/`loginClient` in `auth`, reusing `hashPassword`/`verifyPassword`/`createSession` from 5.1; `getClientBookings(clientProfileId)` in `intake`, spanning every artist a client has booked with; unit tests).
  - [x] 5.2.2: Controller/Action (`signupClientAction`/`loginClientAction`; generalizes `logoutAction` to redirect to `/artist/login` or `/client/login` based on the session's own role instead of the hardcoded artist path it has today. `getClientBookingsAction` dropped from scope -- the client dashboard (5.2.4) calls `getClientBookings` directly as a server component, matching the `getUpcomingAppointments`/`getTierReferenceImages` precedent).
  - [x] 5.2.3: Route Protection (extends `src/proxy.ts` to also guard `/client/*`, requiring a valid, unexpired session with role CLIENT -- no URL param to match against, unlike the artist check, since client routes are session-derived).
  - [x] 5.2.4: View & Route (client signup page, client login page, client dashboard listing bookings across all artists, logout control; e2e spec).

- [x] **5.3: Landing Page & Artist Discovery Directory** (Root `/` becomes a real landing page for a signed-out visitor, offering three explicit paths -- "I want to book an artist" (→ an artist directory page, then that artist's existing `/book/[artistId]` hub), "I have an existing or past booking" (→ `/client/login`), "I'm an artist" (→ `/artist/login`). A signed-in visitor hitting `/` skips the choice entirely and is redirected straight to `/client` or `/artist/[artistId]`. Preserves direct `/book/[artistId]` links (e.g. an artist's Instagram bio link) bypassing the directory entirely -- it's a fallback for organic traffic landing on the bare domain, not the only way in), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 5.3.1: Data Gateway (`Artist` gains `avatarUrl`/`bio`/`location`, all nullable + migration -- read-only for clients, artist-facing management is a backlog item, seeded via Prisma Studio for now, same as `TierReferenceImage`).
  - [x] 5.3.2: Domain Service (`getArtistDirectory()` in a new `directory` domain -- a distinct bounded context from `intake`/`scheduling`/`auth`, this is public artist-browsing, not booking/vetting logic; unit tests).
  - [x] 5.3.3: View & Route (root `/` becomes the three-option landing page, auto-redirecting an already-authenticated visitor via `getCurrentSession()`; new `/artists` directory page + `ArtistDirectoryCard`, linking into the existing `/book/[artistId]`; e2e spec).

- [x] **5.4: Self-Service Booking Modification & Cancellation** (Allow clients to update pending request details or cancel pending/confirmed requests within policy windows via the Client Dashboard. Uses the existing plain `CANCELLED` status -- the richer `CANCELLED_BY_CLIENT`/`CANCELLED_BY_ARTIST`/`NO_SHOW` lifecycle and `ClientProfile` cancellation-offense counting stay scoped to 5.6, not duplicated here, so this needs no schema change. Editable fields on a PENDING request are notes, budget range, and requested date/time only -- not tier/tags/images, which would need rerunning the full complexity/validation pipeline for comparatively low value in a first pass. An APPROVED (already-booked) request can only be self-cancelled outside a 48-hour window before the appointment; PENDING/AWAITING_SLOT_CONFIRMATION have no locked slot yet so cancel freely. AWAITING_SLOT_CONFIRMATION/APPROVED are cancel-only, not editable -- both are already mid-negotiation or locked), decomposed per the Mandatory Task Breakdown Rule:
  - [x] 5.4.1: Domain Service (`cancelIntakeRequest`/`updatePendingIntakeRequest` in `intake`, both ownership-checked against the trusted session's `clientProfileId`; cancelling an `APPROVED` request releases its `BOOKED` `TimeSlot` rows to `RELEASED`; unit tests covering ownership mismatches, status guards, the window boundary, and slot-availability conflicts).
  - [x] 5.4.2: Controller/Action (`cancelIntakeRequestAction`/`updatePendingIntakeRequestAction` in `intake/actions.ts`, deriving `clientProfileId` from `getCurrentSession()` rather than trusting client-supplied input).
  - [x] 5.4.3: Domain Hook & Logic (`useClientBookingActions` orchestrating cancel/edit form state and refreshing the dashboard list).
  - [x] 5.4.4: View & Route (Cancel button and an inline edit form on the client dashboard's booking cards; e2e spec).

- [ ] **5.5: Rescheduling & Slot Shift Engine** (Build domain logic allowing artists or clients to propose alternative time slots, update allocations, and handle confirmation workflows).

- [ ] **5.6: Cancellation & No-Show Lifecycle Management** (Implement status transitions for COMPLETED, CANCELLED_BY_CLIENT, CANCELLED_BY_ARTIST, and NO_SHOW, updating ClientProfile cancellation offenses).

### 📦 Phase 6: Financial Engine, Payments & Policy Enforcement
- [ ] **6.1: Deposit Payment Gateway Integration** (Integrate Stripe PaymentIntents/Checkout to collect required deposits upon request approval or slot lock-in -- likely also where an artist's own paid subscription to use the platform gets wired up).

- [ ] **6.2: Deposit Forfeiture & Refund Rules Engine** (Build business logic for automatic deposit retention vs. refund calculations based on cancellation timing and policies).

- [ ] **6.3: Upfront Cancellation Precharge Engine** (Build middleware check referencing ClientProfile cancellation offenses to force a 50% upfront deposit route for flagged clients).

- [ ] **6.4: Day-of Bill Modifiers & Final Checkout** (Scaffold line-item addon schema arrays and mutate prices dynamically on the checkout page).

### 🗂️ Backlog (unscoped, no priority order)
Captured for future scoping into numbered roadmap items — not yet broken down per the Mandatory Task Breakdown Rule, and not committed to a specific phase.
- Optional Client Max End Time: let clients optionally flag a hard end-time constraint (e.g., "must be done by X") on intake, for the artist to weigh when deciding duration/slot count.

- Artist Custom Response Templates: quick-copy text blocks or automated emails for approval, decline, or off-platform follow-up notifications.

- Reference Image Annotations: allow clients to tag specific reference images with notes during intake (e.g., "Use color from Image 1, but shape from Image 2").

- Placement & Canvas Metadata: capture body location / nail set context fields in intake schemas (e.g., "Left Forearm", "Full Set - Natural Nails").

- Tier Reference Gallery Management UI: artist-facing upload/reorder/remove for their own `TierReferenceImage` rows (4.6). Images are seeded via Prisma Studio in the meantime.

- Artist Profile Management UI: artist-facing editing for their own `avatarUrl`/`bio`/`location` directory fields (5.3). Seeded via Prisma Studio in the meantime.

- In-App Client/Artist Chat: on-platform messaging tied to a specific `IntakeRequest`, so review/follow-up conversation doesn't have to happen off-platform over Instagram DM. Part of why client auth (5.2) is password-based rather than magic-link -- chat needs frequent, low-friction re-entry. Likely still wants email notifications for new messages, possibly with a scoped link straight into the thread.

## 🌿 Git & Agent Workflow (Atomic Scope Strategy)
- **Branch Strategy:** Never execute major code generations or package installations directly on `main`.
- **Atomic Functional Scope:** Claude must treat **every numbered bullet point** (e.g., `2.1`, `2.2`) as a single, isolated, conceptually complete Pull Request. Do not combine or cross-pollinate different numbered tasks into a single run.
- **Numbering Scheme:** Sub-tasks are dotted numeric, not lettered (e.g. `4.1.1`, `4.1.2`, ... never `4.1a`, `4.1b`). Nest as deep as the work actually needs — a sub-task that itself needs further layer decomposition gains its own numeric children (e.g. `4.1.10` decomposing into `4.1.10.1`-`4.1.10.4`, a "quad"/four-part number), rather than switching to letters at the next level down.
- **Vertical Feature Completion:** A numbered roadmap item (e.g. `4.1`) is one complete feature, backend through frontend — never split into separate top-level numbers for "backend now" and "frontend later." Backend and frontend layers are sibling numbered sub-tasks under that same number (`4.1.1`, `4.1.2`, ...), per the Mandatory Task Breakdown Rule below, so a feature can never ship backend-only with its UI merely tracked for someday. If a feature's UI surface isn't fully known when its backend sub-tasks are first scoped, still reserve and list the trailing UI sub-task(s) as unchecked placeholders in that same pass, immediately after the backend ones.
- **Mandatory Task Breakdown Rule:** This is the standard decomposition pattern for every numbered roadmap item going forward, not just ones that look unusually large. Before writing code, Claude MUST propose numbered sub-tasks (`.1`, `.2`, `.3`, ...) for each architectural layer the feature touches — Data Gateway, Domain Service, Controller/Action, UI Primitive & Config, Domain Hook & Logic, View & Route, in that order where applicable — and get the user's go-ahead on the breakdown first. A single PR must NEVER cross layer boundaries (e.g., adding UI primitives AND writing complex hooks AND setting up page routes in one run).
- **Blast Radius Boundaries:** Data Gateway PRs (schema/migrations) must contain no application code, just Prisma models and/or raw SQL. Domain Service PRs must be pure business logic plus their unit tests, no Prisma calls beyond what the service itself needs. Controller/Action PRs must be thin `actions.ts` wrappers (validate, delegate, shape the result) with no business rules of their own. UI Primitive & Config PRs must be max setup files with zero business logic. Domain Hook & Logic PRs must focus purely on state management, validation, and domain services. View & Route PRs must focus purely on JSX composition and page routing.
- **Zero Context Bleed:** Absolute ban on adding unrelated "quick styling updates", formatting changes, or side-fixes to files outside the direct functional requirement of the active sub-task.
- **Review Interception:** Upon completing a single numbered sub-task, Claude must pause, execute `npm run test` to verify zero system regressions, present the target file diff map to the user, and request confirmation before starting the next item. For view/route-layer sub-tasks, this also means adding/updating the relevant `e2e/*.spec.ts` and explicitly telling the user to run `npm run test:e2e:ui` (see Manual E2E Verification Gate) as part of requesting their go-ahead.
- **Commit Standards:** Use clear, atomic git summaries matching the domain (e.g., `feat(intake): add zod schema validation for instagram handles`, `test(intake): implement logic checks for design complexity`).
- **Mandatory PR Description Policy** Never raise a PR without this description block. Include a brief summary of the change and why it was made. The `gh` CLI is installed and authenticated (`C:\Users\thang\tools\bin\gh.exe`, on the user PATH) — after pushing, Claude must raise the PR directly with `gh pr create --title "..." --body "..."`, passing the description block via `--body`, rather than handing the user a manual compare-URL link.