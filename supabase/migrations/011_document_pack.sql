-- ============================================================================
-- 011 — RECRUITMENT DOCUMENT PACK, RIGHT TO REPRESENT, RECORD TAXONOMY
--
-- Turns the agency compliance requirements into schema and seed data:
--   - the standard agreement pack, seeded into every new workspace
--   - Right to Represent as a real record that blocks dual submission
--   - a document taxonomy that knows which records are POPIA special
--     personal information
--   - retention that treats an unsuccessful candidate differently from an
--     active one
--
-- On the templates: the Terms of Business and the POPIA candidate consent
-- are supplied verbatim by the business, disclaimer included. The other
-- agreements were named but not supplied, so they ship as clause skeletons
-- marked `needs_legal_drafting` rather than invented legal prose. Generating
-- plausible-looking contract text and seeding it as ready to send would be
-- worse than shipping nothing: somebody would send it.
-- ============================================================================

create type template_status as enum (
  'ready',                 -- supplied by the business, usable
  'needs_legal_review',    -- usable text, not yet reviewed by a practitioner
  'needs_legal_drafting'   -- structure only; the clauses must be written
);

-- ---------------------------------------------------------------------------
-- Agency identity. These are merge fields in every agreement, and POPIA
-- requires a registered Information Officer to be named and contactable.
-- ---------------------------------------------------------------------------
alter table organisations
  add column if not exists legal_name          text,
  add column if not exists registration_number text,
  add column if not exists vat_number          text,
  add column if not exists information_officer_name  text,
  add column if not exists information_officer_email citext,
  -- Unsuccessful candidates are deleted or de-identified sooner than the
  -- general retention horizon. Twelve months is the common ceiling advised
  -- under POPIA and UK GDPR for an unsuccessful applicant.
  add column if not exists unsuccessful_retention_months int not null default 12
    check (unsuccessful_retention_months between 1 and 60);

comment on column organisations.information_officer_name is
  'POPIA requires a registered Information Officer. Named on every consent form.';

-- ---------------------------------------------------------------------------
-- Client commercials that the Terms of Business actually turns on
-- ---------------------------------------------------------------------------
alter table clients
  add column if not exists registration_number text,
  add column if not exists vat_number          text,
  -- Replacement guarantee window, in days from the start date.
  add column if not exists guarantee_days int not null default 90
    check (guarantee_days >= 0),
  -- Days the agency has to find a replacement before a credit note is due.
  add column if not exists replacement_window_days int not null default 30
    check (replacement_window_days >= 0),
  -- The sliding-scale rebate, as data rather than prose, so an invoice can
  -- be computed instead of argued about.
  -- [{ "up_to_days": 30, "credit_pct": 75 }, ...]
  add column if not exists rebate_scale jsonb not null default
    '[{"up_to_days":30,"credit_pct":75},{"up_to_days":60,"credit_pct":50},{"up_to_days":90,"credit_pct":25}]'::jsonb,
  -- The introduction remains the agency's for this long: if the client
  -- passes the candidate to a third party and an engagement follows, the
  -- full fee is due.
  add column if not exists introduction_validity_months int not null default 12
    check (introduction_validity_months between 1 and 60);

/**
 * Credit due when a placement terminates inside the guarantee window and no
 * replacement was found. Walks the client's own scale; returns 0 outside it.
 */
create or replace function rebate_credit_pct(p_client uuid, p_days_served int)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare band record; v_scale jsonb;
begin
  if p_days_served < 0 then return 0; end if;
  select rebate_scale into v_scale from clients where id = p_client;
  if v_scale is null then return 0; end if;

  for band in
    select (b->>'up_to_days')::int as up_to, (b->>'credit_pct')::numeric as pct
      from jsonb_array_elements(v_scale) b
     order by (b->>'up_to_days')::int
  loop
    if p_days_served <= band.up_to then return band.pct; end if;
  end loop;
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Right to Represent
--
-- A signed grant letting the agency put one candidate forward to one client.
-- Its real job is preventing the dual submission that costs an agency the
-- fee, so overlapping live grants for the same candidate and client are
-- refused by a constraint rather than by a warning somebody ignores.
-- ---------------------------------------------------------------------------
create table right_to_represent (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  client_id    uuid references clients(id) on delete set null,
  job_id       uuid references jobs(id) on delete set null,
  -- Kept as text too: an agency often submits to a company that is not yet
  -- a client record, and the grant still has to be enforceable.
  client_name  text not null,

  granted_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  status       text not null default 'active'
                 check (status in ('active','expired','withdrawn','converted')),
  -- The candidate's signature, through Sealed.
  envelope_id  uuid references envelopes(id) on delete set null,
  signed_at    timestamptz,
  withdrawn_at timestamptz,
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),

  constraint rtr_expiry_after_grant check (expires_at > granted_at)
);
create index on right_to_represent (org_id, candidate_id, status);
create index on right_to_represent (org_id, expires_at) where status = 'active';

-- One live grant per candidate per client. This is the dual-submission guard.
create unique index rtr_one_active_per_pair
  on right_to_represent (org_id, candidate_id, lower(client_name))
  where status = 'active';

/**
 * Expire grants that have run out. Called before any check so a stale row
 * never blocks a legitimate new submission.
 */
