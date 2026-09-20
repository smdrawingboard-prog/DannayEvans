-- ============================================================================
-- 004 — RECRUITMENT VERTICAL
--
-- Sits on top of the platform core and consumes the Sealed engine for
-- anything that needs a signature (terms of business, offer letters,
-- contracts, candidate consent).
--
-- Built for small and medium businesses, so pipeline stages are configurable
-- per organisation rather than hard-coded: an eight-person agency and a
-- 200-person employer do not share a hiring process.
-- ============================================================================

create type employment_type as enum
  ('permanent', 'contract', 'temporary', 'fixed_term', 'internship', 'part_time');
create type mandate_type as enum ('retained', 'contingency', 'rpo', 'internal');
create type job_status as enum
  ('draft', 'open', 'shortlisting', 'interviewing', 'offer', 'filled', 'on_hold', 'cancelled');
create type work_model as enum ('onsite', 'hybrid', 'remote');
create type consent_basis as enum ('consent', 'legitimate_interest', 'contract', 'legal_obligation');

-- ---------------------------------------------------------------------------
-- Clients — the company doing the hiring
-- ---------------------------------------------------------------------------
create table clients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  name          text not null,
  industry      text,
  website       text,
  logo_url      text,
  contact_name  text,
  contact_email citext,
  contact_phone text,
  country       text,
  city          text,
  -- Commercials
  fee_model     mandate_type default 'contingency',
  fee_percent   numeric(5,2) check (fee_percent between 0 and 100),
  flat_fee      numeric(12,2),
  payment_terms_days int default 30,
  -- Terms of business, signed through Sealed.
  terms_envelope_id uuid references envelopes(id) on delete set null,
  terms_signed_at   timestamptz,
  owner_id      uuid references profiles(id),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on clients (org_id);

-- ---------------------------------------------------------------------------
-- Configurable pipeline stages
-- ---------------------------------------------------------------------------
create table pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  kind       text not null check (kind in ('candidate', 'deal')),
  name       text not null,
  position   int not null,
  -- Days after which a card in this stage is flagged as stalling.
  sla_days   int default 10,
  is_won     boolean not null default false,
  is_lost    boolean not null default false,
  probability_pct int check (probability_pct between 0 and 100),
  colour     text,
  unique (org_id, kind, position)
);
create index on pipeline_stages (org_id, kind, position);

-- Seed a sensible default pipeline for a new organisation.
create or replace function seed_default_pipeline(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into pipeline_stages (org_id, kind, name, position, sla_days) values
    (p_org, 'candidate', 'Applied',            1,  3),
    (p_org, 'candidate', 'Screening',          2,  5),
    (p_org, 'candidate', 'Interview',          3,  7),
    (p_org, 'candidate', 'Client Interview',   4, 10),
    (p_org, 'candidate', 'Reference Check',    5,  5),
    (p_org, 'candidate', 'Offer',              6,  5),
    (p_org, 'candidate', 'Placed',             7, null),
    (p_org, 'candidate', 'Rejected',           8, null)
  on conflict do nothing;

  insert into pipeline_stages (org_id, kind, name, position, sla_days, probability_pct, is_won, is_lost) values
    (p_org, 'deal', 'Lead',          1,  7,  10, false, false),
    (p_org, 'deal', 'Contacted',     2,  7,  20, false, false),
    (p_org, 'deal', 'Discovery',     3, 10,  40, false, false),
    (p_org, 'deal', 'Proposal Sent', 4, 10,  60, false, false),
    (p_org, 'deal', 'Negotiation',   5, 14,  80, false, false),
    (p_org, 'deal', 'Signed',        6, null,100, true,  false),
    (p_org, 'deal', 'Lost',          7, null,  0, false, true)
  on conflict do nothing;

  update pipeline_stages set is_won = true  where org_id = p_org and kind = 'candidate' and name = 'Placed';
  update pipeline_stages set is_lost = true where org_id = p_org and kind = 'candidate' and name = 'Rejected';
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs / mandates. Doubles as the source for the public careers microsite,
-- so SEO fields live here rather than in a separate CMS.
-- ---------------------------------------------------------------------------
create table jobs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  client_id      uuid references clients(id) on delete set null,
  reference      text,
  title          text not null,
  slug           citext not null,
  department     text,
  seniority      text,
  employment_type employment_type not null default 'permanent',
  mandate        mandate_type not null default 'contingency',
  work_model     work_model not null default 'onsite',
  status         job_status not null default 'draft',

  country        text,
  city           text,
  -- Pay transparency is a ranking and conversion factor, and is mandatory in
  -- a growing number of jurisdictions.
  salary_min     numeric(12,2),
  salary_max     numeric(12,2),
  salary_currency char(3),
  salary_period  text default 'year' check (salary_period in ('hour','day','month','year')),
  salary_public  boolean not null default false,

  summary        text,
  description_md text,
  requirements   text[],
  benefits       text[],

  -- Employer branding, produced by the employer-branding-jd assistant.
  evp_statement  text,

  -- SEO / AEO. `structured_data` is emitted as schema.org JobPosting, which is
  -- what Google Jobs and the AI answer engines actually read.
  meta_title       text check (char_length(meta_title) <= 60),
  meta_description text check (char_length(meta_description) <= 160),
  primary_keyword  text,
  secondary_keywords text[],
  structured_data  jsonb,
  published_at     timestamptz,
  closes_at        timestamptz,

  owner_id       uuid references profiles(id),
  openings       int not null default 1 check (openings > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, slug)
);
create index on jobs (org_id, status);
create index on jobs (org_id, published_at desc) where status = 'open';

