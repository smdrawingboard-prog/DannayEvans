-- ============================================================================
-- Document pack, Right to Represent, retention and the record taxonomy.
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
values ('aaaa1111-0000-0000-0000-000000000001', 'agency@test.test');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaa1111-0000-0000-0000-000000000001';
select create_organisation('Test Recruitment', 'test-recruitment', 'ZA');
reset role;

\set org '(select id from organisations where slug = ''test-recruitment'')'

-- ---------------------------------------------------------------------------
-- The pack is installed
-- ---------------------------------------------------------------------------
select assert((select count(*) from document_templates where org_id = :org) = 7,
  'a new workspace gets the seven standard agreements');

select assert(
  (select count(*) from document_templates
    where org_id = :org and category = 'terms_of_business') = 1,
  'the terms of business is one of them');

select assert(
  (select count(*) from document_templates
    where org_id = :org and status = 'needs_legal_review') = 2,
  'the two supplied documents are marked as needing review, not as ready');

select assert(
  (select count(*) from document_templates
    where org_id = :org and status = 'needs_legal_drafting') = 5,
  'the five undrafted agreements are marked as structure only');

-- Nothing claims to be legally signed off, because nothing is.
select assert(
  (select count(*) from document_templates
    where org_id = :org and status = 'ready') = 0,
  'no template claims to be legally approved');

select assert(
  (select body_html like '%NOT YET DRAFTED%' from document_templates
    where org_id = :org and category = 'nda'),
  'an undrafted agreement says so in its own body, not just its status');

-- ---------------------------------------------------------------------------
-- Every {{placeholder}} in a body is declared in merge_keys.
--
-- An undeclared placeholder renders as a blank on a signed contract, which
-- is the kind of defect nobody notices until a client does.
-- ---------------------------------------------------------------------------
do $$
declare t record; k text; undeclared text[];
begin
  for t in select name, body_html, merge_keys from document_templates where org_id =
    (select id from organisations where slug = 'test-recruitment')
  loop
    undeclared := '{}';
    for k in
      select distinct (regexp_matches(t.body_html, '\{\{([a-z0-9_]+)\}\}', 'g'))[1]
    loop
      if not (k = any(t.merge_keys)) then
        undeclared := undeclared || k;
      end if;
    end loop;
    if array_length(undeclared, 1) > 0 then
      raise exception 'FAILED: "%" uses undeclared merge keys: %',
        t.name, array_to_string(undeclared, ', ');
    end if;
  end loop;
  raise notice 'passed: every merge placeholder in every template is declared';
end $$;

-- And the reverse: a declared key that appears nowhere is dead weight.
do $$
declare t record; k text; unused text[];
begin
  for t in select name, body_html, merge_keys from document_templates where org_id =
    (select id from organisations where slug = 'test-recruitment')
  loop
    unused := '{}';
    foreach k in array t.merge_keys loop
      if position('{{' || k || '}}' in t.body_html) = 0 then
        unused := unused || k;
      end if;
    end loop;
    if array_length(unused, 1) > 0 then
      raise exception 'FAILED: "%" declares unused merge keys: %',
        t.name, array_to_string(unused, ', ');
    end if;
  end loop;
  raise notice 'passed: no template declares a merge key it never uses';
end $$;

-- ---------------------------------------------------------------------------
-- Rebate scale
-- ---------------------------------------------------------------------------
insert into clients (id, org_id, name)
values ('bbbb2222-0000-0000-0000-000000000001', :org, 'Acme Ltd');
\set cl '''bbbb2222-0000-0000-0000-000000000001'''

select assert_eq(rebate_credit_pct(:cl,  0), 75, 'day zero departure earns the top credit');
select assert_eq(rebate_credit_pct(:cl, 30), 75, 'day 30 is still the top band');
select assert_eq(rebate_credit_pct(:cl, 31), 50, 'day 31 drops to the middle band');
select assert_eq(rebate_credit_pct(:cl, 60), 50, 'day 60 is still the middle band');
select assert_eq(rebate_credit_pct(:cl, 61), 25, 'day 61 drops to the bottom band');
select assert_eq(rebate_credit_pct(:cl, 90), 25, 'day 90 is the last day of cover');
select assert_eq(rebate_credit_pct(:cl, 91),  0, 'past the guarantee window nothing is due');