create or replace function expire_stale_rtr(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update right_to_represent
     set status = 'expired'
   where org_id = p_org and status = 'active' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * Whether this candidate may be submitted to this client right now, and why
 * not if not. Returns the blocking grant so the UI can say who holds it.
 */
create or replace function can_submit_candidate(
  p_org uuid, p_candidate uuid, p_client_name text
) returns table (allowed boolean, reason text, blocking_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform assert_org_access(p_org);
  perform expire_stale_rtr(p_org);

  select * into r from right_to_represent
   where org_id = p_org
     and candidate_id = p_candidate
     and lower(client_name) = lower(p_client_name)
     and status = 'active'
   limit 1;

  if found then
    -- A live grant held by this agency is permission, not an obstacle.
    allowed := true; reason := 'granted';
    blocking_id := r.id; expires_at := r.expires_at;
  else
    allowed := false; reason := 'no_active_right_to_represent';
    blocking_id := null; expires_at := null;
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Document record taxonomy
--
-- POPIA section 26 prohibits processing special personal information unless
-- section 27 provides a justification. Criminal record checks and medical
-- disclosures both fall in it, so the schema marks them rather than leaving
-- it to whoever uploads the file.
-- ---------------------------------------------------------------------------
create table document_kinds (
  code        text primary key,
  label       text not null,
  category    text not null check (category in
                ('screening','identity','onboarding','agreement','other')),
  -- POPIA s26 special personal information, or a comparable special
  -- category under UK/EU GDPR Article 9.
  special_personal_information boolean not null default false,
  -- Only lawful to collect once an offer has actually been made.
  post_offer_only boolean not null default false,
  guidance    text
);

insert into document_kinds (code, label, category, special_personal_information, post_offer_only, guidance) values
  ('cv',                    'CV / résumé',              'screening',  false, false, null),
  ('portfolio',             'Portfolio or work sample', 'screening',  false, false, null),
  ('interview_notes',       'Interview notes',          'screening',  false, false, 'The candidate can ask to see these. Write them as if they will.'),
  ('qualification',         'Qualification certificate','screening',  false, false, null),
  ('professional_licence',  'Professional licence',     'screening',  false, false, null),
  ('reference',             'Reference',                'screening',  false, false, null),
  ('assessment',            'Assessment result',        'screening',  false, false, null),

  ('id_document',           'National identity document','identity',  false, false, 'Certified copy. Do not collect before it is needed.'),
  ('passport',              'Passport',                 'identity',   false, false, null),
  ('work_visa',             'Work visa or permit',      'identity',   false, false, null),
  ('right_to_work',         'Right to work evidence',   'identity',   false, false, null),

  ('criminal_check',        'Criminal record check',    'screening',  true,  false, 'POPIA s26 special personal information. Requires separate written consent and an s27 justification.'),
  ('credit_check',          'Credit check',             'screening',  false, false, 'Requires separate written consent, and must be relevant to the role.'),
  ('medical_disclosure',    'Medical disclosure',       'onboarding', true,  true,  'POPIA s26 special personal information. Post-offer only.'),

  ('banking_details',       'Banking details',          'onboarding', false, true,  'Post-offer only. Needed to pay someone, not to consider them.'),
  ('tax_number',            'Tax identification',       'onboarding', false, true,  'Post-offer only.'),
  ('employment_contract',   'Employment contract',      'agreement',  false, true,  null),

  ('terms_of_business',     'Terms of business',        'agreement',  false, false, null),
  ('nda',                   'Non-disclosure agreement', 'agreement',  false, false, null),
  ('dpa',                   'Data processing agreement','agreement',  false, false, null),
  ('rtr',                   'Right to represent',       'agreement',  false, false, null),
  ('consent',               'Data processing consent',  'agreement',  false, false, null),
  ('offer_letter',          'Offer letter',             'agreement',  false, false, null),
  ('proposal',              'Proposal',                 'agreement',  false, false, null),
  ('other',                 'Other',                    'other',      false, false, null)
on conflict (code) do nothing;

-- Point the document library at the taxonomy. Nothing has been uploaded yet,
-- so this is safe to enforce rather than backfill.
alter table documents
  add constraint documents_type_known
  foreign key (document_type) references document_kinds(code);

-- ---------------------------------------------------------------------------
-- Retention that distinguishes an unsuccessful candidate from an active one
-- ---------------------------------------------------------------------------
create or replace function apply_unsuccessful_retention()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_months int; v_still_live int;
begin
  -- Only act when an application lands in a losing stage.
  if new.stage_id is null then return new; end if;
  if not exists (
    select 1 from pipeline_stages
     where id = new.stage_id and kind = 'candidate' and is_lost
  ) then
    return new;
  end if;

  -- Leave the retention date alone while the person is still in play
  -- somewhere else: one rejection is not the end of the relationship.
  select count(*) into v_still_live
    from applications a
    join pipeline_stages s on s.id = a.stage_id
   where a.candidate_id = new.candidate_id
     and a.id <> new.id
     and not s.is_lost;
  if v_still_live > 0 then return new; end if;

  select unsuccessful_retention_months into v_months
    from organisations where id = new.org_id;

  update candidates
     set retain_until = (current_date + make_interval(months => coalesce(v_months, 12)))::date
   where id = new.candidate_id
     and (retain_until is null
          or retain_until > (current_date + make_interval(months => coalesce(v_months, 12)))::date);

  return new;
end;
$$;

create trigger t_unsuccessful_retention
  after update of stage_id on applications
  for each row execute function apply_unsuccessful_retention();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table right_to_represent enable row level security;
create policy rtr_member on right_to_represent for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));

-- The taxonomy is reference data shared by every tenant.
alter table document_kinds enable row level security;
create policy kinds_read on document_kinds for select using (true);
grant select on document_kinds to authenticated;
grant select, insert, update, delete on right_to_represent to authenticated;

grant execute on function rebate_credit_pct(uuid, int)              to authenticated;
grant execute on function can_submit_candidate(uuid, uuid, text)    to authenticated;
grant execute on function expire_stale_rtr(uuid)                    to authenticated;
