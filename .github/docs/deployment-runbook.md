# 🚀 Deployment Runbook: Vercel + Neon

How to stand up Vettr's two deployed environments (staging in 53.2, production in 53.3), how a change travels from staging to production, and how to move to another region later. The canonical list of app env vars is [`.env.example`](../../.env.example); this file covers where each value comes from.

Vendor details (region IDs, plan limits, dashboard paths) were checked against Vercel, Neon, Stripe and Resend docs on 2026-10-13. Dashboards get renamed; if a path below no longer matches, the setting is the same, only the menu moved.

---

## 1. Environments

Two Vercel projects deploy from the same repo. They never share a database, keys or an UploadThing app.

| | `vettr-staging` (set up in 53.2, permanent) | `vettr` (production, created in 53.3) |
|---|---|---|
| Deploys from | `main`, on every merge | `release`, only when you push to it (§10) |
| Domain | `staging.vettr.studio` | Apex `vettr.studio`; `www` → 308 to apex |
| Neon | Staging project, `aws-eu-west-2` (London) | Production project, same region, backups on |
| Function region | `lhr1` (London) | `lhr1` |
| Stripe | Test mode | Live mode |
| UploadThing | Staging app | Production app |
| Resend | `vettr.studio` domain, verified in 53.2.1.1 | Same domain |
| Vercel plan | Hobby until go-live, then moved into the Pro team | Pro team |

Until 53.3 only `vettr-staging` exists. Hobby is for non-commercial use only, so from go-live both projects live in the Pro team. Pro bills per team member, not per project, so the second project adds usage but no extra seat.

How a change reaches users:

```text
PR ──► main ──► vettr-staging ──► staging.vettr.studio   (test mode, staging data)
                     │
           checked on staging? (§10)
                     │
        git push origin <sha>:release
                     ▼
               vettr ──► vettr.studio                     (live mode, real users)
```

**Preview deployments are turned off** on both projects (§4 step 7). Previews get no env vars, so a preview can never reach staging or production data. That also means they can't work: `src/lib/stripe.ts` and `src/lib/resend.ts` throw when their modules load, and the build very likely fails at the same point. On `vettr`, every push to `main` would otherwise produce a Preview build too, because `main` isn't that project's production branch. Skipped builds show as `CANCELED` and still count toward Vercel's deployment quota.

---

## 2. Environment variables

### 2.1 Vercel (the app)

Set under each project's *Settings → Environment Variables*, **Production scope only**: the Staging column goes on `vettr-staging`, the Production column on `vettr`. Vercel applies changes only to new deployments, so **redeploy after any change**. `NEXT_PUBLIC_*` values are inlined into the build, so they must be set before the build runs.

| Variable | Read at | Staging | Production | If missing |
|---|---|---|---|---|
| `DATABASE_URL` | Runtime | Staging Neon **pooled** URL | Production Neon **pooled** URL | No error at boot; first query fails |
| `STRIPE_SECRET_KEY` | Module load | `sk_test_…` | `sk_live_…` | `src/lib/stripe.ts` throws; every route importing it fails |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Build** | `pk_test_…` | `pk_live_…` | Payment form fails to load in the browser |
| `STRIPE_WEBHOOK_SECRET` | Per request | Test endpoint's `whsec_…` | Live endpoint's `whsec_…` | Every webhook gets 400; Stripe keeps retrying |
| `UPLOADTHING_TOKEN` | Per request | Staging app token | Production app token | Reference image uploads fail |
| `RESEND_API_KEY` | Module load | Sending-only key | Same key, or a new one | `src/lib/resend.ts` throws; every route loading the email-code auth actions fails |
| `EMAIL_FROM` | Per send | `Vettr <no-reply@vettr.studio>` | Same | Nothing throws; logs `missing_email_from_env`, no code is sent |
| `CRON_SECRET` | Per request | Random 32 bytes, hex | **New** random value | Every cron call gets 401 |
| `NEXT_PUBLIC_APP_URL` | **Build** | `https://staging.vettr.studio` | `https://vettr.studio` | Silently falls back to `http://localhost:3000` in `metadataBase` and Connect onboarding return URLs |