-- ---------------------------------------------------------------------------
-- Right to Represent — the dual-submission guard
-- ---------------------------------------------------------------------------
insert into candidates (id, org_id, full_name, email)
values ('cccc3333-0000-0000-0000-000000000001', :org, 'Thandi Mokoena', 't@test.test');
\set cand '''cccc3333-0000-0000-0000-000000000001'''

select assert(
  not (select allowed from can_submit_candidate(:org, :cand, 'Acme Ltd')),
  'submitting without a right to represent is refused');
select assert(
  (select reason from can_submit_candidate(:org, :cand, 'Acme Ltd'))
    = 'no_active_right_to_represent',
  'and the reason names what is missing');

insert into right_to_represent (org_id, candidate_id, client_name, expires_at)
values (:org, :cand, 'Acme Ltd', now() + interval '60 days');

select assert(
  (select allowed from can_submit_candidate(:org, :cand, 'Acme Ltd')),
  'a live grant permits the submission');

-- The constraint, not a warning, is what stops the second grant.
do $$
begin
  insert into right_to_represent (org_id, candidate_id, client_name, expires_at)
  values ((select id from organisations where slug = 'test-recruitment'),
          'cccc3333-0000-0000-0000-000000000001', 'acme ltd',
          now() + interval '30 days');
  raise exception 'FAILED: a second live grant for the same pair was allowed';
exception when unique_violation then
  raise notice 'passed: a second live grant for the same candidate and client is refused';
end $$;

-- A different client is fine.
insert into right_to_represent (org_id, candidate_id, client_name, expires_at)
values (:org, :cand, 'Other Corp', now() + interval '30 days');
select assert(
  (select count(*) from right_to_represent
    where candidate_id = :cand and status = 'active') = 2,
  'the same candidate can be represented to two different employers');

-- An expired grant stops blocking, and stops permitting.
-- Age the grant properly: expires_at must stay after granted_at, which the
-- constraint enforces, so a grant cannot be backdated into nonsense.
update right_to_represent
   set granted_at = now() - interval '90 days',
       expires_at = now() - interval '1 day'
 where candidate_id = :cand and client_name = 'Acme Ltd';
select assert(
  not (select allowed from can_submit_candidate(:org, :cand, 'Acme Ltd')),
  'an expired grant no longer permits a submission');
select assert(
  (select status from right_to_represent
    where candidate_id = :cand and client_name = 'Acme Ltd') = 'expired',
  'and the stale grant is marked expired rather than left active');

-- Which means the pair can be granted again.
insert into right_to_represent (org_id, candidate_id, client_name, expires_at)
values (:org, :cand, 'Acme Ltd', now() + interval '60 days');
select assert(
  (select allowed from can_submit_candidate(:org, :cand, 'Acme Ltd')),
  'after expiry the same pair can be granted again');

-- ---------------------------------------------------------------------------
-- Record taxonomy
-- ---------------------------------------------------------------------------
select assert(
  (select special_personal_information from document_kinds where code = 'criminal_check'),
  'a criminal record check is flagged as special personal information');
select assert(
  (select special_personal_information from document_kinds where code = 'medical_disclosure'),
  'a medical disclosure is flagged as special personal information');
select assert(
  not (select special_personal_information from document_kinds where code = 'cv'),
  'an ordinary CV is not');
select assert(
  (select post_offer_only from document_kinds where code = 'banking_details'),
  'banking details are marked post-offer only');

do $$
begin
  insert into documents (org_id, file_name, mime_type, document_type,
                         storage_path, subject_type, subject_id)
  values ((select id from organisations where slug = 'test-recruitment'),
          'x.pdf', 'application/pdf', 'whatever_i_felt_like',
          'p/x.pdf', 'candidate', 'cccc3333-0000-0000-0000-000000000001');
  raise exception 'FAILED: an unknown document type was accepted';
exception when foreign_key_violation then
  raise notice 'passed: an unrecognised document type is refused';
end $$;

-- ---------------------------------------------------------------------------
-- Retention for unsuccessful candidates
-- ---------------------------------------------------------------------------
insert into jobs (id, org_id, title, slug, status)
values ('dddd4444-0000-0000-0000-000000000001', :org, 'Financial Manager', 'fm', 'open'),
       ('dddd4444-0000-0000-0000-000000000002', :org, 'Accountant', 'acc', 'open');

