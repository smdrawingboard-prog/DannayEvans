-- ============================================================================
-- Placement onboarding: the 90-day check-in schedule and its consent gates.
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
values ('0b000000-0000-0000-0000-00000000000b', 'recruiter@test.test');

set local role authenticated;
set local request.jwt.claim.sub = '0b000000-0000-0000-0000-00000000000b';
select create_organisation('Onboarding Test', 'onboarding-test', 'ZA');
reset role;

\set org '(select id from organisations where slug = ''onboarding-test'')'

-- ---------------------------------------------------------------------------
-- Seeded on signup
-- ---------------------------------------------------------------------------
select assert(
  (select count(*) from message_templates
    where org_id = :org and name like 'Onboarding check-in%') = 5,
  'a new workspace gets all five check-in messages');

select assert(
  (select count(*) from message_templates
    where org_id = :org and name like 'Onboarding check-in%'
      and category = 'solicitation') = 1,
  'exactly one of them is marked as asking the candidate for something');

select assert(
  (select count(*) from automations
    where org_id = :org and trigger_key = 'placement.created') = 1,
  'the placement automation is installed');

-- ---------------------------------------------------------------------------
-- Scheduling from the start date
-- ---------------------------------------------------------------------------
insert into clients (id, org_id, name)
values ('c2000000-0000-0000-0000-000000000001', :org, 'Hiring Co');
insert into jobs (id, org_id, client_id, title, slug)
values ('30b00000-0000-0000-0000-000000000002', :org,
        'c2000000-0000-0000-0000-000000000001', 'Finance Director', 'finance-director');
insert into candidates (id, org_id, full_name, email)
values ('ca000000-0000-0000-0000-000000000002', :org, 'Sipho Khumalo', 's@test.test');
insert into applications (id, org_id, job_id, candidate_id)
values ('a9000000-0000-0000-0000-000000000002', :org,
        '30b00000-0000-0000-0000-000000000002',
        'ca000000-0000-0000-0000-000000000002');

insert into placements (id, org_id, application_id, client_id, start_date)
values ('91000000-0000-0000-0000-000000000001', :org,
        'a9000000-0000-0000-0000-000000000002',
        'c2000000-0000-0000-0000-000000000001', date '2026-03-02');

\set pl '''91000000-0000-0000-0000-000000000001'''

select assert((select count(*) from onboarding_checkins where placement_id = :pl) = 5,
  'creating a placement lays down all five check-ins');

select assert(
  (select array_agg(day_offset order by day_offset)
     from onboarding_checkins where placement_id = :pl) = array[3,10,30,60,90],
  'at the offsets the method specifies, not the four the table was built for');

select assert(
  (select due_on from onboarding_checkins where placement_id = :pl and day_offset = 90)
    = date '2026-05-31',
  'dated from the start date, not from when the placement was captured');

-- ---------------------------------------------------------------------------
-- Start dates slip. That is normal and must not break the schedule.
-- ---------------------------------------------------------------------------
update placements set start_date = date '2026-04-01' where id = :pl;

select assert(
  (select due_on from onboarding_checkins where placement_id = :pl and day_offset = 3)
    = date '2026-04-04',
  'moving the start date moves the check-ins with it');

-- But a message already sent cannot be rescheduled.
insert into contact_channels (org_id, subject_type, subject_id, channel, address, opted_in, opted_in_at)
values (:org, 'candidate', 'ca000000-0000-0000-0000-000000000002',
        'whatsapp', '+27820000001', false, null);

update onboarding_checkins set sent_at = now()
 where placement_id = :pl and day_offset = 3;

update placements set start_date = date '2026-05-01' where id = :pl;

select assert(
  (select due_on from onboarding_checkins where placement_id = :pl and day_offset = 3)
    = date '2026-04-04',
  'a check-in already sent keeps its date when the start date moves again');
select assert(
  (select due_on from onboarding_checkins where placement_id = :pl and day_offset = 10)
    = date '2026-05-11',
  'the unsent ones still move');

-- A placement with no start date yet schedules nothing rather than guessing.
insert into candidates (id, org_id, full_name)
values ('ca000000-0000-0000-0000-000000000003', :org, 'Undated Candidate');
insert into applications (id, org_id, job_id, candidate_id)
values ('a9000000-0000-0000-0000-000000000003', :org,
        '30b00000-0000-0000-0000-000000000002',
        'ca000000-0000-0000-0000-000000000003');
insert into placements (id, org_id, application_id)
values ('91000000-0000-0000-0000-000000000002', :org,
        'a9000000-0000-0000-0000-000000000003');

select assert(
  (select count(*) from onboarding_checkins
    where placement_id = '91000000-0000-0000-0000-000000000002') = 0,
  'a placement with no start date schedules nothing rather than guessing one');

-- Setting it later fills the schedule in.
update placements set start_date = current_date
 where id = '91000000-0000-0000-0000-000000000002';
select assert(
  (select count(*) from onboarding_checkins
    where placement_id = '91000000-0000-0000-0000-000000000002') = 5,
  'setting the start date later fills the schedule in');