-- ---------------------------------------------------------------------------
-- Candidates. Privacy obligations are first-class columns, not an afterthought:
-- POPIA (South Africa) and UK/EU GDPR both require a recorded lawful basis,
-- a retention horizon and a working erasure path.
-- ---------------------------------------------------------------------------
create table candidates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  full_name       text not null,
  email           citext,
  phone           text,
  whatsapp        text,
  linkedin_url    text,
  nationality     text,
  country         text,
  city            text,

  current_title   text,
  current_company text,
  years_experience int,
  target_title    text,
  target_countries text[],
  salary_expectation numeric(12,2),
  salary_currency char(3),
  notice_period_days int,
  skills          text[],
  languages       text[],

  source          text,
  owner_id        uuid references profiles(id),

  -- Privacy
  lawful_basis    consent_basis not null default 'consent',
  consent_given   boolean not null default false,
  consent_at      timestamptz,
  consent_evidence_envelope_id uuid references envelopes(id) on delete set null,
  retain_until    date,
  erasure_requested_at timestamptz,
  anonymised_at   timestamptz,

  right_to_work_checked boolean not null default false,
  right_to_work_note    text,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on candidates (org_id);
create index on candidates (org_id, owner_id);
create unique index on candidates (org_id, email) where email is not null and anonymised_at is null;
-- Full-text search over the fields recruiters actually search on.
-- Wrapped in an IMMUTABLE function because an index expression may not call
-- a merely STABLE one, and both to_tsvector(text, text) and array_to_string
-- are STABLE. Pinning the config to 'simple'::regconfig and joining the array
-- by hand makes the whole expression immutable.
create or replace function candidate_search_text(
  p_full_name text, p_title text, p_company text, p_city text, p_skills text[]
) returns tsvector
language sql immutable parallel safe as $$
  select to_tsvector('simple'::regconfig,
    coalesce(p_full_name, '') || ' ' ||
    coalesce(p_title, '')     || ' ' ||
    coalesce(p_company, '')   || ' ' ||
    coalesce(p_city, '')      || ' ' ||
    coalesce((select string_agg(s, ' ') from unnest(p_skills) as s), ''))
$$;

create index candidates_search_idx on candidates using gin (
  candidate_search_text(full_name, current_title, current_company, city, skills)
);