insert into applications (id, org_id, job_id, candidate_id, stage_id)
values ('eeee5555-0000-0000-0000-000000000001', :org,
        'dddd4444-0000-0000-0000-000000000001', :cand,
        (select id from pipeline_stages where org_id = :org and kind='candidate' and position=1)),
       ('eeee5555-0000-0000-0000-000000000002', :org,
        'dddd4444-0000-0000-0000-000000000002', :cand,
        (select id from pipeline_stages where org_id = :org and kind='candidate' and position=1));

-- Rejecting one application while another is live must not start the clock.
update applications
   set stage_id = (select id from pipeline_stages
                    where org_id = :org and kind='candidate' and is_lost)
 where id = 'eeee5555-0000-0000-0000-000000000001';

select assert(
  (select retain_until is null from candidates where id = :cand),
  'one rejection does not start the retention clock while another role is live');

-- Rejecting the last one does.
update applications
   set stage_id = (select id from pipeline_stages
                    where org_id = :org and kind='candidate' and is_lost)
 where id = 'eeee5555-0000-0000-0000-000000000002';

select assert(
  (select retain_until from candidates where id = :cand)
    = (current_date + interval '12 months')::date,
  'rejecting the last live application sets retention twelve months out');

-- A shorter horizon set by the agency is respected.
update organisations set unsuccessful_retention_months = 6 where id = :org;
update candidates set retain_until = null where id = :cand;
update applications set stage_id =
  (select id from pipeline_stages where org_id = :org and kind='candidate' and position=1)
 where id = 'eeee5555-0000-0000-0000-000000000001';
update applications set stage_id =
  (select id from pipeline_stages where org_id = :org and kind='candidate' and is_lost)
 where id = 'eeee5555-0000-0000-0000-000000000001';

select assert(
  (select retain_until from candidates where id = :cand)
    = (current_date + interval '6 months')::date,
  'a workspace that sets six months gets six months');

-- ---------------------------------------------------------------------------
-- Cross-tenant access to the document-pack functions (regression test for 013)
--
-- rebate_credit_pct and expire_stale_rtr are SECURITY DEFINER, so RLS does
-- not protect them. Migration 011 shipped them without a membership check:
-- an outsider could read a competitor's negotiated rebate scale, or expire
-- their live rights to represent. These assertions fail if that returns.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('dddd9999-0000-0000-0000-000000000009', 'outsider@elsewhere.test');

set local role authenticated;
set local request.jwt.claim.sub = 'dddd9999-0000-0000-0000-000000000009';

do $$
begin
  perform rebate_credit_pct('bbbb2222-0000-0000-0000-000000000001', 10);
  raise exception 'FAILED: an outsider read another agency''s rebate scale';
exception
  when insufficient_privilege then
    raise notice 'passed: an outsider cannot read another agency''s rebate scale';
end $$;

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'test-recruitment';
  perform expire_stale_rtr(v_org);
  raise exception 'FAILED: an outsider expired another agency''s rights to represent';
exception
  when insufficient_privilege then
    raise notice 'passed: an outsider cannot expire another agency''s rights to represent';
end $$;

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'test-recruitment';
  perform * from can_submit_candidate(v_org, 'cccc3333-0000-0000-0000-000000000001', 'Acme Ltd');
  raise exception 'FAILED: an outsider queried another agency''s submission rights';
exception
  when insufficient_privilege then
    raise notice 'passed: an outsider cannot query another agency''s submission rights';
end $$;

reset role;

-- None of these may be reachable without signing in at all.
do $$
declare f text;
begin
  foreach f in array array[
    'rebate_credit_pct(uuid, integer)',
    'expire_stale_rtr(uuid)',
    'can_submit_candidate(uuid, uuid, text)',
    'apply_unsuccessful_retention()',
    'seed_document_pack(uuid)'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'FAILED: anon can execute %', f;
    end if;
  end loop;
  raise notice 'passed: none of the document-pack functions are anon-callable';
end $$;

-- The trigger function is not an endpoint for anybody.
do $$
begin
  if has_function_privilege('authenticated', 'apply_unsuccessful_retention()', 'execute') then
    raise exception 'FAILED: a signed-in user can call the retention trigger directly';
  end if;
  raise notice 'passed: the retention trigger is not callable over the API';
end $$;

rollback;

\echo ''
\echo 'All document pack assertions passed.'
