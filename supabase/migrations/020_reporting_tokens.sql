-- ============================================================================
-- 020 — READ-ONLY REPORT ACCESS FOR SPREADSHEETS
--
-- A Google Sheet cannot hold a session. It authenticates with whatever string
-- is pasted into the script, and anyone with edit access to the sheet can read
-- that string. So the obvious approach — put the service-role key in the
-- script — is the worst one available: that key bypasses row level security
-- entirely, and a shared sheet would hand every tenant's data to whoever it
-- was shared with.
--
-- Instead a report token is its own credential:
--   - scoped to one organisation and to named reports
--   - stored as a SHA-256 hash, so the table is not a list of live keys
--   - expiring, revocable, and with every use recorded
--   - read-only by construction: the only function it can reach returns rows
--
-- `report_rows` is deliberately callable by `anon`, because the caller has no
-- session. The token IS the authentication. This is the one place in the
-- schema where that is true, and it is why the token is scoped and hashed.
-- ============================================================================

create table report_tokens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  -- The token itself is never stored. Only its hash.
  token_hash  text not null unique,
  -- Which reports this token may read. A billing token has no business
  -- reading candidates.
  scopes      text[] not null default '{}',
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  last_used_at timestamptz,
  use_count   int not null default 0,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),

  constraint report_token_expiry_future check (expires_at > created_at),
  constraint report_token_has_scopes check (array_length(scopes, 1) >= 1)
);
create index on report_tokens (org_id) where revoked_at is null;

comment on table report_tokens is
  'Read-only credentials for spreadsheet exports. Hashed, scoped, expiring.';

-- Every export is recorded. A spreadsheet that quietly pulls the candidate
-- list every hour for a year is something the agency should be able to see.
create table report_exports (
  id         bigserial primary key,
  org_id     uuid not null references organisations(id) on delete cascade,
  token_id   uuid references report_tokens(id) on delete set null,
  report     text not null,
  row_count  int,
  created_at timestamptz not null default now()
);
create index on report_exports (org_id, created_at desc);

alter table report_tokens enable row level security;
alter table report_exports enable row level security;

create policy report_tokens_admin on report_tokens for all
  using (org_id in (select current_org_ids()) and is_org_admin(org_id))
  with check (org_id in (select current_org_ids()) and is_org_admin(org_id));

create policy report_exports_member on report_exports for select
  using (org_id in (select current_org_ids()));

grant select, update on report_tokens to authenticated;
grant select on report_exports to authenticated;
-- Tokens are minted by the function below, which is the only thing that knows
-- how to hash one. Inserting a row by hand would mean inventing the hash.
revoke insert on report_tokens from authenticated;

-- ---------------------------------------------------------------------------
-- Minting and revoking
-- ---------------------------------------------------------------------------
create or replace function hash_report_token(p_token text)
returns text language sql immutable
set search_path = pg_catalog, public, extensions as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

/**
 * Mint a token. Returns the plaintext exactly once — it is not recoverable
 * afterwards, because only its hash is kept.
 */
