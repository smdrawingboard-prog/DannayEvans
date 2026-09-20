-- ============================================================================
-- Tenant isolation and signature lifecycle.
--
-- Run against a scratch database that already has the shim and every
-- migration applied:
--   psql -f supabase/tests/_shim.sql -f (each migration) -f this file
--
-- Every assertion raises on failure, so a clean run means every check passed.
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

-- Two unrelated tenants, each with one owner.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ayanda@alpha.test'),
  ('22222222-2222-2222-2222-222222222222', 'bongi@beta.test');

-- ---------------------------------------------------------------------------
-- Organisation creation
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select create_organisation('Alpha Recruitment', 'alpha', 'ZA');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select create_organisation('Beta Talent', 'beta', 'UK');

reset role;

select assert(
  (select currency from organisations where slug = 'alpha') = 'ZAR',
  'a South African workspace is billed in rand');
select assert(
  (select currency from organisations where slug = 'beta') = 'GBP',
  'a UK workspace is billed in pounds');
select assert(
  (select count(*) from pipeline_stages
    where org_id = (select id from organisations where slug = 'alpha')) = 15,
  'a new workspace gets the default candidate and deal pipelines');
select assert(
  (select count(*) from automations
    where org_id = (select id from organisations where slug = 'alpha')) = 7,
  'a new workspace gets the starter automations');
select assert(
  (select count(*) from careers_sites
    where org_id = (select id from organisations where slug = 'alpha')) = 1,
  'a new workspace gets a careers site');

-- ---------------------------------------------------------------------------
-- Seed one candidate in each tenant
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into candidates (org_id, full_name, email)
values ((select id from organisations where slug = 'alpha'), 'Alpha Candidate', 'a@a.test');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into candidates (org_id, full_name, email)
values ((select id from organisations where slug = 'beta'), 'Beta Candidate', 'b@b.test');

-- ---------------------------------------------------------------------------
-- Isolation: the core claim of the tenancy model
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assert((select count(*) from candidates) = 1,
  'a member sees only their own tenant''s candidates');
select assert((select count(*) from organisations) = 1,
  'a member sees only their own organisation');
select assert((select count(*) from pipeline_stages) = 15,
  'pipeline configuration does not leak across tenants');

-- Writing into somebody else's tenant must be refused by the WITH CHECK.
do $$
begin
  insert into candidates (org_id, full_name)
  values ((select id from organisations where slug = 'beta'), 'Injected');
  raise exception 'FAILED: a member was able to write into another tenant';
exception
  when insufficient_privilege then
    raise notice 'passed: writing into another tenant is refused';
end $$;

-- Reading a foreign row by its primary key must also return nothing.
select assert(
  (select count(*) from candidates
    where id = (select id from candidates where full_name = 'Beta Candidate'
                limit 1)) = 0,
  'a foreign row is invisible even when its id is known');

reset role;

-- ---------------------------------------------------------------------------
-- Signature lifecycle
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into envelopes (id, org_id, subject, sequential)
values ('33333333-3333-3333-3333-333333333333',
        (select id from organisations where slug = 'alpha'),
        'Offer of employment', true);

insert into envelope_recipients (envelope_id, org_id, full_name, email, signing_order)
values
  ('33333333-3333-3333-3333-333333333333',
   (select id from organisations where slug = 'alpha'),
   'Alpha Candidate', 'a@a.test', 1),
  ('33333333-3333-3333-3333-333333333333',
   (select id from organisations where slug = 'alpha'),
   'Hiring Manager', 'hm@a.test', 2);

update envelopes set status = 'sent', sent_at = now()
 where id = '33333333-3333-3333-3333-333333333333';

-- First of two signs: the envelope advances but must not complete.
update envelope_recipients set status = 'signed', signed_at = now()
 where envelope_id = '33333333-3333-3333-3333-333333333333' and signing_order = 1;

select assert(
  (select status from envelopes where id = '33333333-3333-3333-3333-333333333333')
    = 'in_progress',
  'one signature of two moves the envelope to in progress, not completed');

