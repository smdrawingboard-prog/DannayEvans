-- ============================================================================
-- 015 — DEFENSIBLE ASSESSMENT SCORING
--
-- The shortlist report is the thing a client reads before spending a year's
-- salary on somebody, and the thing an unsuccessful candidate can ask to see
-- under POPIA s23. So the arithmetic behind it is not allowed to be a number
-- somebody typed.
--
--   - a scorecard's weights must sum to 100 before anything is scored on it
--   - the weighted total is derived from the scores, never supplied
--   - a score outside 1-5, a missing criterion, or a criterion that is not
--     on the scorecard is refused rather than silently averaged away
--   - a reference call cannot be recorded before the candidate has consented
--     to it in writing
--
-- Two role scorecards ship with the platform. They are starting points, not
-- doctrine: weights are agreed with the client at search initiation, which is
-- what stops the argument at shortlist presentation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A scorecard is usable when its weights sum to 100 and its keys are unique
-- ---------------------------------------------------------------------------

/**
 * True when a criteria array can actually be scored against. An empty array
 * is a draft, not a usable scorecard, so this returns false for it.
 */
create or replace function scorecard_criteria_valid(p_criteria jsonb)
returns boolean language sql immutable parallel safe
set search_path = pg_catalog, public as $$
  select p_criteria is not null
     and jsonb_typeof(p_criteria) = 'array'
     and jsonb_array_length(p_criteria) > 0
     -- every entry names itself and carries a positive numeric weight
     and not exists (
       select 1 from jsonb_array_elements(p_criteria) e
        where coalesce(e->>'key', '') = ''
           or coalesce(e->>'label', '') = ''
           or jsonb_typeof(e->'weight') is distinct from 'number'
           or (e->>'weight')::numeric <= 0
     )
     -- no duplicate keys, or one criterion would silently overwrite another
     and (select count(distinct e->>'key') from jsonb_array_elements(p_criteria) e)
         = jsonb_array_length(p_criteria)
     -- and they add up
     and (select sum((e->>'weight')::numeric) from jsonb_array_elements(p_criteria) e)
         = 100;
$$;

comment on function scorecard_criteria_valid is
  'A scorecard whose weights do not sum to 100 produces a total nobody can '
  'defend. Drafts (empty criteria) are allowed; scoring against them is not.';

-- A draft may be empty. Anything else has to be coherent.
alter table scorecards
  add constraint scorecards_criteria_coherent
  check (criteria = '[]'::jsonb or scorecard_criteria_valid(criteria));

-- ---------------------------------------------------------------------------
-- The weighted total is computed, not accepted
-- ---------------------------------------------------------------------------
alter table assessments
  add column if not exists shortlisted    boolean not null default false,
  add column if not exists shortlist_rank int check (shortlist_rank > 0),
  add column if not exists report_path    text,
  add column if not exists submitted_at   timestamptz;

comment on column assessments.weighted_total is
  'Derived: sum(score x weight) across the scorecard, 100-500. Never supplied.';

/**
 * Recompute the weighted total from the scores and the scorecard behind them,
 * refusing anything that would make the number meaningless.
 */
create or replace function compute_assessment_total()
returns trigger language plpgsql set search_path = public as $$
declare
  v_criteria jsonb;
  v_total    numeric(6,2) := 0;
  c          record;
  v_score    jsonb;
  v_keys     text[];
  v_extra    text[];
  v_complete boolean := true;