create or replace function create_report_token(
  p_org uuid, p_name text, p_scopes text[], p_days int default 90
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text;
  v_bad   text[];
begin
  perform assert_org_access(p_org);
  if not is_org_admin(p_org) then
    raise exception 'only an owner or admin can create a report token'
      using errcode = 'insufficient_privilege';
  end if;

  if p_days < 1 or p_days > 365 then
    raise exception 'a report token lasts between 1 and 365 days'
      using errcode = 'check_violation';
  end if;

  select array_agg(s) into v_bad
    from unnest(p_scopes) s
   where s <> all (array['shortlist','pipeline','placements','candidates','clients','billing']);
  if v_bad is not null then
    raise exception 'unknown report scope: %', array_to_string(v_bad, ', ')
      using errcode = 'check_violation';
  end if;

  -- 32 bytes of entropy, url-safe so it survives being pasted anywhere.
  v_token := replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_');
  v_token := 'hfr_' || rtrim(v_token, '=');

  insert into report_tokens (org_id, name, token_hash, scopes, expires_at, created_by)
  values (p_org, p_name, hash_report_token(v_token), p_scopes,
          now() + make_interval(days => p_days), auth.uid());

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- The reports
--
-- Each returns jsonb rows. Candidate reports carry no identity numbers, no
-- special personal information and no document contents: a spreadsheet is a
-- file that gets forwarded, and POPIA s19 asks for the security of the
-- processing to suit the sensitivity of the data.
-- ---------------------------------------------------------------------------
create or replace function report_shortlist(p_org uuid, p_job uuid default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r order by r->>'weighted_total' desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'candidate',      c.full_name,
      'current_title',  c.current_title,
      'current_company',c.current_company,
      'role',           j.title,
      'client',         cl.name,
      'stage',          ps.name,
      'weighted_total', a.weighted_total,
      'out_of',         500,
      'percent',        app.score,
      'recommendation', a.recommendation,
      'shortlisted',    a.shortlisted,
      'assessor',       pr.full_name,
      'submitted_at',   a.submitted_at,
      'summary',        a.summary
    ) as r
    from assessments a
    join applications app on app.id = a.application_id
    join candidates c on c.id = app.candidate_id
    join jobs j on j.id = app.job_id
    left join clients cl on cl.id = j.client_id
    left join pipeline_stages ps on ps.id = app.stage_id
    left join profiles pr on pr.id = a.assessor_id
   where a.org_id = p_org
     and a.submitted_at is not null
     and (p_job is null or app.job_id = p_job)
     and c.anonymised_at is null
  ) s;
$$;

create or replace function report_pipeline(p_org uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r order by r->>'position'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'position',        ps.position,
      'stage',           ps.name,
      'candidates',      count(app.id),
      'target_days',     ps.sla_days,
      'median_days',     round(percentile_cont(0.5) within group (
                           order by extract(epoch from now() - app.stage_entered_at) / 86400
                         )::numeric, 1),
      'oldest_days',     round(max(extract(epoch from now() - app.stage_entered_at) / 86400)::numeric, 1),
      'past_target',     count(*) filter (
                           where ps.sla_days is not null
                             and app.stage_entered_at < now() - make_interval(days => ps.sla_days)
                         )
    ) as r
    from pipeline_stages ps
    left join applications app
      on app.stage_id = ps.id and app.org_id = p_org
   where ps.org_id = p_org and ps.kind = 'candidate'
   group by ps.position, ps.name, ps.sla_days
  ) s;
$$;

create or replace function report_placements(p_org uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r order by r->>'start_date' desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'candidate',     c.full_name,
      'role',          j.title,
      'client',        cl.name,
      'start_date',    pl.start_date,
      'salary',        pl.salary,
      'currency',      pl.salary_currency,
      'fee',           pl.fee_amount,
      'fee_invoiced',  pl.fee_invoiced_at,
      'fee_paid',      pl.fee_paid_at,
      'guarantee_until', pl.guarantee_until,
      'in_guarantee',  pl.guarantee_until > current_date,
      -- Time to fill, measured from when the role opened to the start date.
      'days_to_fill',  case
                         when pl.start_date is not null and j.published_at is not null
                         then (pl.start_date - j.published_at::date)
                       end,
      'international', pl.international_placement,
      'destination',   pl.destination_country,
      'checkins_outstanding', (
        select count(*) from onboarding_checkins oc
         where oc.placement_id = pl.id and oc.sent_at is null
      )
    ) as r
    from placements pl
    join applications app on app.id = pl.application_id
    join candidates c on c.id = app.candidate_id
    join jobs j on j.id = app.job_id
    left join clients cl on cl.id = pl.client_id
   where pl.org_id = p_org and c.anonymised_at is null
  ) s;
$$;

/**
 * Candidates, deliberately without identity numbers, date of birth, or any
 * reference to special personal information. A spreadsheet is a file that
 * gets forwarded; this is the subset that is safe to forward.
 */
create or replace function report_candidates(p_org uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r order by r->>'full_name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'full_name',       c.full_name,
      'email',           c.email,
      'current_title',   c.current_title,
      'current_company', c.current_company,
      'city',            c.city,
      'country',         c.country,
      'years_experience',c.years_experience,
      'skills',          array_to_string(c.skills, ', '),
      'source',          c.source,
      'consent_given',   c.consent_given,
      'retain_until',    c.retain_until,
      'owner',           pr.full_name,
      'added',           c.created_at::date,
      'open_applications', (
        select count(*) from applications a
          join pipeline_stages s on s.id = a.stage_id
         where a.candidate_id = c.id and not s.is_lost
      )
    ) as r
    from candidates c
    left join profiles pr on pr.id = c.owner_id
   where c.org_id = p_org
     and c.anonymised_at is null
     and c.erasure_requested_at is null
  ) s;