Never set `EMAIL_CAPTURE_SINK_PATH` on Vercel (dev and e2e only; ignored in production anyway). `VERCEL_*` system variables are set by Vercel itself.

### 2.2 GitHub repo secrets

*Repo → Settings → Secrets and variables → Actions*, or `gh secret set <NAME>` (prompts for the value).

| Secret | Used by | Value |
|---|---|---|
| `APP_URL` | `session-cleanup.yml`, `deposit-refund-retry.yml` | Custom-domain origin the scheduled jobs call: `https://staging.vettr.studio` until go-live, then `https://vettr.studio`. Never a `*.vercel.app` URL (see §4, Deployment Protection). |
| `CRON_SECRET` | Same two workflows | Identical to `CRON_SECRET` on the project `APP_URL` points at |
| `STRIPE_SECRET_KEY` | `ci.yml` Stripe integration and e2e jobs | **Test-mode** key only |
| `STRIPE_PUBLISHABLE_KEY` | `ci.yml` e2e job, which copies it into `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Test-mode** key only. No app code reads this name, so it is not in `.env.example`. |

CI never gets live keys.

After go-live the scheduled jobs run against production only. To exercise a sweep on staging, call it by hand with staging's own secret:

```bash
curl --fail-with-body -X POST -H "Authorization: Bearer <staging CRON_SECRET>" \
  https://staging.vettr.studio/api/cron/deposit-refund-retry
