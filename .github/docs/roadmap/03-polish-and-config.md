---
globs: ["**/docs/roadmap/03-polish-and-config.md"]
---
# 🎨 Polish & Configuration Sprint Plane (Phases 27–33)

This tracking file contains upcoming user experience refinements, interface standardizations, configuration forms, and technical debt items. These phases execute lower-risk cosmetic, presentational, or menu features building atop the core application engines.

---

### 📦 Phase 27: Layout & Responsive Consistency Polish
- [ ] **27.1: Request Page Padding Standardization** (`/book/[artistId]/page.tsx` padding adjustments matching container class standards).
- [ ] **27.2: Nested Viewport Unit Audit** (Workspace-wide component check tracking down and eliminating hardcoded nested sizing constraints).

---

### 📦 Phase 28: Budget Input Enhancements
- [ ] **28.1: Budget Slider & Wheel Picker Polish** (Render frame locks during active dragging events, deploy dynamic increments, and add alternative entry controls).

---

### 📦 Phase 29: Artist Profile Management UI
- [ ] **29.1: Profile Editing** (Unscoped -- Deconstruct dynamic dashboard text forms writing fields for `avatarUrl`, `bio`, and `location` using the public interfaces of the `directory` context).

---

### 📦 Phase 30: Hook State Hygiene Debt
- [ ] **30.1: Fix the `react-hooks/set-state-in-effect` sites** (Re-engineer state flows flagged inside theme controls, deposit forms, and schedule options to consume mount utilities natively without triggering validation cascade warnings).
- [ ] **30.2: Retrofit Independent Mutation State Isolation onto Pre-Existing Hooks** (Refactor legacy schedule configurations to isolate transaction updates into unique independent execution state pairs).

---

### 📦 Phase 31: Per-Artist Customizable Tiers/Service Types
- [ ] **31.1: Tier Configurability** (Unscoped -- Restructure the hardcoded `ComplexityTier` literal definitions across both the booking and billing systems into dynamic database-backed options).

---

### 📦 Phase 32: Tier Reference Gallery Management UI
- [ ] **32.1: Artist-Facing Gallery Management** (Deploy file management triggers allowing artists to dynamically upload, reorder, or scrub assets tracking `TierReferenceImage` collections).

---

### 📦 Phase 33: Per-Artist Slot Rules & Service Duration Configuration
- [ ] **33.1: Slot Rules Configurability** (Unscoped -- Deconstruct and widen global schedule definitions, dynamically linking duration thresholds and fixed slot selections directly to metadata records configured by the artist).
