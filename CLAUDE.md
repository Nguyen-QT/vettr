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

## 🧪 Automated Testing Guardrails
- **Mandatory Coverage:** Every core domain service (especially booking logic, slot allocations, and billing multipliers) must have accompanying unit tests.
- **Edge-Case Matrix:** Tests must explicitly cover race conditions, double-booking attempts, invalid timezone bounds, and past cancellation tracking.
- **The CLI Verification Rule:** Before marking any task in the roadmap as complete, Claude must execute `npm run test` in the terminal and verify a 100% green pass rate.

## 🧭 Project Blueprint & Core Constraints
This app is *not* a standard calendar app (like Calendly). It is a **curation and screening tool**. 
1. **No Auto-Booking:** Clients request slots (11:00 AM, 2:00 PM, 5:30 PM). No database allocation occurs until the artist manually clicks "Approve".
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
  - [x] 2.5a: UI Primitive & Config Setup (Shadcn init/primitives, UploadThing client helper, image config).
  - [x] 2.5b: Domain Hook & Logic (`useVisualIntakeForm` state/validation orchestration).
  - [x] 2.5c: View & Route (`VisualIntakeForm.tsx` composition + `/book/[artistId]` routing).

### 📦 Phase 3: Artist Decision Dashboard
- [x] **3.1: Dashboard Layout Scaffold** (Build basic layout wrapper with authentic mobile-first rendering tailored for working artists).
- [x] **3.2: Interactive Review Cards** (Build component that accepts intake data and renders 1-click Instagram deep links and reference images).
- [x] **3.3: Action Mutators (Approve/Decline)** (Write server actions to toggle intake request enums and generate automatic response message copies).

### 📦 Phase 4: Concurrency Rules & Financial Logic ◄ CURRENT FOCUS
- [ ] **4.1: Reservation Lock-In Timers** (Design database state checks to ensure a time slot isn't allocated to two approved clients concurrently).
- [ ] **4.2: Day-of Bill Modifiers** (Scaffold line-item addon schema arrays and mutate prices dynamically on the checkout page).
- [ ] **4.3: Upfront Cancellation Precharge Engine** (Build middleware check that references `ClientProfile` cancellation offenses and forces a 50% upfront deposit route).


## 🌿 Git & Agent Workflow (Atomic Scope Strategy)
- **Branch Strategy:** Never execute major code generations or package installations directly on `main`.
- **Atomic Functional Scope:** Claude must treat **every numbered bullet point** (e.g., `2.1`, `2.2`) as a single, isolated, conceptually complete Pull Request. Do not combine or cross-pollinate different numbered tasks into a single run.
- **Mandatory Task Breakdown Rule:** If a single task requirement involves infrastructure/primitives + domain state/hooks + page views, Claude MUST propose decomposing it into sub-tasks (a, b, c) BEFORE writing code. A single PR must NEVER cross layer boundaries (e.g., adding UI primitives AND writing complex hooks AND setting up page routes in one run).
- **Blast Radius Boundaries:** UI Primitive & Config PRs must be max setup files with zero business logic.
Domain Hook & Logic PRs must focus purely on state management, validation, and domain services.
View & Route PRs must focus purely on JSX composition and page routing.
- **Zero Context Bleed:** Absolute ban on adding unrelated "quick styling updates", formatting changes, or side-fixes to files outside the direct functional requirement of the active sub-task.
- **Review Interception:** Upon completing a single numbered sub-task, Claude must pause, execute `npm run test` to verify zero system regressions, present the target file diff map to the user, and request confirmation before starting the next item.
- **Commit Standards:** Use clear, atomic git summaries matching the domain (e.g., `feat(intake): add zod schema validation for instagram handles`, `test(intake): implement logic checks for design complexity`).
- **Mandatory PR Description Policy** Never raise a PR without this description block. Include a brief summary of the change and why it was made. The `gh` CLI is installed and authenticated (`C:\Users\thang\tools\bin\gh.exe`, on the user PATH) — after pushing, Claude must raise the PR directly with `gh pr create --title "..." --body "..."`, passing the description block via `--body`, rather than handing the user a manual compare-URL link.