-- ============================================================================
-- Cold outreach: suppression, lawful basis, and the POPIA s69 rule.
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
values ('0c000000-0000-0000-0000-00000000000c', 'bd@test.test');

set local role authenticated;
set local request.jwt.claim.sub = '0c000000-0000-0000-0000-00000000000c';
select create_organisation('Outreach Test', 'outreach-test', 'ZA');
reset role;

\set org '(select id from organisations where slug = ''outreach-test'')'

-- ---------------------------------------------------------------------------
-- A workspace that cannot identify itself cannot market
-- ---------------------------------------------------------------------------
select assert(not org_can_send_marketing(:org),
  'a workspace with no postal address cannot send marketing');

select assert(
  not (select allowed from outreach_basis(:org, 'cfo@bigco.co.za', 'email')),
  'and every send is refused while that is true');

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'outreach-test';
  begin
    insert into sequences (org_id, name, audience, active)
    values (v_org, 'BD outreach', 'client', true);
    raise exception 'FAILED: a sequence went live without sender identity';
  exception when insufficient_privilege then
    raise notice 'passed: a sequence cannot be activated without sender identity';
  end;
end $$;

update organisations
   set legal_name = 'Outreach Test (Pty) Ltd',
       postal_address = '1 Long Street, Cape Town, 8001',
       unsubscribe_url = 'https://example.test/unsubscribe'
 where id = :org;

select assert(org_can_send_marketing(:org),
  'once the sender details are set it can');

-- ---------------------------------------------------------------------------
-- POPIA s69 — the rule the method does not cover
-- ---------------------------------------------------------------------------
select assert(
  (select basis from outreach_basis(:org, 'cfo@bigco.co.za', 'email'))
    = 'permission_request',
  'a first approach to a South African contact is a s69(2) permission request');

insert into candidates (id, org_id, full_name, email)
values ('cd000000-0000-0000-0000-000000000001', :org, 'Lerato Nkosi', 'cfo@bigco.co.za');

insert into messages (org_id, subject_type, subject_id, channel, direction,
                      to_address, subject_line, is_marketing, sent_at)
values (:org, 'candidate', 'cd000000-0000-0000-0000-000000000001', 'email',
        'outbound', 'cfo@bigco.co.za', 'Bigco expansion', true, now());

select assert(
  (select basis from messages where to_address = 'cfo@bigco.co.za')
    = 'permission_request',
  'the basis is recorded on the message, not just checked');

-- s69(2) allows one approach. Not two.
select assert(
  not (select allowed from outreach_basis(:org, 'cfo@bigco.co.za', 'email')),
  'a second unconsented approach to the same address is refused');

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'outreach-test';
  begin
    insert into messages (org_id, channel, direction, to_address,
                          is_marketing, sent_at)
    values (v_org, 'email', 'outbound', 'cfo@bigco.co.za', true, now());
    raise exception 'FAILED: a second s69(2) approach was sent';
  exception when insufficient_privilege then
    raise notice 'passed: POPIA s69(2) allows one approach, and the second is refused';
  end;
end $$;

-- Someone who has said no cannot be asked again at all.
insert into contact_channels (org_id, subject_type, subject_id, channel, address,
                              jurisdiction, consent_refused_at)
values (:org, 'candidate', 'cd000000-0000-0000-0000-000000000001', 'email',
        'no@bigco.co.za', 'ZA', now());

select assert(
  not (select allowed from outreach_basis(:org, 'no@bigco.co.za', 'email')),
  'a contact who refused consent cannot be approached again');

-- Consent is the strongest basis there is.
insert into contact_channels (org_id, subject_type, subject_id, channel, address,
                              jurisdiction, opted_in, opted_in_at, opted_in_source)
values (:org, 'candidate', 'cd000000-0000-0000-0000-000000000001', 'email',
        'yes@bigco.co.za', 'ZA', true, now(), 'website form');

select assert(
  (select basis from outreach_basis(:org, 'yes@bigco.co.za', 'email')) = 'consent',
  'an opted-in South African contact can be emailed on consent');

-- An existing customer is the s69(3) exception.
insert into contact_channels (org_id, subject_type, subject_id, channel, address,
                              jurisdiction, existing_customer)
values (:org, 'candidate', 'cd000000-0000-0000-0000-000000000001', 'email',
        'client@bigco.co.za', 'ZA', true);

select assert(
  (select basis from outreach_basis(:org, 'client@bigco.co.za', 'email'))
    = 'existing_customer',
  'an existing customer falls under the s69(3) exception');

-- ---------------------------------------------------------------------------
-- Outside South Africa the method's own rule applies
-- ---------------------------------------------------------------------------
insert into contact_channels (org_id, subject_type, subject_id, channel, address,
                              jurisdiction)
values (:org, 'candidate', 'cd000000-0000-0000-0000-000000000001', 'email',
        'director@londonco.co.uk', 'UK');