-- ---------------------------------------------------------------------------
-- Applications — a candidate against a job. This, not the candidate, carries
-- the pipeline stage, so one person can run in several processes at once.
-- ---------------------------------------------------------------------------
create table applications (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  job_id         uuid not null references jobs(id) on delete cascade,
  candidate_id   uuid not null references candidates(id) on delete cascade,
  stage_id       uuid references pipeline_stages(id) on delete set null,
  stage_entered_at timestamptz not null default now(),
  rating         int check (rating between 1 and 5),
  score          numeric(5,2),           -- from the scorecard, 0-100
  rejection_reason text,
  applied_via    text,                   -- 'careers_site' | 'sourced' | 'referral' | ...
  owner_id       uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index on applications (org_id, stage_id);
create index on applications (job_id, stage_id);

-- Stage movements, used for time-to-hire and conversion analytics.
create table application_stage_history (
  id            bigserial primary key,
  org_id        uuid not null references organisations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id) on delete set null,
  to_stage_id   uuid references pipeline_stages(id) on delete set null,
  moved_by      uuid references profiles(id),
  days_in_previous numeric(8,2),
  moved_at      timestamptz not null default now()
);
create index on application_stage_history (application_id, moved_at);

create or replace function record_stage_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.stage_id is distinct from new.stage_id then
    insert into application_stage_history
      (org_id, application_id, from_stage_id, to_stage_id, moved_by, days_in_previous)
    values (
      new.org_id, new.id, old.stage_id, new.stage_id, auth.uid(),
      extract(epoch from (now() - old.stage_entered_at)) / 86400.0
    );
    new.stage_entered_at = now();
  end if;
  return new;
end;
$$;
create trigger t_application_stage before update on applications
  for each row execute function record_stage_move();

-- ---------------------------------------------------------------------------
-- Structured assessment (weighted scorecards)
-- ---------------------------------------------------------------------------
create table scorecards (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  job_id     uuid references jobs(id) on delete cascade,
  name       text not null,
  -- [{ key, label, weight, guidance }] — weights are validated to sum to 100.
  criteria   jsonb not null default '[]'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table assessments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  scorecard_id   uuid references scorecards(id) on delete set null,
  assessor_id    uuid references profiles(id),
  -- { criterion_key: { score: 1-5, evidence: text } }
  scores         jsonb not null default '{}'::jsonb,
  weighted_total numeric(5,2),
  recommendation text check (recommendation in ('strong_yes','yes','maybe','no','strong_no')),
  summary        text,
  created_at     timestamptz not null default now(),
  unique (application_id, assessor_id, scorecard_id)
);
create index on assessments (org_id, application_id);

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------
create table interviews (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  round          int not null default 1,
  scheduled_at   timestamptz,
  duration_min   int default 45,
  mode           text check (mode in ('in_person','video','phone')),
  location       text,
  meeting_url    text,
  interviewers   text[],
  agenda         text,
  -- Generated by the interview-prep assistant and shared with the candidate.
  prep_pack_md   text,
  outcome        text check (outcome in ('pending','progress','hold','reject')),
  feedback       text,
  created_at     timestamptz not null default now()
);
create index on interviews (org_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Placements and the first 90 days
-- ---------------------------------------------------------------------------
create table placements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  application_id uuid not null unique references applications(id) on delete cascade,
  client_id      uuid references clients(id) on delete set null,
  start_date     date,
  salary         numeric(12,2),
  salary_currency char(3),
  fee_amount     numeric(12,2),
  fee_invoiced_at date,
  fee_paid_at    date,
  guarantee_until date,
  -- Offer letter and contract, both signed through Sealed.
  offer_envelope_id    uuid references envelopes(id) on delete set null,
  contract_envelope_id uuid references envelopes(id) on delete set null,
  onboarding_plan_md   text,
  relocation_required  boolean not null default false,
  created_at     timestamptz not null default now()
);

create table onboarding_checkins (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  placement_id uuid not null references placements(id) on delete cascade,
  day_offset   int not null,          -- 7, 30, 60, 90
  due_on       date not null,
  channel      text not null default 'whatsapp' check (channel in ('whatsapp','email','call')),
  sent_at      timestamptz,
  response     text,
  sentiment    text check (sentiment in ('positive','neutral','at_risk')),
  unique (placement_id, day_offset)
);