-- ---------------------------------------------------------------------------
-- The day-90 message asks for referrals, which is a different consent
-- ---------------------------------------------------------------------------
select assert(
  (select is_solicitation from onboarding_checkins
    where placement_id = :pl and day_offset = 90),
  'the day-90 referral request is marked as solicitation');
select assert(
  not (select bool_or(is_solicitation) from onboarding_checkins
        where placement_id = :pl and day_offset < 90),
  'the earlier check-ins are not');

select assert(
  (select held_reason from onboarding_checkins
    where placement_id = :pl and day_offset = 90) is not null,
  'and it is held back while marketing consent is missing');

-- Service check-ins go out on a channel that has not opted out.
update onboarding_checkins set sent_at = now()
 where placement_id = :pl and day_offset = 10;
select assert(true, 'a service check-in sends without marketing consent');

-- The referral request does not.
do $$
begin
  begin
    update onboarding_checkins set sent_at = now()
     where placement_id = '91000000-0000-0000-0000-000000000001' and day_offset = 90;
    raise exception 'FAILED: a referral request was sent without marketing consent';
  exception when insufficient_privilege then
    raise notice 'passed: the referral request is refused without marketing consent';
  end;
end $$;

-- Once the candidate opts in, it can go.
update contact_channels set opted_in = true, opted_in_at = now(),
       opted_in_source = 'signed placement pack'
 where org_id = :org and subject_id = 'ca000000-0000-0000-0000-000000000002';

update onboarding_checkins set sent_at = now()
 where placement_id = :pl and day_offset = 90;
select assert(
  (select sent_at is not null from onboarding_checkins
    where placement_id = :pl and day_offset = 90),
  'once they opt in the referral request can be sent');

-- Opting out closes everything, service messages included.
update contact_channels set opted_out_at = now()
 where org_id = :org and subject_id = 'ca000000-0000-0000-0000-000000000002';

do $$
begin
  begin
    update onboarding_checkins set sent_at = now()
     where placement_id = '91000000-0000-0000-0000-000000000001' and day_offset = 60;
    raise exception 'FAILED: a check-in was sent after the candidate opted out';
  exception when insufficient_privilege then
    raise notice 'passed: opting out stops the service check-ins too';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- International placements
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update placements set international_placement = true
     where id = '91000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: an international placement with no destination was accepted';
  exception when check_violation then
    raise notice 'passed: an international placement has to say where to';
  end;
end $$;

update placements
   set international_placement = true, destination_country = 'GB'
 where id = :pl;

select assert(placement_needs_briefing(:pl),
  'an international placement with no briefing is flagged as needing one');

insert into mobility_briefings (org_id, candidate_id, placement_id, to_country)
values (:org, 'ca000000-0000-0000-0000-000000000002', :pl, 'GB');

select assert(not placement_needs_briefing(:pl),
  'once the briefing exists it is not');

select assert(
  (select disclaimer like '%not legal, tax, or immigration advice%'
     from mobility_briefings where placement_id = :pl),
  'every briefing carries the disclaimer whether or not anyone typed one');

-- ---------------------------------------------------------------------------
-- Cross-tenant
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('0b000000-0000-0000-0000-00000000000c', 'outsider@elsewhere.test');
set local role authenticated;
set local request.jwt.claim.sub = '0b000000-0000-0000-0000-00000000000c';

do $$
begin
  begin
    perform schedule_onboarding_checkins('91000000-0000-0000-0000-000000000001');
    raise exception 'FAILED: an outsider rescheduled another agency''s check-ins';
  exception when insufficient_privilege then
    raise notice 'passed: an outsider cannot reschedule another agency''s check-ins';
  end;
end $$;

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'onboarding-test';
  begin
    perform candidate_channel_open(v_org, 'ca000000-0000-0000-0000-000000000002',
                                   'whatsapp', false);
    raise exception 'FAILED: an outsider read another agency''s contact consent';
  exception when insufficient_privilege then
    raise notice 'passed: an outsider cannot read another agency''s contact consent';
  end;
end $$;

reset role;

-- None of this migration's functions may be reachable without signing in.
do $$
declare f text;
begin
  foreach f in array array[
    'candidate_channel_open(uuid, uuid, comms_channel, boolean)',
    'placement_needs_briefing(uuid)',
    'schedule_onboarding_checkins(uuid)',
    'seed_onboarding_templates(uuid)',
    'seed_onboarding_workspace(uuid)',
    'checkin_respects_consent()'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'FAILED: anon can execute %', f;
    end if;
  end loop;
  raise notice 'passed: none of the onboarding functions are anon-callable';
end $$;

-- And seeding is never a tenant's to call.
do $$
begin
  if has_function_privilege('authenticated', 'seed_onboarding_workspace(uuid)', 'execute')
     or has_function_privilege('authenticated', 'seed_onboarding_templates(uuid)', 'execute') then
    raise exception 'FAILED: a tenant can seed its own onboarding templates';
  end if;
  raise notice 'passed: seeding the onboarding pack is not reachable from the API';
end $$;

rollback;

\echo ''
\echo 'All onboarding assertions passed.'