begin
  if new.scorecard_id is null then
    -- A free-form note with no scorecard behind it carries no total.
    new.weighted_total := null;
    return new;
  end if;

  select criteria into v_criteria from scorecards where id = new.scorecard_id;
  if v_criteria is null then
    raise exception 'scorecard not found';
  end if;
  if not scorecard_criteria_valid(v_criteria) then
    raise exception 'scorecard weights must sum to 100 before it can be scored against'
      using errcode = 'check_violation';
  end if;

  -- Scoring happens one criterion at a time, so a partly-filled assessment
  -- is a normal state. It just does not get a total: an incomplete
  -- assessment must never look like a finished one.
  for c in select e->>'key' as key, (e->>'weight')::numeric as weight
             from jsonb_array_elements(v_criteria) e
  loop
    v_keys := v_keys || c.key;
    v_score := new.scores -> c.key -> 'score';

    if v_score is null then
      v_complete := false;
      continue;
    end if;
    if jsonb_typeof(v_score) is distinct from 'number'
       or (v_score::text)::numeric not between 1 and 5 then
      raise exception 'score for criterion "%" must be a number from 1 to 5', c.key
        using errcode = 'check_violation';
    end if;

    v_total := v_total + ((v_score::text)::numeric * c.weight);
  end loop;

  -- A score against a criterion the scorecard does not have is a mistake
  -- worth surfacing, not rounding off.
  select array_agg(k) into v_extra
    from jsonb_object_keys(new.scores) k
   where k <> all (v_keys);
  if v_extra is not null then
    raise exception 'scores given for criteria not on this scorecard: %',
      array_to_string(v_extra, ', ') using errcode = 'check_violation';
  end if;

  -- An assessment cannot be submitted half-scored. This is the gate the
  -- shortlist report depends on.
  if not v_complete then
    if new.submitted_at is not null then
      raise exception 'every criterion must be scored before the assessment is submitted'
        using errcode = 'check_violation';
    end if;
    new.weighted_total := null;
    return new;
  end if;

  new.weighted_total := v_total;
  return new;
end;
$$;

-- Fires on every write, not just on `scores`. A trigger scoped to the score
-- columns leaves weighted_total writable directly through the API, which
-- would let anyone set their own total.
create trigger t_compute_assessment_total
  before insert or update on assessments
  for each row execute function compute_assessment_total();

/**
 * Keep the application's headline score in step with its assessments, as a
 * percentage, because the pipeline shows 0-100 and the scorecard runs to 500.
 *
 * Averaged across assessors rather than taking the best of them: one
 * enthusiastic scorer should not carry a candidate onto a client's shortlist.
 */
create or replace function sync_application_score()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update applications a
     set score = (select round(avg(x.weighted_total) / 5, 2)
                    from assessments x
                   where x.application_id = a.id
                     and x.weighted_total is not null),
         updated_at = now()
   where a.id = new.application_id;
  return new;
end;
$$;

create trigger t_sync_application_score
  after insert or update on assessments
  for each row execute function sync_application_score();

-- ---------------------------------------------------------------------------
-- Reference checks, gated on consent
--
-- A reference call discloses that someone is job-hunting, to their current or
-- former employer. Under POPIA that needs the candidate's consent first, and
-- the skill's own protocol says the same. So the gate is a constraint.
-- ---------------------------------------------------------------------------
create table reference_checks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  candidate_id   uuid not null references candidates(id) on delete cascade,
  application_id uuid references applications(id) on delete set null,

  referee_name     text not null,
  referee_title    text,
  referee_company  text,
  referee_email    citext,
  referee_phone    text,
  -- At least one referee must have managed the candidate.
  relationship     text not null check (relationship in
                     ('line_manager','board_member','peer','direct_report','client','other')),

  -- Written references are unverifiable, so the method is recorded.
  method       text not null default 'phone' check (method in ('phone','video','written')),
  conducted_at timestamptz,
  conducted_by uuid references profiles(id),
  -- [{ question, answer }]
  responses    jsonb not null default '[]'::jsonb,
  would_rehire boolean,
  summary      text,
  outcome      text check (outcome in ('positive','mixed','negative','unreachable')),
  created_at   timestamptz not null default now(),

  constraint reference_conducted_needs_conductor
    check (conducted_at is null or conducted_by is not null)
);
create index on reference_checks (org_id, candidate_id);
create index on reference_checks (org_id, application_id);

/**
 * Refuse to record a completed reference call for a candidate who has not
 * consented. Recording the referee before the call is fine; making it is not.
 */
create or replace function reference_requires_consent()
returns trigger language plpgsql set search_path = public as $$
declare v_consent boolean;
begin
  if new.conducted_at is null then return new; end if;

  select consent_given into v_consent from candidates where id = new.candidate_id;
  if not coalesce(v_consent, false) then
    raise exception
      'the candidate has not consented to reference checks; send the consent first'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger t_reference_requires_consent
  before insert or update of conducted_at on reference_checks
  for each row execute function reference_requires_consent();

alter table reference_checks enable row level security;
create policy reference_checks_member on reference_checks for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));
grant select, insert, update, delete on reference_checks to authenticated;

grant execute on function scorecard_criteria_valid(jsonb) to authenticated;
revoke execute on function compute_assessment_total()   from public, anon, authenticated;
revoke execute on function sync_application_score()     from public, anon, authenticated;
revoke execute on function reference_requires_consent() from public, anon, authenticated;