```

Running both environments on a schedule would need GitHub Environments and a workflow change; that isn't done yet.

---

## 3. Neon (Postgres)

### 3.1 Create the project

- **Region:** AWS Europe (London), `aws-eu-west-2`, to sit next to Vercel's `lhr1`. A Neon project's region is **fixed at creation**; moving later is §12.
- **Postgres version:** 16, matching CI and the local throwaway test DB (`postgres:16` in `ci.yml` and `scripts/test-db/constants.ts`).
- **One project per environment.** Staging and production never share a project or a branch.

### 3.2 Pooled vs direct connection strings

Neon's *Connect* dialog gives both; the *Connection pooling* toggle switches between them.

| | Host looks like | Use for |
|---|---|---|
| **Pooled** (PgBouncer, transaction mode) | `ep-…-pooler.eu-west-2.aws.neon.tech` | Vercel's `DATABASE_URL` |
| **Direct** | `ep-….eu-west-2.aws.neon.tech` (no `-pooler`) | `prisma migrate`, `pg_dump`, `pg_restore`, psql |

Neon recommends the direct URL for schema migrations, and `pg_dump`/`pg_restore` require it. Keep the `sslmode=require` parameter Neon includes.

### 3.3 Run migrations

Migrations never run in the Vercel build (`npm run build` only runs `prisma generate`), so two concurrent deploys can't race on the schema. Run them by hand, from a checkout of the commit you're about to deploy.

There is no separate direct-URL variable: `prisma7.config.ts` reads `DATABASE_URL`. Override it for the one command. `prisma7.config.ts` loads `.env` through dotenv, which never overwrites a variable that's already set, so the inline value wins over your local dev URL.

Check first. `migrate status` is read-only and prints the target as `Datasource "db": PostgreSQL database "neondb", schema "public" at "<host>"`. Confirm that host is the Neon **direct** host, not `localhost` and not `-pooler`, before running `deploy`:

```bash
# Git Bash
DATABASE_URL='<direct URL>' npx prisma migrate status
DATABASE_URL='<direct URL>' npx prisma migrate deploy
```

```powershell
# PowerShell
$env:DATABASE_URL = '<direct URL>'
npx prisma migrate status
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
```

- **Order:** migrate *before* deploying the code that needs it. The old deployment keeps serving until the new one is live, so a migration must not break the code that's still running: add first, drop in a later release.
- **Never run `npm run db:seed` against Neon.** It's the local dev fixture script: it inserts dev accounts and deletes rows whose Instagram handle starts `test_client_` or `e2e_`. Hand-provision staging data instead (53.2.1.2).
- Test suites never point at Neon. `test:local` / `test:e2e:local` use throwaway Docker databases.

---

## 4. Vercel project

Do this once per project: `vettr-staging` in 53.2, `vettr` in 53.3 (§11), each with its own column of §2.1. A new project's first deployment is always a production deployment of `main`, whatever the branch setting, so add the env vars in the import dialog and attach the domain last.

1. **Import:** *Add New → Project*, pick the GitHub repo. Framework preset Next.js. Leave the build command at its default: it runs `npm run build`, which is `prisma generate && next build` (53.1.3.1).
2. **Production branch:** *Settings → Environments → Production → Branch Tracking*. `main` for `vettr-staging` (the default); `release` for `vettr`.
3. **Node.js version:** *Settings → Build and Deployment → Node.js Version.* CI runs Node 26 (`ci.yml`), but Vercel offers 24.x and 22.x at the time of writing. Pick the newest Vercel offers. CI is therefore not testing the exact runtime; if a Node-version bug shows up only on Vercel, check this first.
4. **Function region:** *Settings → Functions → Function Regions* → `lhr1` (London, `eu-west-2`), the same location as the Neon project. Vercel's default for new projects is `iad1` (Washington, D.C.); leaving it there sends every query across the Atlantic. Hobby allows a single region. The region lives **only** in project settings, never in `vercel.json` `regions` or a route's `preferredRegion`, so moving region (§12) needs no code change. Redeploy after changing it.
5. **Function duration:** `src/app/api/cron/deposit-refund-retry/route.ts` sets `maxDuration = 300`. With Fluid compute (on by default) both Hobby and Pro allow 300s. If Fluid compute is ever turned off, check that limit again.
6. **Env vars:** that project's column of §2.1, Production scope only.
7. **Previews off:** *Settings → Build and Deployment → Ignored Build Step* → **Only build production** (see §1 for why).
8. **Domain:** *Settings → Domains*, assigned to Production: `staging.vettr.studio` on `vettr-staging`; `vettr.studio` and `www.vettr.studio` on `vettr` (§11). Add the records Vercel shows at the registrar and wait until Vercel reports them valid.
9. **Deployment Protection:** *Settings → Deployment Protection* should be **Standard Protection** (or off). Standard Protection guards everything except production domains, so `staging.vettr.studio` and `vettr.studio` stay public while `*.vercel.app` deployment URLs require a Vercel login. That is why the Stripe webhook URL, `APP_URL` and `NEXT_PUBLIC_APP_URL` must all use the custom domain. Never choose *All Deployments*: it would answer Stripe and the cron jobs with a login wall.

---

## 5. Stripe

### 5.1 Keys and Connect

- Staging uses **test mode**: *Developers → API keys*. `sk_test_…` → `STRIPE_SECRET_KEY`, `pk_test_…` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- Connect must be enabled on the platform account (in test mode for staging). Artists onboard through `createArtistConnectAccount.ts` and `createConnectOnboardingLink.ts`; the onboarding return and refresh URLs come from `NEXT_PUBLIC_APP_URL`.
- **Never mix modes.** The secret key, publishable key and webhook secret must all come from the same mode.

### 5.2 Webhook endpoint (platform events)

*Workbench → Webhooks → add an endpoint*:

| Setting | Value |
|---|---|
| Events from | **Your account** |
| URL | `https://staging.vettr.studio/api/webhooks/stripe` |
| API version | `2026-08-26.dahlia`, the version the installed `stripe` package pins (`node_modules/stripe/esm/apiVersion.js`). `src/lib/stripe.ts` doesn't set one, so the code is typed against the SDK's version. **Recheck after every `stripe` upgrade.** |
| Events | `payment_intent.succeeded`, `payment_intent.payment_failed`, `refund.created`, `refund.updated`, `refund.failed`, `account.updated` (the list in the route's header comment and roadmap 56.1) |

Copy the endpoint's signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` and redeploy. You can create the endpoint before the first deploy, since the URL is known in advance.

Deposits are platform charges, routed to the artist with `on_behalf_of` + `transfer_data` once their Connect account can take charges (`createDepositPaymentIntent.ts`). Either way the PaymentIntent and its refunds belong to the platform account, so their events arrive on this endpoint.

### 5.3 ⚠️ Open: `account.updated` needs a second endpoint (53.2.1.2)

- Stripe only delivers `account.updated` for **connected accounts** to an endpoint whose *Events from* is **Connected accounts**, and every endpoint has its own signing secret.
- `src/app/api/webhooks/stripe/route.ts` verifies a single `STRIPE_WEBHOOK_SECRET`, so it cannot accept events from both endpoints.
- `syncArtistConnectAccountStatus` is only ever called from that webhook. On a deployed environment, an artist's `stripeConnectChargesEnabled` therefore never turns on after onboarding. Payments still work, but deposits fall back to plain platform charges: the money stays in the platform balance instead of routing to the artist.
- Local dev hides this: `stripe listen` signs forwarded account and Connect events with the same secret.
- Fixing it is a code change (for example, a second secret checked in the route). 53.2.1.2 owns the decision; it must be settled before the deposit smoke test can prove routing to the artist.

---

## 6. UploadThing

1. Create one app per environment in the UploadThing dashboard, so staging uploads never share storage with production.
2. *App → API Keys* → copy the token into `UPLOADTHING_TOKEN`.
3. Image hosts are already allowed: `next.config.ts` `images.remotePatterns` covers `*.ufs.sh` and `utfs.io`.

Open (53.5, a go-live gate): the `/api/uploadthing` `designReferenceImages` endpoint has no auth yet.

---

## 7. Resend

Done once for `vettr.studio` in 53.2.1.1; production reuses it.

1. **Add the domain:** *Domains → Add domain* → `vettr.studio`, region **`eu-west-1` (Ireland)**, the closest to London. The region is fixed at creation; changing it means deleting the domain, re-adding it and redoing the DNS. Latency matters here: `requestClientSignInCode` gives the send 1s (`EMAIL_OTP_SEND_TIMEOUT_MS`, `src/domains/auth/constants.ts`).
2. **DNS:** add the SPF and DKIM records from the domain's *Records* tab at the registrar, exactly as shown (the Return-Path defaults to the `send.` subdomain). If the registrar proxies CNAMEs (e.g. Cloudflare's orange cloud), turn proxying off for them or verification never completes. Then *Verify*.
3. **DMARC** (after verification): add a TXT record at `_dmarc.vettr.studio`. Start with `v=DMARC1; p=none; rua=mailto:<your address>` and tighten the policy once reports look clean.
4. **API key:** *API Keys → Create*, permission **Sending access**, restricted to `vettr.studio` → `RESEND_API_KEY`.
5. **Sender:** `EMAIL_FROM` = `Vettr <no-reply@vettr.studio>` (any address on the verified domain works).

