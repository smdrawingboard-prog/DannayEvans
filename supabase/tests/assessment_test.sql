-- ============================================================================
-- Assessment scoring, the scorecard library, and the reference consent gate.
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET on

begin;

create or replace function assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAILED: %', label; end if;
  raise notice 'passed: %', label;
end $$;

create or replace function assert_eq(actual numeric, expected numeric, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED: % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'passed: % (%)', label, actual;
end $$;

insert into auth.users (id, email)
values ('aaaa0000-0000-0000-0000-00000000000a', 'assessor@test.test');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaa0000-0000-0000-0000-00000000000a';
select create_organisation('Assessment Test', 'assessment-test', 'ZA');
reset role;

\set org '(select id from organisations where slug = ''assessment-test'')'

-- ---------------------------------------------------------------------------
-- The library
-- ---------------------------------------------------------------------------
select assert((select count(*) from system_scorecards) = 2,
  'the library ships the CFO and CHRO scorecards');

select assert((select count(*) from scorecards where org_id = :org and is_system) = 2,
  'a new workspace gets its own copy of both');

-- Every library scorecard must add up. The table constraint enforces it, so
-- this asserts the constraint is actually doing something.
do $$
begin
  begin
    insert into system_scorecards (code, name, criteria)
    values ('broken', 'Does not add up',
      '[{"key":"a","label":"A","weight":60},{"key":"b","label":"B","weight":30}]'::jsonb);
    raise exception 'FAILED: a scorecard whose weights sum to 90 was accepted';
  exception when check_violation then
    raise notice 'passed: a scorecard whose weights do not sum to 100 is refused';
  end;
end $$;

do $$
begin
  begin
    insert into system_scorecards (code, name, criteria)
    values ('dupe', 'Duplicate keys',
      '[{"key":"a","label":"A","weight":50},{"key":"a","label":"A again","weight":50}]'::jsonb);
    raise exception 'FAILED: a scorecard with a duplicate criterion key was accepted';
  exception when check_violation then
    raise notice 'passed: a duplicate criterion key is refused';
  end;
end $$;

-- A draft with nothing on it yet is allowed.
insert into scorecards (id, org_id, name, criteria)
values ('5c0d0000-0000-0000-0000-000000000001', :org, 'Draft', '[]'::jsonb);
select assert(true, 'an empty scorecard is allowed as a draft');

-- ---------------------------------------------------------------------------
-- Scoring arithmetic
-- ---------------------------------------------------------------------------
insert into clients (id, org_id, name)
values ('c1000000-0000-0000-0000-000000000001', :org, 'Client Co');
insert into jobs (id, org_id, client_id, title, slug)
values ('30b00000-0000-0000-0000-000000000001', :org,
        'c1000000-0000-0000-0000-000000000001', 'Chief Financial Officer',
        'chief-financial-officer');
insert into candidates (id, org_id, full_name, email)
values ('ca000000-0000-0000-0000-000000000001', :org, 'Nomsa Dlamini', 'n@test.test');
insert into applications (id, org_id, job_id, candidate_id)
values ('a9000000-0000-0000-0000-000000000001', :org,
        '30b00000-0000-0000-0000-000000000001',
        'ca000000-0000-0000-0000-000000000001');

\set cfo '(select id from scorecards where org_id = :org and system_code = ''cfo'')'
\set app '''a9000000-0000-0000-0000-000000000001'''

-- Straight fives across a 100-weight scorecard is the maximum, 500.
insert into assessments (id, org_id, application_id, scorecard_id, scores)
select 'a5000000-0000-0000-0000-000000000001', :org, :app, :cfo,
       (select jsonb_object_agg(e->>'key', jsonb_build_object('score', 5))
          from scorecards s, jsonb_array_elements(s.criteria) e
         where s.id = :cfo);

select assert_eq((select weighted_total from assessments
                   where id = 'a5000000-0000-0000-0000-000000000001'),
  500, 'straight fives score the maximum of 500');

-- And the application's headline score is that as a percentage.
select assert_eq((select score from applications where id = :app),
  100, 'the application shows it as 100 percent');

-- Straight threes: 3 x 100 = 300.
update assessments
   set scores = (select jsonb_object_agg(e->>'key', jsonb_build_object('score', 3))
                   from scorecards s, jsonb_array_elements(s.criteria) e
                  where s.id = :cfo)
 where id = 'a5000000-0000-0000-0000-000000000001';

select assert_eq((select weighted_total from assessments
                   where id = 'a5000000-0000-0000-0000-000000000001'),
  300, 'straight threes score 300');
select assert_eq((select score from applications where id = :app),
  60, 'the application follows it down to 60 percent');

-- A real mixed scorecard, computed by hand:
--   financial_leadership 5x25=125, sector_relevance 4x20=80,
--   strategic_contribution 3x15=45, stakeholder_board 4x15=60,
--   qualifications 5x10=50, geographic 2x10=20, cultural_fit 4x5=20
--   total = 400
update assessments set scores = $s${
  "financial_leadership":   {"score": 5, "evidence": "Owned a R2.1bn budget and a team of 40."},
  "sector_relevance":       {"score": 4},
  "strategic_contribution": {"score": 3},
  "stakeholder_board":      {"score": 4},
  "qualifications":         {"score": 5, "evidence": "CA(SA), in good standing."},
  "geographic":             {"score": 2},
  "cultural_fit":           {"score": 4}
}$s$::jsonb
 where id = 'a5000000-0000-0000-0000-000000000001';

select assert_eq((select weighted_total from assessments
                   where id = 'a5000000-0000-0000-0000-000000000001'),
  400, 'a mixed scorecard totals what it should');
select assert_eq((select score from applications where id = :app),
  80, 'and the application shows 80 percent');

-- ---------------------------------------------------------------------------
-- The total is derived, so it cannot be argued with
-- ---------------------------------------------------------------------------
update assessments set weighted_total = 499
 where id = 'a5000000-0000-0000-0000-000000000001';
select assert_eq((select weighted_total from assessments
                   where id = 'a5000000-0000-0000-0000-000000000001'),
  400, 'a total typed in by hand is overwritten by the arithmetic');

-- ---------------------------------------------------------------------------
-- What the scoring refuses
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update assessments
       set scores = jsonb_set(scores, '{geographic,score}', '6'::jsonb)
     where id = 'a5000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: a score of 6 was accepted';
  exception when check_violation then
    raise notice 'passed: a score outside 1 to 5 is refused';
  end;
end $$;

-- Scoring happens one criterion at a time, so a partly-filled assessment is
-- allowed. What it must not do is carry a total, which would make it look
-- finished.
update assessments set scores = scores - 'geographic'
 where id = 'a5000000-0000-0000-0000-000000000001';
select assert((select weighted_total from assessments
                where id = 'a5000000-0000-0000-0000-000000000001') is null,
  'a part-scored assessment carries no total');
select assert((select score from applications
                where id = 'a9000000-0000-0000-0000-000000000001') is null,
  'and it does not leave a stale score on the application');

-- It cannot be submitted in that state.
do $$
begin
  begin
    update assessments set submitted_at = now()
     where id = 'a5000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: a half-scored assessment was submitted';
  exception when check_violation then
    raise notice 'passed: an assessment cannot be submitted half-scored';
  end;
end $$;

-- Score the missing criterion and the total comes back.
update assessments
   set scores = scores || '{"geographic":{"score":2}}'::jsonb
 where id = 'a5000000-0000-0000-0000-000000000001';
select assert_eq((select weighted_total from assessments
                   where id = 'a5000000-0000-0000-0000-000000000001'),
  400, 'completing the last criterion restores the total');

do $$
begin
  begin
    update assessments
       set scores = scores || '{"charisma":{"score":5}}'::jsonb
     where id = 'a5000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: a criterion not on the scorecard was accepted';
  exception when check_violation then
    raise notice 'passed: a score against a criterion not on the scorecard is refused';
  end;
end $$;

do $$
begin
  begin
    insert into assessments (org_id, application_id, scorecard_id, scores)
    values ((select id from organisations where slug = 'assessment-test'),
            'a9000000-0000-0000-0000-000000000001',
            '5c0d0000-0000-0000-0000-000000000001',
            '{"a":{"score":5}}'::jsonb);
    raise exception 'FAILED: scoring against an empty draft scorecard was allowed';
  exception when check_violation then
    raise notice 'passed: a draft scorecard cannot be scored against';
  end;
end $$;

-- An assessment in progress is allowed to have no total yet.
insert into assessments (id, org_id, application_id, scorecard_id, scores)
values ('a5000000-0000-0000-0000-000000000002',
        (select id from organisations where slug = 'assessment-test'),
        'a9000000-0000-0000-0000-000000000001',
        (select id from scorecards where org_id =
          (select id from organisations where slug = 'assessment-test')
          and system_code = 'chro'),
        '{}'::jsonb);
select assert((select weighted_total from assessments
                where id = 'a5000000-0000-0000-0000-000000000002') is null,
  'an assessment with nothing scored yet carries no total');

-- ---------------------------------------------------------------------------
-- Reweighting a scorecard makes it the agency's own
-- ---------------------------------------------------------------------------
update scorecards
   set criteria = jsonb_set(
         jsonb_set(criteria, '{0,weight}', '30'::jsonb), '{1,weight}', '15'::jsonb)
 where org_id = :org and system_code = 'cfo';

select assert(not (select is_system from scorecards
                    where org_id = :org and system_code = 'cfo'),
  'reweighting a scorecard hands it to the agency');

do $$
declare v_org uuid; v_before jsonb;
begin
  select id into v_org from organisations where slug = 'assessment-test';
  select criteria into v_before from scorecards
   where org_id = v_org and system_code = 'cfo';
  perform sync_scorecard_library(v_org);
  if (select criteria from scorecards where org_id = v_org and system_code = 'cfo')
       is distinct from v_before then
    raise exception 'FAILED: a top-up overwrote the agency''s own weights';
  end if;
  raise notice 'passed: a top-up leaves the agency''s own weights alone';
end $$;

-- A reweighted scorecard still has to add up.
do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'assessment-test';
  begin
    update scorecards set criteria = jsonb_set(criteria, '{0,weight}', '90'::jsonb)
     where org_id = v_org and system_code = 'chro';
    raise exception 'FAILED: an agency reweighted a scorecard to more than 100';
  exception when check_violation then
    raise notice 'passed: an agency cannot reweight a scorecard away from 100';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- A reference call needs consent first
-- ---------------------------------------------------------------------------
insert into reference_checks (id, org_id, candidate_id, application_id,
                              referee_name, relationship)
values ('fee00000-0000-0000-0000-000000000001', :org,
        'ca000000-0000-0000-0000-000000000001', :app,
        'Pieter van Wyk', 'line_manager');
select assert(true, 'a referee can be recorded before consent is given');

do $$
begin
  begin
    update reference_checks
       set conducted_at = now(),
           conducted_by = (select id from profiles limit 1)
     where id = 'fee00000-0000-0000-0000-000000000001';
    raise exception 'FAILED: a reference call was recorded without consent';
  exception when insufficient_privilege then
    raise notice 'passed: a reference call cannot be recorded without consent';
  end;
end $$;

update candidates set consent_given = true, consent_at = now()
 where id = 'ca000000-0000-0000-0000-000000000001';

update reference_checks
   set conducted_at = now(),
       conducted_by = (select id from profiles limit 1),
       would_rehire = true,
       outcome = 'positive'
 where id = 'fee00000-0000-0000-0000-000000000001';

select assert((select conducted_at is not null from reference_checks
                where id = 'fee00000-0000-0000-0000-000000000001'),
  'once the candidate has consented the call can be recorded');

-- A completed call must say who made it.
do $$
begin
  begin
    insert into reference_checks (org_id, candidate_id, referee_name,
                                  relationship, conducted_at)
    values ((select id from organisations where slug = 'assessment-test'),
            'ca000000-0000-0000-0000-000000000001', 'Anon', 'peer', now());
    raise exception 'FAILED: a reference call with no conductor was accepted';
  exception when check_violation then
    raise notice 'passed: a completed reference call has to name who made it';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Tenant isolation on the new table
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_policies
                  where tablename = 'reference_checks' and schemaname = 'public') then
    raise exception 'FAILED: reference_checks has no RLS policy';
  end if;
  if not (select relrowsecurity from pg_class where relname = 'reference_checks') then
    raise exception 'FAILED: RLS is not enabled on reference_checks';
  end if;
  raise notice 'passed: reference checks are behind row level security';
end $$;

rollback;

\echo ''
\echo 'All assessment assertions passed.'