select assert(
  (select basis from outreach_basis(:org, 'director@londonco.co.uk', 'email'))
    = 'legitimate_interest',
  'a UK corporate address is reachable on legitimate interest');

-- But not a personal mailbox, anywhere.
select assert(is_personal_address('someone@gmail.com'),
  'a free mailbox is recognised as a personal address');
select assert(not is_personal_address('cfo@bigco.co.za'),
  'a company domain is not');

insert into contact_channels (org_id, subject_type, subject_id, channel, address,
                              jurisdiction)
values (:org, 'candidate', 'cd000000-0000-0000-0000-000000000001', 'email',
        'director@gmail.com', 'UK');

select assert(
  not (select allowed from outreach_basis(:org, 'director@gmail.com', 'email')),
  'legitimate interest does not stretch to a personal mailbox');

-- ---------------------------------------------------------------------------
-- Suppression outranks everything
-- ---------------------------------------------------------------------------
update contact_channels set opted_out_at = now()
 where org_id = :org and address = 'yes@bigco.co.za';

select assert(is_suppressed(:org, 'yes@bigco.co.za', 'email'),
  'opting out on a channel suppresses the address');

select assert(
  not (select allowed from outreach_basis(:org, 'yes@bigco.co.za', 'email')),
  'and it outranks the consent that was already on file');

select assert(
  not (select allowed from outreach_basis(:org, 'yes@bigco.co.za', 'whatsapp')),
  'an opt-out crosses channels rather than applying to the one they used');

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'outreach-test';
  begin
    insert into messages (org_id, channel, direction, to_address,
                          is_marketing, sent_at)
    values (v_org, 'email', 'outbound', 'yes@bigco.co.za', true, now());
    raise exception 'FAILED: a suppressed address was emailed';
  exception when insufficient_privilege then
    raise notice 'passed: a suppressed address cannot be emailed';
  end;
end $$;

-- A suppression cannot be quietly undone.
do $$
begin
  if has_table_privilege('authenticated', 'suppressions', 'delete')
     or has_table_privilege('authenticated', 'suppressions', 'update') then
    raise exception 'FAILED: a suppression can be edited or deleted away';
  end if;
  raise notice 'passed: a suppression cannot be edited or deleted away';
end $$;

-- A message that is not marketing is not caught by any of this.
insert into messages (org_id, channel, direction, to_address, subject_line,
                      is_marketing, sent_at)
values (:org, 'email', 'outbound', 'yes@bigco.co.za',
        'Your interview on Thursday', false, now());
select assert(true,
  'an operational message to the same address still sends');

-- ---------------------------------------------------------------------------
-- A finished sequence stops
-- ---------------------------------------------------------------------------
insert into sequences (id, org_id, name, audience, active)
values ('5e000000-0000-0000-0000-000000000001', :org, 'BD outreach', 'client', true);
insert into sequence_enrolments (id, org_id, sequence_id, subject_type, subject_id,
                                 status, next_due_at)
values ('e0000000-0000-0000-0000-000000000001', :org,
        '5e000000-0000-0000-0000-000000000001', 'client',
        'cd000000-0000-0000-0000-000000000001', 'active', now());

update sequence_enrolments set status = 'completed'
 where id = 'e0000000-0000-0000-0000-000000000001';

select assert(
  (select next_due_at from sequence_enrolments
    where id = 'e0000000-0000-0000-0000-000000000001') is null,
  'a completed enrolment stops being due');
select assert(
  (select reengage_after from sequence_enrolments
    where id = 'e0000000-0000-0000-0000-000000000001') = current_date + 90,
  'and goes onto the ninety-day re-engagement list, as the method says');

-- ---------------------------------------------------------------------------
-- Cross-tenant and anon
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('0c000000-0000-0000-0000-00000000000d', 'outsider@elsewhere.test');
set local role authenticated;
set local request.jwt.claim.sub = '0c000000-0000-0000-0000-00000000000d';

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'outreach-test';
  begin
    perform * from outreach_basis(v_org, 'cfo@bigco.co.za', 'email');
    raise exception 'FAILED: an outsider probed another agency''s contact basis';
  exception when insufficient_privilege then
    raise notice 'passed: an outsider cannot probe another agency''s contact basis';
  end;
end $$;

reset role;

do $$
declare f text;
begin
  foreach f in array array[
    'outreach_basis(uuid, text, comms_channel, text, uuid)',
    'opt_out_suppresses()',
    'message_respects_marketing_rules()',
    'close_enrolment()',
    'sequence_activation_requires_identity()'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'FAILED: anon can execute %', f;
    end if;
  end loop;
  raise notice 'passed: none of the outreach functions are anon-callable';
end $$;

rollback;

\echo ''
\echo 'All outreach assertions passed.'