$$;

create or replace function report_clients(p_org uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r order by r->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'name',            cl.name,
      'industry',        cl.industry,
      'city',            cl.city,
      'contact',         cl.contact_name,
      'fee_model',       cl.fee_model,
      'fee_percent',     cl.fee_percent,
      'payment_terms_days', cl.payment_terms_days,
      'terms_signed',    cl.terms_signed_at is not null,
      'guarantee_days',  cl.guarantee_days,
      'open_roles',      (select count(*) from jobs j
                           where j.client_id = cl.id and j.status = 'open'),
      'placements',      (select count(*) from placements pl
                           where pl.client_id = cl.id)
    ) as r
    from clients cl
   where cl.org_id = p_org
  ) s;
$$;

create or replace function report_billing(p_org uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r order by r->>'period' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'period',    to_char(date_trunc('month', ue.occurred_at), 'YYYY-MM'),
      'event',     ue.event_type,
      'quantity',  count(*)
    ) as r
    from usage_events ue
   where ue.org_id = p_org
     and ue.occurred_at > now() - interval '12 months'
   group by date_trunc('month', ue.occurred_at), ue.event_type
  ) s;
$$;

-- ---------------------------------------------------------------------------
-- The one entry point a spreadsheet can reach
-- ---------------------------------------------------------------------------

/**
 * Return one report, for the organisation the token belongs to.
 *
 * Anon-callable on purpose: the caller is a spreadsheet with no session, and
 * the token is the credential. Everything that makes that safe is here — the
 * hash lookup, the expiry, the revocation, the scope check and the log.
 */
create or replace function report_rows(
  p_token text, p_report text, p_params jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  t    report_tokens;
  rows jsonb;
begin
  select * into t
    from report_tokens
   where token_hash = hash_report_token(coalesce(p_token, ''));

  if not found then
    raise exception 'unknown report token' using errcode = 'insufficient_privilege';
  end if;
  if t.revoked_at is not null then
    raise exception 'this report token has been revoked'
      using errcode = 'insufficient_privilege';
  end if;
  if t.expires_at <= now() then
    raise exception 'this report token expired on %', t.expires_at::date
      using errcode = 'insufficient_privilege';
  end if;
  if not (p_report = any (t.scopes)) then
    raise exception 'this token cannot read the % report', p_report
      using errcode = 'insufficient_privilege';
  end if;

  rows := case p_report
    when 'shortlist'  then report_shortlist(t.org_id,
                             nullif(p_params->>'job_id', '')::uuid)
    when 'pipeline'   then report_pipeline(t.org_id)
    when 'placements' then report_placements(t.org_id)
    when 'candidates' then report_candidates(t.org_id)
    when 'clients'    then report_clients(t.org_id)
    when 'billing'    then report_billing(t.org_id)
    else null
  end;

  if rows is null then
    raise exception 'unknown report "%"', p_report using errcode = 'check_violation';
  end if;

  update report_tokens
     set last_used_at = now(), use_count = use_count + 1
   where id = t.id;

  insert into report_exports (org_id, token_id, report, row_count)
  values (t.org_id, t.id, p_report, jsonb_array_length(rows));

  return rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'hash_report_token(text)',
    'create_report_token(uuid, text, text[], int)',
    'report_rows(text, text, jsonb)',
    'report_shortlist(uuid, uuid)',
    'report_pipeline(uuid)',
    'report_placements(uuid)',
    'report_candidates(uuid)',
    'report_clients(uuid)',
    'report_billing(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- An admin mints tokens from the settings screen.
grant execute on function create_report_token(uuid, text, text[], int) to authenticated;

-- The spreadsheet reaches exactly this, and nothing else. The individual
-- report builders stay unreachable: they take an org id and would trust it.
grant execute on function report_rows(text, text, jsonb) to anon, authenticated;
