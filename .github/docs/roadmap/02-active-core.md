---
globs: ["**/docs/roadmap/02-active-core.md"]
---
# ⚡ Active Core Sprint Plane (Phases 25–26)

> ⚠️ **Global Structural Mandate:** Any task introducing domain input validation MUST follow the `constants.ts` / `types.ts` / `[domain].schema.ts` split defined in the global architecture rules.

---

### 📦 Phase 25: Universal Back Navigation ◄ CURRENT FOCUS
- [ ] **25.1: Universal Back Navigation** (Audit every client/artist sub-page, form view, modal overlay, and drawer layer for a consistent, structured parent back navigation control. Replace scattered layout links with a shared navigation primitive).

---

### 📦 Phase 26: Unified Dual-Role Accounts & Explicit Role-Switching
> Resolves the identity collision where `Account.email @unique` blocks an artist from booking as a client under the same email profile.
- [ ] **26.1: Dual-Role Core Engine Setup**
  - **Prerequisite Architecture pass:** Enforce the design constraint that an artist's linked client identity must use a standard `ClientProfile` row so precharge models apply naturally.
  - **Unscoped Execution Plane:** Propose and execute the 6-layer *Mandatory Task Breakdown Rule* pass (Data Gateway through View layer) targeting session validation shifts, `SessionWithAccount` role mutations, role-switch server actions, and route protection updates inside `src/proxy.ts` before writing code.
