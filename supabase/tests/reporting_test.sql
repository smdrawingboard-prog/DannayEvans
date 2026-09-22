-- ============================================================================
-- Report tokens: scoping, expiry, revocation, and what they must not leak.
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

insert into auth.users (id, email)
values ('0e000000-0000-0000-0000-00000000000e', 'admin@test.test');

set local role authenticated;
set local request.jwt.claim.sub = '0e000000-0000-0000-0000-00000000000e';
select create_organisation('Report Test', 'report-test', 'ZA');
reset role;

\set org '(select id from organisations where slug = ''report-test'')'

insert into clients (id, org_id, name, contact_email)
values ('c4000000-0000-0000-0000-000000000001', :org, 'Acme SA', 'hr@acme.test');
insert into jobs (id, org_id, client_id, title, slug, status, published_at)
values ('30d00000-0000-0000-0000-000000000001', :org,
        'c4000000-0000-0000-0000-000000000001', 'Financial Director',
        'financial-director', 'open', now() - interval '40 days');
insert into candidates (id, org_id, full_name, email, current_title, consent_given)
values ('cc000000-0000-0000-0000-000000000001', :org, 'Zanele Mthembu',
        'z@test.test', 'Group Financial Manager', true);
insert into applications (id, org_id, job_id, candidate_id, stage_id)
values ('ac000000-0000-0000-0000-000000000001', :org,
        '30d00000-0000-0000-0000-000000000001',
        'cc000000-0000-0000-0000-000000000001',
        (select id from pipeline_stages where org_id = :org and kind='candidate' and position=3));

-- ---------------------------------------------------------------------------
-- Minting
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '0e000000-0000-0000-0000-00000000000e';

select assert(
  create_report_token(:org, 'Weekly sheet', array['pipeline','placements'], 90)
    like 'hfr_%',
  'an admin can mint a report token');

-- The plaintext is never stored, only its hash.
select assert(
  (select count(*) from report_tokens where token_hash like 'hfr_%') = 0,
  'the token itself is not stored, only its hash');

select assert(
  (select length(token_hash) from report_tokens limit 1) = 64,
  'what is stored is a sha-256 hash');

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'report-test';
  begin
    perform create_report_token(v_org, 'Bad', array['pipeline','everything'], 30);
    raise exception 'FAILED: an unknown scope was accepted';
  exception when check_violation then
    raise notice 'passed: an unknown report scope is refused';
  end;
end $$;

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'report-test';
  begin
    perform create_report_token(v_org, 'Forever', array['pipeline'], 4000);
    raise exception 'FAILED: a token lasting eleven years was accepted';
  exception when check_violation then
    raise notice 'passed: a token cannot be minted to last forever';
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Reading, as a spreadsheet would: no session at all
-- ---------------------------------------------------------------------------
\set tok '(select ''placeholder'')'

do $$
declare v_org uuid; v_token text; v_rows jsonb;
begin
  select id into v_org from organisations where slug = 'report-test';

  -- Mint one we know the plaintext of.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '0e000000-0000-0000-0000-00000000000e', true);
  v_token := create_report_token(v_org, 'Sheet', array['pipeline','candidates'], 30);
  reset role;

  -- Now read it the way Apps Script does: anon, token only.
  set local role anon;
  v_rows := report_rows(v_token, 'pipeline');
  if jsonb_array_length(v_rows) < 1 then
    raise exception 'FAILED: the pipeline report came back empty';
  end if;
  raise notice 'passed: a spreadsheet with a token can read its own pipeline';

  -- A report the token is not scoped for is refused.
  begin
    perform report_rows(v_token, 'billing');
    raise exception 'FAILED: a token read a report outside its scope';
  exception when insufficient_privilege then
    raise notice 'passed: a token cannot read a report outside its scope';
  end;

  -- A wrong token is refused.
  begin
    perform report_rows('hfr_not-a-real-token', 'pipeline');
    raise exception 'FAILED: an invented token was accepted';
  exception when insufficient_privilege then
    raise notice 'passed: an invented token is refused';
  end;

  -- An invented report name is refused by the scope check, because a scope
  -- is validated when the token is minted: no token can ever be scoped for a
  -- report that does not exist. The name check inside report_rows is a second
  -- line that this cannot reach, which is the point.
  begin
    perform report_rows(v_token, 'salaries');
    raise exception 'FAILED: an invented report name was accepted';
  exception when insufficient_privilege then
    raise notice 'passed: an invented report name has no scope that permits it';
  end;

  reset role;

  -- Use is recorded.
  if (select use_count from report_tokens where name = 'Sheet') < 1 then
    raise exception 'FAILED: the token use was not counted';
  end if;
  if not exists (select 1 from report_exports where report = 'pipeline') then
    raise exception 'FAILED: the export was not logged';
  end if;
  raise notice 'passed: every export is counted and logged';

  -- Revocation takes effect immediately.
  update report_tokens set revoked_at = now() where name = 'Sheet';
  set local role anon;
  begin
    perform report_rows(v_token, 'pipeline');
    raise exception 'FAILED: a revoked token still worked';
  exception when insufficient_privilege then
    raise notice 'passed: a revoked token stops working at once';
  end;
  reset role;
