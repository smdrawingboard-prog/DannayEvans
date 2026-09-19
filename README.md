# Hireframe — recruitment SaaS, built on the Sealed signature engine

Two products in one repository.

**Sealed** (`lib/signatures/`, migration `003`) is the document and signature
engine. It is provider-agnostic, keeps an append-only audit trail, and knows
nothing about recruitment.

**Hireframe** (migrations `004`–`005`, `app/[org]/`) is the recruitment
vertical built on top of it — the first market we take Sealed to. Applicant
tracking, pipelines, a public careers site, and offers that go out for
signature without leaving the record.

The split matters commercially: the recruitment product is how a small business
discovers the signature engine, and the signature engine is what makes the
recruitment product hard to leave.

---

## Running it locally

You need Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and keys
npm run dev                    # http://localhost:3000
```

Apply the migrations in order (Supabase SQL editor, or `supabase db push`):

```
supabase/migrations/002_platform_core.sql
supabase/migrations/003_sealed_engine.sql
supabase/migrations/004_recruitment_vertical.sql
supabase/migrations/005_comms_automation_seo.sql
supabase/migrations/006_storage.sql
supabase/migrations/007_grants.sql
```

`001` is the old single-tenant schema and now lives in `legacy-vite-crm/`.
It is not part of this application.

### Checking the database before you ship it

```bash
npm run db:test
```

This spins the migrations up on a scratch Postgres and asserts the things that
would be expensive to get wrong: that one tenant cannot read or write another
tenant's rows, that an envelope only completes when the last signer signs, and
that audit events cannot be edited or deleted. Nineteen assertions, all of
which must pass before a release.

You need a local Postgres 16 listening on `/tmp:5433`, or set `PGHOST`/`PGPORT`.

---

## How a tenant is kept separate from every other tenant

This is the part to understand before changing anything.

1. Every business table carries `org_id`.
2. A user reaches a tenant **only** through a row in `memberships`.
3. Row Level Security is on for every table, with one policy shape:
   `org_id in (select current_org_ids())`.
4. `current_org_ids()` reads `auth.uid()` and returns the organisations that
   user actually belongs to. It is `SECURITY DEFINER` so the policy on
   `memberships` cannot recurse into itself.

So the database refuses cross-tenant access even if the application asks for
it. `requireOrg(slug)` in `lib/auth.ts` is the only place a URL segment turns
into an authorised organisation, and a non-member gets the same redirect as
somebody asking for a workspace that does not exist — so the URL space cannot
be probed to discover which businesses are customers.

**Middleware is not an authorisation boundary here.** It only refreshes the
session cookie. Treating middleware as the gate is how tenants leak, because
one route the matcher misses is one route with no protection.

### The three places that bypass RLS

`lib/supabase/admin.ts` uses the service role and ignores RLS entirely. Exactly
three callers may use it, and each authorises by itself:

| Caller | How it authorises |
|---|---|
| Public careers site | Filters to one org's published, open jobs |
| Signing ceremony | Hashed access token from the signing link |
| Provider webhooks | HMAC signature over the raw request body |

Never import it into a component, and never hand it an org id that came from a
form or a URL without checking membership first.

---

## Swapping in your signature application

Everything the recruitment side does goes through one interface,
`SignatureProvider` in `lib/signatures/types.ts`: create, send, get, void,
remind, audit trail, download, parse webhook.

Two implementations ship today:

- `SealedProvider` — the built-in engine. Real, not a stub: it stores
  envelopes, recipients, fields and the audit trail in Postgres, serves the
  signing ceremony at `/sign/<token>`, and issues a completion certificate with
  a SHA-256 evidence hash. It is what makes the platform demonstrable end to
  end today.
- `PandaDocProvider` — a second implementation, kept honest against a provider
  that was not designed for this. Written against the documented API but not
  yet exercised against a live account.

To plug in yours:

```ts
// lib/signatures/your-provider.ts
export class YourProvider implements SignatureProvider {
  readonly key = 'yours'
  // ... nine methods
}