-- ---------------------------------------------------------------------------
-- Business development pipeline
-- ---------------------------------------------------------------------------
create table deals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  client_id      uuid references clients(id) on delete set null,
  company_name   text not null,
  contact_name   text,
  contact_email  citext,
  contact_phone  text,
  contact_linkedin text,
  role_to_fill   text,
  mandate        mandate_type not null default 'contingency',
  value          numeric(12,2),
  currency       char(3),
  stage_id       uuid references pipeline_stages(id) on delete set null,
  stage_entered_at timestamptz not null default now(),
  probability_pct int check (probability_pct between 0 and 100),
  expected_close date,
  closed_at      date,
  outcome        text check (outcome in ('won','lost')),
  lost_reason    text,
  source         text,
  owner_id       uuid references profiles(id),
  -- Proposal / terms of business sent for signature.
  proposal_envelope_id uuid references envelopes(id) on delete set null,
  -- External CRM mirrors
  external_refs  jsonb not null default '{}'::jsonb,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on deals (org_id, stage_id);
create index on deals (org_id, owner_id);

-- ---------------------------------------------------------------------------
-- Sourcing / talent mapping
-- ---------------------------------------------------------------------------
create table talent_maps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  job_id        uuid references jobs(id) on delete set null,
  name          text not null,
  target_titles text[],
  target_companies text[],
  geographies   text[],
  boolean_string text,
  -- Raw sourced rows land here for review before anyone writes to `candidates`.
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table sourced_leads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  talent_map_id uuid references talent_maps(id) on delete cascade,
  full_name     text,
  title         text,
  company       text,
  location      text,
  linkedin_url  text,
  email         citext,
  raw           jsonb not null default '{}'::jsonb,
  provider      text,                 -- 'apify' | 'linkedin' | 'manual' | ...
  status        text not null default 'new'
                  check (status in ('new','approved','rejected','duplicate','converted')),
  candidate_id  uuid references candidates(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on sourced_leads (org_id, status);

-- ---------------------------------------------------------------------------
-- Global mobility briefings
-- ---------------------------------------------------------------------------
create table mobility_briefings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  candidate_id    uuid references candidates(id) on delete cascade,
  placement_id    uuid references placements(id) on delete set null,
  from_country    text,
  to_country      text,
  visa_route      text,
  sponsorship_required boolean,
  timeline_md     text,
  tax_note_md     text,
  -- Cross-border transfer of personal data needs a recorded safeguard:
  -- POPIA s72 for South Africa, SCCs or adequacy for UK/EU.
  transfer_mechanism text,
  briefing_md     text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- General document library (CVs, references, right-to-work evidence).
-- Anything needing a signature is promoted into an envelope.
-- ---------------------------------------------------------------------------
create table documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  file_name     text not null,
  mime_type     text not null,
  document_type text not null,
  storage_path  text not null,
  size_bytes    bigint,
  subject_type  text not null check (subject_type in ('candidate','client','job','deal','placement','application')),
  subject_id    uuid not null,
  envelope_id   uuid references envelopes(id) on delete set null,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index on documents (org_id, subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger t_clients_touch      before update on clients      for each row execute function touch_updated_at();
create trigger t_jobs_touch         before update on jobs         for each row execute function touch_updated_at();
create trigger t_candidates_touch   before update on candidates   for each row execute function touch_updated_at();
create trigger t_applications_touch before update on applications for each row execute function touch_updated_at();
create trigger t_deals_touch        before update on deals        for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — one membership-scoped policy per table.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'clients','pipeline_stages','jobs','candidates','applications',
    'application_stage_history','scorecards','assessments','interviews',
    'placements','onboarding_checkins','deals','talent_maps','sourced_leads',
    'mobility_briefings','documents'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (org_id in (select current_org_ids()))
         with check (org_id in (select current_org_ids()))',
      t || '_member', t);
  end loop;
end $$;
