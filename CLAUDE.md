# Bespoke Intake & Selection Engine - Project Guide

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

## 🧭 Project Blueprint & Core Constraints
This app is *not* a standard calendar app (like Calendly). It is a **curation and screening tool**. 
1. **No Auto-Booking:** Clients request slots (11:00 AM, 2:00 PM, 5:30 PM). No database allocation occurs until the artist manually clicks "Approve".
2. **Visual Enforcement:** Every request *must* contain an Instagram handle and at least one high-resolution design reference image.
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
│   │   └── actions.ts        # Next.js Server Actions boundary
│   ├── scheduling/           # Domain 2: Slot booking, flex-shifts, concurrent blocks
│   └── billing/              # Domain 3: Dynamic tabs, cancellation penalty engines
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
- [ ] **Phase 1: Database Foundation & Domain Mapping** ◄ CURRENT FOCUS
  - Initialize PostgreSQL schema via Prisma.
  - Setup core entity relationships (`Artist`, `ClientProfile`, `IntakeRequest`, `TimeSlot`).
- [ ] **Phase 2: Core Intake Engine & Visual Guardrails**
  - Implement dynamic multi-image upload & Instagram validation.
- [ ] **Phase 3: Artist Decision Dashboard**
  - Build UI layout cards featuring 1-click execution triggers.
- [ ] **Phase 4: Concurrency Rules & Financial Logic**
  - Implement lock-in timers, day-of bill modifiers, and cancellation upfront charge engines.
