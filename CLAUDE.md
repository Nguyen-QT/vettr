# 🚀 Vettr — Bespoke Booking & Selection Engine - Project Guide

## 🛠️ Tech Stack & Tooling Core
- **Framework:** Next.js 15+ (App Router, Server Actions)
- **Language:** TypeScript (Strict Mode, explicit types mandatory, `any` forbidden)
- **Database & ORM:** PostgreSQL + Prisma ORM
- **Styling:** Tailwind CSS + Shadcn UI (High-end aesthetic execution)
- **State & Validation:** Zod (Schema validation), React Server Actions

## ⚙️ Common Development Commands
- Build Workspace: `npm run build`
- Run Local Dev Server: `npm run dev`
- Playwright End-to-End Verification: `npm run test:e2e:ui`
- Code Formatting & Linting: `npm run lint`

## 🧭 System Infrastructure Map
- **Modular Feature Roadmaps:** Read/write files exclusively inside `/.github/docs/roadmap/` for tracking overall engine execution status.
- **Active Task Plane:** Focus session contexts strictly on `/.github/docs/roadmap/02-active-core.md` for real-time feature updates.
- **Global Invariant Rules:** Evaluated on-demand via path-scoped configurations inside `.claude/rules/`.

## 🎨 Engine Blueprints & Core Constraints
This engine is a **curation and screening tool**, *not* a standard calendar utility.
1. **No Auto-Booking:** Clients request starting slot candidates only. The artist manually determines service duration upon review. No DB allocations occur until manual approval. If an artist-specified duration overflows the slot, it consumes the adjacent slot (capped at two consecutive slots).
2. **Visual Screening:** Requests MUST contain an Instagram handle and ≥ 1 high-res reference image. Filter and programmatically reject text queries containing basic/simple work blacklisted terms *before* DB persistence.
3. **Dynamic Billing:** Financial schemas must support a structural `depositPaid` flag, a dynamic base `estimatedPrice`, and dynamic day-of-service custom line-item `addons`.
4. **Client Flagging:** The `ClientProfile` model must track historic cancellations and enforce a mandatory `enforcePrecharge` state (50% upfront penalty) if flagged.

## 🏗️ Architectural & Workflow Foundations
- **Domain Boundaries:** Strict DDD isolation. Refer directly to `.claude/rules/architecture.md` before writing data structures or service layers.
- **Git & Agent Workflow:** Pure Atomic Scope Strategy. Refer directly to `.claude/rules/git-workflow.md` when altering state, branching, or roadmap progress.

<important>
- You MUST evaluate the `.claude/rules/` directory immediately on startup.
- You MUST strictly match and apply the specific rule suites defined in `.claude/rules/*.md` when targeting paths covered by their frontmatter globs.
- You MUST completely avoid using the `any` keyword; use strict, narrow typing for all structures.
- NEVER summarize, combine, or bypass numbered roadmap sub-tasks without explicit human confirmation.
</important>
