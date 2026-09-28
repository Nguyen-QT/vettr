---
globs: ["**/docs/roadmap/03-polish-and-config.md"]
---
# 🎨 Polish & Configuration Sprint Plane (Phases 29, 30, 31, 37, 38, 39, 40, 49)

This tracking file contains upcoming user experience refinements, interface standardizations, configuration forms, and technical debt items. These phases execute lower-risk cosmetic, presentational, or menu features building atop the core application engines. Phase numbers reflect global priority rank across the entire unstarted backlog (see `04-future-epics.md` for the higher-lift/infra phases interleaved between these).

---

### 📦 Phase 29: Hook State Hygiene Debt
- [ ] **29.1: Fix the `react-hooks/set-state-in-effect` sites** (Re-engineer state flows flagged inside theme controls, deposit forms, and schedule options to consume mount utilities natively without triggering validation cascade warnings).
- [ ] **29.2: Retrofit Independent Mutation State Isolation onto Pre-Existing Hooks** (Refactor legacy schedule configurations to isolate transaction updates into unique independent execution state pairs).

---

### 📦 Phase 30: Post-Submission Request Confirmation UX
- [ ] **30.1: Client Post-Submission Flow** (Unscoped -- Define what a client sees/does immediately after submitting a booking request: confirmation screen state, messaging on "no auto-booking, artist will review", and any status page or email. Currently underspecified per CLAUDE.md's "no auto-booking" model).

---

### 📦 Phase 31: Required Field Visual Indicator Standard
- [ ] **31.1: Required Field Visual Indicator** (Unscoped -- Establish a consistent visual marker, e.g. asterisk + semantic color token per frontend.md's token rules, for required fields across all forms, tying into validation.md's existing schema-layer constraints so required-ness is visually surfaced, not just enforced server-side).

---

### 📦 Phase 37: Global Navigation & Active-Page Context Clarity
- [ ] **37.1: Active-Page Context Indicators** (Unscoped -- Make it obvious to users which page/section they're currently in, via breadcrumbs, active-nav-item highlighting, or page-title treatment, across the dashboard/settings/booking flows).

---

### 📦 Phase 38: Layout & Responsive Consistency Polish
- [ ] **38.1: Request Page Padding Standardization** (`/book/[artistId]/page.tsx` padding adjustments matching container class standards).
- [ ] **38.2: Nested Viewport Unit Audit** (Workspace-wide component check tracking down and eliminating hardcoded nested sizing constraints).
- [ ] **38.3: Settings Back-Button Consistency** (The settings page back navigation currently renders as a full-width bar, inconsistent with the standard nav affordances used elsewhere in the app; restyle to match).

---

### 📦 Phase 39: Artist Profile Management UI
- [ ] **39.1: Profile Editing** (Unscoped -- Deconstruct dynamic dashboard text forms writing fields for `avatarUrl`, `bio`, and `location` using the public interfaces of the `directory` context).

---

### 📦 Phase 40: Budget Input Enhancements
- [ ] **40.1: Budget Slider & Wheel Picker Polish** (Render frame locks during active dragging events, deploy dynamic increments, and add alternative entry controls).

---

### 📦 Phase 49: Domain Service Refactor — Design Pattern TBD
- **Status:** Unscoped.
- **Objectives:** Revisit domain services against architecture.md's SOLID/single-responsibility rules once a specific target pattern and target services are chosen. No concrete scope exists yet; needs a follow-up scoping conversation before any task breakdown.