end $$;

-- Expiry is enforced, not just recorded.
do $$
declare v_org uuid; v_token text;
begin
  select id into v_org from organisations where slug = 'report-test';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '0e000000-0000-0000-0000-00000000000e', true);
  v_token := create_report_token(v_org, 'Stale', array['pipeline'], 1);
  reset role;

  update report_tokens
     set created_at = now() - interval '10 days', expires_at = now() - interval '1 day'
   where name = 'Stale';

  set local role anon;
  begin
    perform report_rows(v_token, 'pipeline');
    raise exception 'FAILED: an expired token still worked';
  exception when insufficient_privilege then
    raise notice 'passed: an expired token stops working';
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- What a spreadsheet must never carry out
-- ---------------------------------------------------------------------------
do $$
declare v_org uuid; v_rows jsonb; v_keys text[];
begin
  select id into v_org from organisations where slug = 'report-test';
  v_rows := report_candidates(v_org);

  select array_agg(distinct k) into v_keys
    from jsonb_array_elements(v_rows) r, jsonb_object_keys(r) k;

  if v_keys && array['id_number','date_of_birth','criminal_check','justification',
                     'medical','banking_details','tax_number','race','id'] then
    raise exception 'FAILED: the candidate export carries sensitive fields: %',
      array_to_string(v_keys, ', ');
  end if;
  raise notice 'passed: the candidate export carries no identity or special personal information';

  if not (v_keys @> array['full_name','consent_given','retain_until']) then
    raise exception 'FAILED: the candidate export is missing its privacy columns';
  end if;
  raise notice 'passed: it does carry the consent and retention state';
end $$;

-- An anonymised or erased candidate is gone from the export.
update candidates set erasure_requested_at = now()
 where id = 'cc000000-0000-0000-0000-000000000001';
select assert(
  jsonb_array_length(report_candidates(:org)) = 0,
  'a candidate who asked to be erased is not in the export');
update candidates set erasure_requested_at = null
 where id = 'cc000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Cross-tenant
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('0e000000-0000-0000-0000-00000000000f', 'outsider@elsewhere.test');
set local role authenticated;
set local request.jwt.claim.sub = '0e000000-0000-0000-0000-00000000000f';

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'report-test';
  begin
    perform create_report_token(v_org, 'Theirs', array['candidates'], 30);
    raise exception 'FAILED: an outsider minted a token for another agency';
  exception when insufficient_privilege then
    raise notice 'passed: an outsider cannot mint a token for another agency';
  end;
end $$;

reset role;

-- A member who is not an admin cannot mint one either.
insert into auth.users (id, email)
values ('0e000000-0000-0000-0000-000000000010', 'recruiter@test.test');
insert into profiles (id, email) values
  ('0e000000-0000-0000-0000-000000000010', 'recruiter@test.test')
on conflict do nothing;
insert into memberships (org_id, user_id, role)
values (:org, '0e000000-0000-0000-0000-000000000010', 'recruiter');

set local role authenticated;
set local request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000010';
do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'report-test';
  begin
    perform create_report_token(v_org, 'Mine', array['candidates'], 30);
    raise exception 'FAILED: a recruiter minted a report token';
  exception when insufficient_privilege then
    raise notice 'passed: only an owner or admin can mint a report token';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- The report builders stay unreachable from outside
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'report_candidates(uuid)', 'report_shortlist(uuid, uuid)',
    'report_pipeline(uuid)', 'report_placements(uuid)',
    'report_clients(uuid)', 'report_billing(uuid)', 'hash_report_token(text)'
  ] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FAILED: % is reachable from the API', f;
    end if;
  end loop;
  raise notice 'passed: the report builders are only reachable through a token';
end $$;

do $$
begin
  if not has_function_privilege('anon', 'report_rows(text, text, jsonb)', 'execute') then
    raise exception 'FAILED: a spreadsheet cannot reach report_rows';
  end if;
  if has_function_privilege('anon', 'create_report_token(uuid, text, text[], integer)', 'execute') then
    raise exception 'FAILED: anon can mint report tokens';
  end if;
  raise notice 'passed: anon can read through a token but cannot mint one';
end $$;

-- A tenant cannot forge a row into the token table.
do $$
begin
  if has_table_privilege('authenticated', 'report_tokens', 'insert') then
    raise exception 'FAILED: a tenant can insert a report token by hand';
  end if;
  raise notice 'passed: a token can only be created by the minting function';
end $$;

rollback;

\echo ''
\echo 'All reporting assertions passed.'
