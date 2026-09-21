# Deploying Hireframe

The database is live and fully migrated. The application is not deployed yet
— the last step needs two things this session could not do: create a Vercel
project (the Vercel connection here is project-scoped and cannot create one)
and read the Supabase service role key (no tool exposes it).

Both take a few minutes in a browser. Everything else is done.

---

## What is already live

**Supabase project `hireframe-platform`**

| | |
|---|---|
| Project ref | `zejpartpcjkromdbtalb` |
| Region | `eu-west-2` (London) |
| API URL | `https://zejpartpcjkromdbtalb.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/zejpartpcjkromdbtalb |

London is the right call for this product: South African traffic reaches
Europe over cables that land in the UK, so it is the lowest-latency European
region for both launch markets rather than a compromise between them.

All eighteen migrations (`002`–`019`) are applied and verified against a locally
tested copy: 50 tables, 55 policies, RLS enabled on all 50 with none missed,
three pricing plans in four currencies, twelve volume bands, three storage
buckets. Every graduated pricing band boundary returns its exact expected
value on the live database, and `anon` can execute none of the
application's functions.

`001` is not applied here. It is the old single-tenant Vite CRM schema, kept
in `legacy-vite-crm/` for reference only.

> **A second project exists and should go.** `DannayEvans`
> (`yxobtuhequmeflfnqpku`, Ireland) was migrated during the build and carries
> the identical schema, but is not the one in use. It holds no data — zero
> organisations, zero users. Leaving two migrated databases around is how the
> wrong one ends up in production, so delete it at
> https://supabase.com/dashboard/project/yxobtuhequmeflfnqpku/settings/general

---

## Step 1 — create the Vercel project

1. Go to https://vercel.com/new and import `smdrawingboard-prog/DannayEvans`.
2. Framework preset: **Next.js** (it should detect this).
3. Root directory: leave as the repository root.
4. **Do not deploy yet** — add the environment variables in step 2 first, or
   the first build will deploy a site that cannot reach its database.

### Which branch goes to production

The work is on `feat/recruitment-saas-platform`, not `main`. Either:

- merge the branch into `main` and let Vercel deploy `main` as production; or
- in **Settings → Git → Production Branch**, set it to
  `feat/recruitment-saas-platform`.

The first is tidier. The second gets a live URL without deciding yet.

---

## Step 2 — environment variables

In **Settings → Environment Variables**, add these to Production, Preview and
Development.

### Safe to paste anywhere

```
NEXT_PUBLIC_SUPABASE_URL=https://zejpartpcjkromdbtalb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Ili194H7pRVVJFTtxFMvIw__tYNHmW3
SIGNATURE_PROVIDER=sealed
```

`NEXT_PUBLIC_SITE_URL` should be your real domain once you have one, e.g.
`https://hireframe.app`. Until then use the Vercel URL Vercel gives you. It
matters: it is what signing links, the sitemap and every canonical tag are
built from, so a wrong value produces signing links that go nowhere.

### The secret

```
SUPABASE_SERVICE_ROLE_KEY=<paste it>
```

Get it from
https://supabase.com/dashboard/project/zejpartpcjkromdbtalb/settings/api-keys
under **service_role**.

**This key bypasses every row-level security policy.** It must be set as a
Vercel secret, never prefixed `NEXT_PUBLIC_`, and never pasted into chat, a
commit or a client component. Three parts of the app need it and nothing
else does:

- the public careers site (no visitor session to authorise with)
- the signing ceremony (authorises on a hashed token instead)
- inbound provider webhooks (authorise on an HMAC signature)

If it leaks, rotate it in the same dashboard page and update Vercel.

### Not needed yet

The rest of `.env.example` — WhatsApp, SendGrid, Apify, the CRM connectors,
PandaDoc — is for features that are not wired. Leave them unset.

---

## Step 3 — deploy and check

Deploy, then walk one hire end to end. This exercises the parts that matter:

1. `/signup` — create an account, confirm the email, sign in.
2. `/orgs` — create a workspace. Pick South Africa or the UK; that choice
   sets your currency, the privacy law quoted on candidate forms, and
   whether messaging defaults to WhatsApp or email.
3. `/<workspace>/jobs/new` — add a role with a summary, a description and a
   location, then publish it. Publishing refuses without those three,
   because Google drops a job listing that lacks them.
4. `/careers/<workspace>` — your public careers page. View source and
   confirm the `JobPosting` block is there.
5. Apply to your own role through the public form.
6. `/<workspace>/pipeline` — the applicant should be in the first stage.
7. `/<workspace>/envelopes/new` — attach a PDF, add yourself as signer, send.
8. Open the signing link from the email, sign, and check the audit trail on
   the envelope. That is the product.
9. `/<workspace>/settings/billing` — the envelope you just sent should show
   as one unit used.

### Worth doing on day one

- **Supabase → Authentication → URL Configuration**: set the Site URL and
  add your domain to the redirect allow-list, or email confirmation links
  will bounce back to localhost.
- **Google Search Console**: verify the domain, then paste the verification
  string into your workspace under *Careers site*.
- Submit `https://<your-domain>/sitemap.xml`. Every published role is in it.

---

## Re-running the database tests

```bash
npm run db:test
```

197 assertions against a scratch Postgres: cross-tenant read and write
refusal, envelope completion only on the last signature, audit immutability,
every graduated pricing band boundary, metering idempotency, the dual-
submission guard, unsuccessful-candidate retention, and the cross-tenant
regressions from migrations 010 and 013. Needs a local Postgres 16
on `/tmp:5433`, or set `PGHOST` and `PGPORT`.

Run it before every release. It is fast and it has already caught several
real bugs that would have shipped, including a wrong caller check inside a
SECURITY DEFINER guard that let every tenant through.

The suite runs against a local copy, so it cannot see the PostgREST layer.
Run the Supabase security advisor against the live project after every
migration as well — it is what caught migration 011 exposing three functions
to `anon`, which migration 013 closes.

---

## Known gaps

- **No payment gateway.** The meter, pricing engine and entitlement checks
  work; nothing charges a card, and nothing raises an invoice at period
  close. PayFast or Peach for ZAR, Stripe for GBP and USD.
- **No sending.** WhatsApp and email have schema, consent records and a
  queue, but no provider client, so the seven default automations are
  stored and toggleable but do not fire. Email confirmation at sign-up goes
  through Supabase Auth and does work.
- **Assistants are not wired.** All eleven are registered with their prompts
  and logging; the model call is not connected.
- **PDF flattening.** Signatures are captured, evidenced and hashed, but not
  yet burned into the PDF itself.
- **citext lives in `public`.** The Supabase advisor flags it. Moving it is
  safe in principle but touches every `citext` column, so it is deliberately
  left for a quiet moment rather than done on the way out the door.