---

## 8. `CRON_SECRET` and scheduled jobs

Scheduled jobs run from **GitHub Actions**, not Vercel Cron. Each workflow POSTs to the app with `Authorization: Bearer $CRON_SECRET`; `src/lib/cronAuth.ts` compares it and fails closed.

| Workflow | Schedule (UTC) | Route | Success body |
|---|---|---|---|
| Session Cleanup (`session-cleanup.yml`) | Daily 03:00 | `POST /api/cron/session-cleanup` | `{ deletedCount, emailOtpDeletedCount, durationMs }` |
| Deposit Refund Retry (`deposit-refund-retry.yml`) | Hourly at :17 | `POST /api/cron/deposit-refund-retry` | `{ reconciled, refunded, failed, deferred, durationMs }` |

1. **Generate** the secret, in Git Bash or with Node:
   ```bash
   openssl rand -hex 32
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Vercel:** set `CRON_SECRET` (Production) and redeploy.
3. **GitHub:** set the `CRON_SECRET` (same value) and `APP_URL` repo secrets (§2.2).
4. **Enable and trigger once.** As of 2026-10-13, Session Cleanup is enabled (and has failed every run since 2026-10-05 for lack of these secrets); Deposit Refund Retry was disabled after merge.
   ```bash
   gh workflow enable deposit-refund-retry.yml
   gh workflow run session-cleanup.yml
   gh workflow run deposit-refund-retry.yml
   gh run list --workflow session-cleanup.yml --limit 1   # then: gh run view <run-id> --log
   ```
   The job log ends with the success body above. A 401 means the two `CRON_SECRET` values differ, or Vercel wasn't redeployed after setting it.
5. **Rotation:** new value in Vercel → redeploy → update the GitHub secret. Runs that land in between get 401; both sweeps are safe to skip, and the next run catches up.

---

## 9. First deploy checklist (staging)

Mapped to the 53.2 sub-tasks.

1. **53.2.1.1**: Neon staging project (§3.1); `migrate status` then `migrate deploy` with the direct URL (§3.3). Resend domain, DNS and key (§7).
2. Stripe test keys and the platform webhook endpoint (§5.1, §5.2). UploadThing staging app (§6). Generate `CRON_SECRET` (§8).
3. Vercel project `vettr-staging` (§4): production branch `main`, Node version, region `lhr1`, all nine env vars, previews off, domain `staging.vettr.studio`, Deployment Protection check.
4. **53.2.1.2**: deploy (push to `main`, or *Redeploy*). Settle §5.3 first if the smoke test should cover routing deposits to the artist.
5. Smoke test on `https://staging.vettr.studio`:
   - Artist sign-in and Connect onboarding with Stripe test data.
   - Client email code arrives from Resend. Check spam placement and that the headers show SPF and DKIM `pass`.
   - Booking intake with a reference image upload.
   - Deposit payment with test card `4242 4242 4242 4242`.
   - In Stripe, the webhook endpoint's deliveries show 2xx. Vercel *Logs* show no errors.