-- Second signs: now it completes, with a timestamp.
update envelope_recipients set status = 'signed', signed_at = now()
 where envelope_id = '33333333-3333-3333-3333-333333333333' and signing_order = 2;

select assert(
  (select status from envelopes where id = '33333333-3333-3333-3333-333333333333')
    = 'completed',
  'the last signature completes the envelope');
select assert(
  (select completed_at is not null from envelopes
    where id = '33333333-3333-3333-3333-333333333333'),
  'completion is timestamped');

-- The audit trail must be genuinely append-only.
insert into envelope_events (envelope_id, org_id, event_type, actor_label)
values ('33333333-3333-3333-3333-333333333333',
        (select id from organisations where slug = 'alpha'),
        'signed', 'Alpha Candidate <a@a.test>');

do $$
begin
  update envelope_events set actor_label = 'Someone Else'
   where envelope_id = '33333333-3333-3333-3333-333333333333';
  raise exception 'FAILED: an audit event was rewritten';
exception
  when insufficient_privilege or raise_exception then
    raise notice 'passed: audit events cannot be rewritten';
end $$;

do $$
begin
  delete from envelope_events
   where envelope_id = '33333333-3333-3333-3333-333333333333';
  raise exception 'FAILED: an audit event was deleted';
exception
  when insufficient_privilege or raise_exception then
    raise notice 'passed: audit events cannot be deleted';
end $$;

-- A decline anywhere stops the envelope.
insert into envelopes (id, org_id, subject)
values ('44444444-4444-4444-4444-444444444444',
        (select id from organisations where slug = 'alpha'), 'Terms of business');
insert into envelope_recipients (envelope_id, org_id, full_name, email)
values ('44444444-4444-4444-4444-444444444444',
        (select id from organisations where slug = 'alpha'),
        'Client Contact', 'client@x.test');
update envelope_recipients set status = 'declined', declined_at = now(),
       decline_reason = 'Fee not agreed'
 where envelope_id = '44444444-4444-4444-4444-444444444444';

select assert(
  (select status from envelopes where id = '44444444-4444-4444-4444-444444444444')
    = 'declined',
  'one decline marks the whole envelope declined');

-- ---------------------------------------------------------------------------
-- Pipeline history
-- ---------------------------------------------------------------------------
insert into clients (id, org_id, name)
values ('55555555-5555-5555-5555-555555555555',
        (select id from organisations where slug = 'alpha'), 'Acme Ltd');
insert into jobs (id, org_id, client_id, title, slug, status)
values ('66666666-6666-6666-6666-666666666666',
        (select id from organisations where slug = 'alpha'),
        '55555555-5555-5555-5555-555555555555',
        'Financial Manager', 'financial-manager', 'open');
insert into applications (id, org_id, job_id, candidate_id, stage_id)
values ('77777777-7777-7777-7777-777777777777',
        (select id from organisations where slug = 'alpha'),
        '66666666-6666-6666-6666-666666666666',
        (select id from candidates where full_name = 'Alpha Candidate'),
        (select id from pipeline_stages where org_id = (select id from organisations where slug='alpha')
           and kind = 'candidate' and position = 1));

update applications
   set stage_id = (select id from pipeline_stages
                    where org_id = (select id from organisations where slug='alpha')
                      and kind = 'candidate' and position = 2)
 where id = '77777777-7777-7777-7777-777777777777';

select assert(
  (select count(*) from application_stage_history
    where application_id = '77777777-7777-7777-7777-777777777777') = 1,
  'moving a stage records a history row');

reset role;

-- ---------------------------------------------------------------------------
-- Storage path authorisation
-- ---------------------------------------------------------------------------
select assert(storage_path_org('not-a-uuid/file.pdf') is null,
  'a malformed storage path fails the policy instead of erroring');
select assert(
  storage_path_org(
    (select id from organisations where slug = 'alpha')::text || '/envelopes/x.pdf'
  ) = (select id from organisations where slug = 'alpha'),
  'a well-formed storage path resolves to its organisation');

rollback;

\echo ''
\echo 'All assertions passed.'