// lib/signatures/index.ts
const registry = {
  sealed: () => new SealedProvider(),
  pandadoc: () => new PandaDocProvider(),
  yours: () => new YourProvider(),   // add this
}
```

Then set `SIGNATURE_PROVIDER=yours`. No caller changes. Existing envelopes keep
working because each row records the `provider` it was created with, and
actions resolve the provider from the row rather than from the environment.

The one thing `SealedProvider` does not do is flatten signature marks into the
PDF itself — it records hashes and leaves rendering to the engine. If your
application already does that, this is the seam where it slots in.

### Why the audit trail is built the way it is

An electronic signature is only worth what you can prove about it. `ECTA 2002
s13` (South Africa), the `Electronic Communications Act 2000` (UK) and `eIDAS`
(EU) all turn on the same evidence: who signed, when, from where, and how their
identity was established.

So `envelope_events` is append-only, enforced by a trigger *and* by revoking
`UPDATE`/`DELETE` — the privilege check fails before the trigger even runs.
Consent to sign electronically is captured explicitly, because its absence is
the most common reason a signature gets challenged. The completion certificate
carries a SHA-256 over the ordered event log plus every document hash, so
recomputing it detects any later tampering.

---

## Region configuration

One column on `organisations` — `region` — drives currency, the privacy regime
quoted on candidate forms, the retention default, whether messaging is
WhatsApp-first or email-first, and the spelling. See `lib/region.ts`.

| Region | Currency | Privacy | Signature law | Default channel |
|---|---|---|---|---|
| ZA | ZAR | POPIA | ECTA 2002 s13 | WhatsApp |
| UK | GBP | UK GDPR | ECA 2000 | Email |
| EU | EUR | GDPR | eIDAS | Email |
| AE, US, AU, Global | local | local | local | Email |

Adding a market is a new entry in that file, not a hunt through components.

Privacy is schema-level, not a policy document: candidates carry a lawful
basis, a consent timestamp, a retention date, an erasure-request field and an
anonymisation timestamp. Consent wording on every public form is generated from
the tenant's region.

---

## Search and AI visibility

Built in rather than bolted on, because careers pages are the pages that earn
traffic:

- Every job page emits `schema.org/JobPosting` with `datePosted`,
  `validThrough`, `hiringOrganization`, `baseSalary` when public, and
  `directApply` — the fields Google Jobs actually requires.
- The careers site emits `Organization` and `FAQPage`.
- `sitemap.xml` includes every published role across every tenant, refreshed
  hourly.
- `robots.ts` names `GPTBot`, `OAI-SearchBot`, `PerplexityBot`, `ClaudeBot` and
  `Google-Extended` explicitly, so answer engines are opted in deliberately —
  and blocks `/sign/`, because a signing URL in a search index is a live
  credential.
- Jobs carry `meta_title`, `meta_description`, `primary_keyword` and
  `secondary_keywords` as real columns.
- Marketing and careers pages are statically rendered with no client
  JavaScript, which is what makes them survive a weak mobile connection.

Answer engines quote plainly-stated facts. That is why the FAQ blocks are
written as prose answers to questions people actually type, not as marketing
copy.

---

## The assistants

`lib/assist/registry.ts` turns each uploaded Fate Collab skill into a feature a
tenant can run against their own records. Every run is logged to `assist_runs`
with who requested it and who approved it, and anything going to a candidate or
client needs sign-off before it sends.

| Assistant | From skill | Where it lives |
|---|---|---|
| Rewrite the job advert | `employer-branding-jd` | Job → Advert |
| Build a search strategy | `executive-search-talent-mapping` | Job → Sourcing |
| Score and shortlist | `candidate-assessment-shortlisting` | Job → Shortlist |
| Reformat the CV | `exec-cv-linkedin` | Candidate → Documents |
| Build the interview pack | `interview-prep-coaching` | Interview → Prep |
| Draft an outreach sequence | `cold-email-outreach` | Deals → Sequences |
| Global mobility briefing | `global-mobility-compliance` | Placement → Mobility |
| 90-day onboarding plan | `candidate-onboarding-90days` | Placement → Onboarding |
| Generate the proposal | `client-proposal` | Deal → Proposal |
| Promote the role | `social-media-content` | Job → Promote |
| Audit careers visibility | `seo-audit` | Careers site → Visibility |

Every workspace is also created with seven automations already running
(`seed_default_automations`) — acknowledge applications, nudge stalled
candidates, send the offer pack at the Offer stage, start 90-day check-ins when
a contract is signed, chase unsigned documents, publish new roles, and send a
weekly digest.

---

## What is built and what is not

**Working end to end**

- Multi-tenant schema with RLS, verified by 19 assertions
- Sign-up, workspace creation, membership and roles
- The Sealed engine: create, send, sequential signing, decline, void, remind,
  audit trail, completion certificate
- The signing ceremony at `/sign/<token>`, including access codes, consent
  capture and IP/user-agent evidence
- Envelope list and the audit-trail view
- Public careers site and job pages with structured data
- Public applications, which create the candidate, the application and the
  consent record
- Dashboard with stalling detection against each stage's own SLA

**Scaffolded, needs the remaining screens**

- Jobs, candidates, pipeline board, deals, settings — the schema, RLS and
  navigation are in place; the CRUD screens are not yet written
- Assistant runner: the registry and prompts are written, the model call is not
  wired
- WhatsApp and email sending: schema, consent model and queue exist; the Meta
  Cloud API and SendGrid clients are not written
- PDF flattening and the rendered certificate document
- Billing

**Blocked on you**

- Supabase MCP needs authorising in an interactive session before I can create
  the project and push migrations from here.

---

## A note on the old app

`legacy-vite-crm/` holds the previous single-tenant Vite CRM. It is kept for
reference and is excluded from the TypeScript build. Its secrets were exposed
through `VITE_`-prefixed variables, which ship to the browser — that is the main
reason this rebuild moved every integration server-side.