6. **53.2.1.3**: GitHub secrets, enable and trigger both workflows, read the counts in the job logs (§8).

---

## 10. Releasing a change (after go-live)

Every change reaches staging first, because `vettr-staging` deploys each merge to `main`. Production only moves when you push to `release`.

1. **Migrations, staging:** if the PR adds a migration, run `migrate status` then `migrate deploy` against **staging**'s direct URL (§3.3) before merging. Migrations are additive first, so the code still running on staging keeps working.
2. **Merge to `main`.** `vettr-staging` deploys it. Check the changed flow on `https://staging.vettr.studio`. The commit staging is running is shown on the project's current production deployment in the Vercel dashboard.
3. **Migrations, production:** if anything you're about to release added a migration, run it against **production**'s direct URL. The additive-first rule keeps the production code that's still running working.
4. **Release** exactly the commit you checked:
   ```bash
   git fetch origin
   git push origin <checked-sha>:release
   ```
   This is a fast-forward, and it releases every earlier commit on `main` too, so check staging at the newest commit you're releasing. Never release a commit staging hasn't run. If git rejects the push as non-fast-forward, `release` was changed some other way: stop and look; never force-push.
5. **Watch** the `vettr` deployment finish, then smoke-check the change on `https://vettr.studio`. If it's bad, use *Instant Rollback* on `vettr` (Pro can roll back to any earlier production deployment), then fix forward through steps 1–4. Rollback restores code only: it does not undo migrations, sent emails or Stripe charges.

Protect `release` in GitHub (repo *Settings → Rules* or *Branches*): block force-pushes and deletion.

---

## 11. Go-live (53.3): create the production project

