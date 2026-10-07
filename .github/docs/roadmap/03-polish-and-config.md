---
globs: ["**/docs/roadmap/03-polish-and-config.md"]
---
# 🎨 Polish & Configuration Sprint Plane (Phases 29, 30, 31, 37, 38, 39, 40, 49, 53)

This tracking file contains upcoming user experience refinements, interface standardizations, configuration forms, and technical debt items. These phases execute lower-risk cosmetic, presentational, or menu features building atop the core application engines. Phase numbers are stable IDs, not a priority rank — the work order lives in the Priority Queue at the top of `02-active-core.md` (see `04-future-epics.md` for the higher-lift/infra phases).

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
- [ ] **38.1: Request Page Padding Standardization** (**SUPERSEDED by 54.1.6.2** — `/book/[artistId]` becomes a redirect; the booking page moves to `/@handle/book`.) (`/book/[artistId]/page.tsx` padding adjustments matching container class standards).
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

---

### 📦 Phase 53: Vercel Deployment & Production Readiness
- **Status:** 53.1–53.3 scoped; 53.4–53.8 unscoped (pre-launch hardening, each needs its own layered breakdown pass when it reaches the Priority Queue). Domain `vettr.studio` purchased (2026-10-06). Sequencing: 53.1 is cheap and can be slotted in anywhere; 53.2 (test-mode staging) is safe at demo stage; 53.3 (real-money go-live) is no longer blocked by 27.1 (login throttling shipped), but still wants a final pre-launch security review.
- **Stage order (proposed):** 53.1 deployable build (after 54.1) → 53.2 staging on `staging.vettr.studio` (**before 54.3**: 54.3/54.5 make sign-in and booking depend on email codes, and real Resend delivery — DKIM/SPF, spam placement, latency against the 1s send timeout — can only be proven on a real domain; staging stays in Stripe test mode, so no money risk) → 53.4–53.8 hardening alongside 28.7, 28.8 and the rest of Phase 54 → 53.3 production go-live on the apex `vettr.studio`. Post-launch (unscoped, not yet an item): uptime check on `/` and the cron run, Stripe dashboard webhook-failure alerts.
- **Design (confirmed):** Vercel hosting + **Neon free plan** Postgres (plain Postgres, so it works with the existing `@prisma/adapter-pg`/`pg` stack; scale-to-zero wakes automatically, unlike Supabase's free tier which pauses after 7 days of inactivity and needs a manual restore). Start in a UK/EU region and align the Vercel function region to it. A future US East/West move is expected: a Neon project's region is fixed at creation, so it is a new project + dump/restore, and the runbook (53.1.6.1) must document that path and keep the Vercel function region configurable rather than hardcoded in app code. Runtime `DATABASE_URL` uses Neon's pooled (`-pooler`) connection string; `prisma migrate deploy` uses the direct, non-pooled URL. Migrations stay out of the Vercel build to avoid concurrent-deploy races.
- [ ] **53.1: Deployable Build & Runbook**
  - **Confirmed 6-layer sub-task breakdown** (each leaf = one isolated PR; do not combine):
    - [ ] **53.1.1.1** Data Gateway — N/A, no schema change.
    - [ ] **53.1.2.1** Domain Service — N/A.
    - [ ] **53.1.3.1** Controller/Action — make the Vercel build generate the Prisma client (`prisma generate` via `postinstall` or the build script; first verify whether `src/generated/prisma` is gitignored). `prisma migrate deploy` stays out of the build.
    - [ ] **53.1.4.1** UI Primitive — N/A.
    - [ ] **53.1.5.1** Domain Hook — N/A.
    - [ ] **53.1.6.1** View & Route — document every production env var in `.env.example` (`DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `UPLOADTHING_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`) and add a deployment runbook covering Vercel project setup, Neon provisioning (pooled vs direct URL), region matching and the later US region-move path, the Stripe webhook endpoint at `/api/webhooks/stripe`, UploadThing/Resend setup, and `CRON_SECRET` generation.
- [ ] **53.2: Staging Deploy & Cron Activation** (operational, no code)
  - [ ] **53.2.1.1** Provision Neon (UK/EU region), run `prisma migrate deploy` with the direct URL, set Vercel env vars (Stripe test keys). Staging gets its own Neon project/branch, never shared with production. Moved earlier from 53.3.1.1: verify `vettr.studio` as the Resend sending domain (SPF, DKIM, DMARC DNS records) and set `EMAIL_FROM` to a `@vettr.studio` address.
  - [ ] **53.2.1.2** Deploy to Vercel; point a Stripe test-mode webhook at the URL; smoke-test signup, booking intake and a deposit payment. Attach `staging.vettr.studio` (DNS at the registrar) and set `NEXT_PUBLIC_APP_URL` per Vercel environment (staging URL here, never localhost). Check whether `account.updated` (Connect) needs a separate Connect-type webhook endpoint. Hand-provision a test artist including `handle`, and smoke-test `/@handle` → booking → email code → deposit once those routes exist.
  - [ ] **53.2.1.3** Set `APP_URL` (the production deployment URL, not a preview, since Deployment Protection would 401 the cron `curl`) and `CRON_SECRET` repo secrets, re-enable the Session Cleanup workflow (27.4.6.1), trigger it once and confirm `deletedCount` in the job log. Note: the workflow is not disabled — it is active and has failed on every scheduled run since 2026-10-05 because these two secrets don't exist yet.
- [ ] **53.3: Production Go-Live** (operational; 27.1 login throttling already shipped; also waits for Phase 56)
  - [ ] **53.3.1.1** Swap to live Stripe keys and a live webhook secret (never mix test/live), attach a custom domain, verify the Resend sending domain. Specifics: upgrade to the Vercel Pro plan (Hobby forbids commercial use and deposits are commercial); complete Stripe account activation and the Connect platform profile/branding; attach the apex `vettr.studio` as canonical with `www` → 308 to apex (the session cookie is host-only, so only one host may serve the app); set production `NEXT_PUBLIC_APP_URL=https://vettr.studio` and repoint the cron `APP_URL` repo secret to it. Resend verification is already done in 53.2.1.1.
  - [ ] **53.3.1.2** Enable DB backups/point-in-time recovery (paid plan) before holding real artist data; re-run the smoke test with a real low-value payment. Refund that payment afterwards to also prove the `refund.updated` webhook path.
- [ ] **53.4: Security Headers** — *unscoped.* No security headers exist today (no `headers()` in `next.config.ts`, none in `src/proxy.ts`). Add HSTS, `frame-ancestors`/X-Frame-Options, Referrer-Policy, and a CSP that still allows Stripe Elements/Connect and UploadThing. Gates 53.3.
- [ ] **53.5: Upload Endpoint Hardening** — *unscoped.* Both flagged in Phase 54: the `/api/uploadthing` `designReferenceImages` endpoint has no auth, and `designReferenceImageUrls` accept any host. Needs a design pass for how unauthenticated booking clients upload before the email-code step (e.g. a short-lived upload token tied to the wizard draft). Gates 53.3.
- [ ] **53.6: Edge / Per-IP Rate Limiting** — *unscoped.* No IP-based limiting exists (all current limits are per-account/per-email in the DB). Use Vercel Firewall/WAF rate-limit rules on artist login, email-code send/verify and booking submit. This is also Phase 52's stated prerequisite. Gates 53.3.
- [ ] **53.7: Error Monitoring & Alerting** — *unscoped.* Only structured `console.error` today, no APM. Add error monitoring (e.g. Sentry) with PII scrubbing, so the architecture.md §6 "log a critical alert" paths (Stripe success + local write failure) actually alert someone. Gates 53.3.
- [ ] **53.8: Legal & Compliance Pages** — *unscoped.* Privacy policy, terms of service and a cookie notice before real users. The app stores DOB, email, phone and reference images (UK GDPR). Also covers ICO data-protection fee registration, data retention/deletion expectations, and linking the pages from the portal gate and booking flow. Gates 53.3.