`vettr-staging` stays exactly as it is. Production is a new project built next to it, set up with §4 and the Production column of §2.1:

- **Vercel Pro team:** transfer `vettr-staging` into it (project *Settings → General*), then create `vettr` there, before taking real deposits.
- **`release` branch:** create it from a commit that staging is running and you've checked, `git push origin <checked-sha>:refs/heads/release`, and protect it (§10).
- **`vettr` project:** every §4 step, with production branch `release`, region `lhr1` and previews off.
- **Neon:** a new production project in the same region, migrated with §3.3. Turn on backups and point-in-time restore (paid plan) before holding real artist data (53.3.1.2).
- **Stripe:** complete account activation and the Connect platform profile and branding. Use live keys. Create a new live-mode endpoint with the §5.2 settings, pointed at `https://vettr.studio/api/webhooks/stripe`; it has its own `whsec_`. If §5.3 added a Connect endpoint, create its live counterpart too. Staging keeps its test-mode endpoint.
- **UploadThing:** production app, its own token.
- **`CRON_SECRET`:** a new value on `vettr`; staging keeps its own.
- **Domains (on `vettr`):** apex `vettr.studio` as the production domain, and `www.vettr.studio` redirecting 308 to the apex. The session cookie is host-only, so only one host may serve the app. `staging.vettr.studio` stays on `vettr-staging`.
- **`NEXT_PUBLIC_APP_URL=https://vettr.studio`** on `vettr`, set before its build (it is build-time).
- **GitHub:** repoint `APP_URL` to `https://vettr.studio` and `CRON_SECRET` to production's value (§2.2).
- **Smoke test** with a real low-value payment, then refund it to prove the refund webhooks with real money (53.3.1.2).

Only `RESEND_API_KEY` and `EMAIL_FROM` can be the same on both projects.

---

## 12. Moving to a US region

A Neon project's region can't change, so a move means a new project plus a data copy. The Vercel function region is only a setting. No code changes.

Each Vercel project has its own Neon project, so run the steps below once per project: `vettr-staging` first as a rehearsal, then `vettr`.

| Neon region | Vercel region |
|---|---|
| `aws-us-east-1` (N. Virginia) | `iad1` (Washington, D.C.) |
| `aws-us-east-2` (Ohio) | `cle1` (Cleveland) |
| `aws-us-west-2` (Oregon) | `pdx1` (Portland) |

1. **New Neon project** in the target region, on the **same Postgres major version** as the old one.
2. **Tools:** `pg_dump --version` must be at least the server's major version; use client tools from a matching or newer Postgres install.
3. **Freeze writes:**
   - `gh workflow disable session-cleanup.yml` and `gh workflow disable deposit-refund-retry.yml`.
   - Block app traffic with a Vercel Firewall custom rule that denies all requests. Stripe retries failed live-mode deliveries for up to three days, so webhook events from the window arrive after cutover. The alternative is a quiet window, accepting that any write between the dump and the cutover is lost.
4. **Copy**, using **direct** URLs on both sides:
   ```bash
   pg_dump -Fc -v -d '<old direct URL>' -f vettr.dump
   pg_restore -v --no-owner --no-acl -d '<new direct URL>' vettr.dump
   ```
5. **Verify:** `DATABASE_URL='<new direct URL>' npx prisma migrate status` reports the schema up to date. Spot-check row counts on both sides (e.g. `SELECT count(*) FROM "BookingRequest";` in each project's SQL editor).
6. **Cut over:** in Vercel, set `DATABASE_URL` to the new **pooled** URL and *Function Regions* to the matching region, then redeploy.
7. **Smoke test** (§9 step 5, minus Connect onboarding).
8. **Lift the freeze:** remove the firewall rule, `gh workflow enable` both workflows, trigger each once.
9. **Keep the old Neon project** untouched for a grace period (e.g. a week) and keep `vettr.dump`, then delete both.

Resend's region is per domain and stays `eu-west-1` unless you choose to re-create the domain (§7). UploadThing is unaffected.
