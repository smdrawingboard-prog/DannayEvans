-- ============================================================================
-- 018 — COLD OUTREACH: SUPPRESSION, LAWFUL BASIS, SENDER IDENTITY
--
-- The outreach method covers UK GDPR, CAN-SPAM and CASL. It does not cover
-- POPIA, and the rule it states for the UK — that B2B cold email to a
-- corporate address is generally fine under legitimate interest — is not the
-- South African position.
--
-- POPIA s69 prohibits direct marketing by electronic communication unless the
-- data subject has consented, or is an existing customer being marketed
-- similar goods and services (s69(3)). Where neither applies, the responsible
-- party may approach the data subject ONCE to request that consent, and only
-- if consent has not previously been refused (s69(2)). Section 1 defines a
-- data subject to include a juristic person, so "it is B2B" does not carry
-- the exemption across the way it does under UK GDPR.
--
-- So the basis for every marketing send is recorded, the South African rule
-- is enforced rather than documented, and the one permitted approach is
-- counted so it can only happen once.
-- ============================================================================

create type marketing_basis as enum (
  'consent',             -- opted in, on this channel
  'existing_customer',   -- POPIA s69(3) / soft opt-in
  'legitimate_interest', -- UK GDPR B2B, corporate address, role-relevant
  'permission_request'   -- POPIA s69(2): the single approach asking to opt in
);

-- ---------------------------------------------------------------------------
-- Sender identity. All three regimes require it, and a sequence that cannot
-- produce it should not be sending.
-- ---------------------------------------------------------------------------
alter table organisations
  add column if not exists postal_address   text,
  add column if not exists sender_name      text,
  add column if not exists unsubscribe_url  text;

/**
 * Whether this workspace can legally put its name at the foot of an email.
 */
create or replace function org_can_send_marketing(p_org uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from organisations o
     where o.id = p_org
       and coalesce(o.legal_name, o.name) <> ''
       and coalesce(o.postal_address, '') <> ''
       and coalesce(o.unsubscribe_url, '') <> ''
  );
$$;

-- ---------------------------------------------------------------------------
-- Suppression. An opt-out is permanent, crosses channels, and outranks
-- everything else including a later apparent consent.
-- ---------------------------------------------------------------------------
create table suppressions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  -- Normalised: lower-cased email, or E.164 phone.
  address    text not null,
  channel    comms_channel,            -- null suppresses every channel
  reason     text not null default 'opted_out'
               check (reason in ('opted_out','bounced','complained','manual','do_not_contact')),
  source     text,
  created_at timestamptz not null default now(),
  unique (org_id, address, channel)
);
create index on suppressions (org_id, address);

alter table suppressions enable row level security;
create policy suppressions_member on suppressions for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));
grant select, insert on suppressions to authenticated;
-- A suppression is not something anyone gets to take back by editing a row.
revoke update, delete on suppressions from authenticated;

create or replace function is_suppressed(p_org uuid, p_address text, p_channel comms_channel)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from suppressions s
     where s.org_id = p_org
       and s.address = lower(trim(p_address))
       and (s.channel is null or s.channel = p_channel)
  );
$$;

-- Opting out on a contact channel suppresses the address everywhere.
create or replace function opt_out_suppresses()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.opted_out_at is not null
     and (old.opted_out_at is null or tg_op = 'INSERT') then
    insert into suppressions (org_id, address, channel, reason, source)
    values (new.org_id, lower(trim(new.address)), null, 'opted_out', 'contact_channel')
    on conflict (org_id, address, channel) do nothing;
  end if;
  return new;
end;
$$;

create trigger t_opt_out_suppresses
  after insert or update of opted_out_at on contact_channels
  for each row execute function opt_out_suppresses();

-- ---------------------------------------------------------------------------
-- Which jurisdiction's rule applies, and whether the address is a personal one
-- ---------------------------------------------------------------------------
alter table contact_channels
  add column if not exists jurisdiction      text,
  -- POPIA s69(3): an existing customer may be sent similar offerings.
  add column if not exists existing_customer boolean not null default false,
  -- Recorded separately from opted_in: someone who has said no cannot be
  -- asked again under s69(2).
  add column if not exists consent_refused_at timestamptz;

/**
 * A free mailbox is a personal address, and cold marketing to one has no
 * legitimate-interest cover in any of these regimes.
 */
create or replace function is_personal_address(p_address text)
returns boolean language sql immutable parallel safe
set search_path = pg_catalog, public as $$
  select lower(split_part(trim(p_address), '@', 2)) = any (array[
    'gmail.com','googlemail.com','outlook.com','hotmail.com','hotmail.co.uk',
    'live.com','msn.com','yahoo.com','yahoo.co.uk','ymail.com','icloud.com',
    'me.com','mac.com','aol.com','proton.me','protonmail.com','gmx.com',
    'mail.com','webmail.co.za','vodamail.co.za','telkomsa.net','mweb.co.za'
  ]);
$$;

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
alter table messages
  add column if not exists is_marketing boolean not null default false,
  add column if not exists basis        marketing_basis,
  add column if not exists basis_note   text;

/**
 * Whether a marketing message may go to this address, and on what basis.
 *
 * Returns the basis rather than just a yes or no, because the basis is what
 * has to be recorded: an information regulator asking "why did you email
 * this person" is asking for this answer.
 */
create or replace function outreach_basis(
  p_org uuid, p_address text, p_channel comms_channel,
  p_subject_type text default null, p_subject_id uuid default null
) returns table (allowed boolean, basis marketing_basis, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  ch            record;
  v_jurisdiction text;
  v_asked_before int;
begin
  perform assert_org_access(p_org);

  if not org_can_send_marketing(p_org) then
    allowed := false; basis := null;
    reason := 'the workspace has no legal name, postal address or unsubscribe link set';
    return next; return;
  end if;

  -- An opt-out outranks everything, including a later apparent consent.
  if is_suppressed(p_org, p_address, p_channel) then
    allowed := false; basis := null;
    reason := 'this address is suppressed';
    return next; return;
  end if;

  select * into ch from contact_channels c
   where c.org_id = p_org
     and c.channel = p_channel
     and lower(trim(c.address)) = lower(trim(p_address))
     and (p_subject_id is null or c.subject_id = p_subject_id)
   order by c.opted_in desc
   limit 1;

  v_jurisdiction := upper(coalesce(ch.jurisdiction,
    (select region::text from organisations where id = p_org)));

  -- Consent, wherever they are, is the strongest basis there is.
  if coalesce(ch.opted_in, false) then
    allowed := true; basis := 'consent';
    reason := 'opted in on this channel';
    return next; return;
  end if;

  if coalesce(ch.existing_customer, false) then
    allowed := true; basis := 'existing_customer';
    reason := 'existing customer, similar services (POPIA s69(3) / soft opt-in)';
    return next; return;
  end if;

  -- POPIA s69: no electronic direct marketing without consent or an existing
  -- customer relationship. One approach is allowed to ask for that consent,
  -- and not even that if consent has already been refused.
  if v_jurisdiction = 'ZA' then
    if ch.consent_refused_at is not null then
      allowed := false; basis := null;
      reason := 'consent was refused; POPIA s69(2) does not allow asking again';
      return next; return;
    end if;

    select count(*) into v_asked_before
      from messages m
     where m.org_id = p_org
       and m.is_marketing
       and m.basis = 'permission_request'
       and lower(trim(m.to_address)) = lower(trim(p_address))
       and m.sent_at is not null;

    if v_asked_before > 0 then
      allowed := false; basis := null;
      reason := 'POPIA s69(2) allows one approach to request consent, and it has been used';
      return next; return;
    end if;

    allowed := true; basis := 'permission_request';
    reason := 'POPIA s69(2): a single approach requesting consent';
    return next; return;
  end if;

  -- Elsewhere, B2B legitimate interest, but not to a personal mailbox.
  if is_personal_address(p_address) then
    allowed := false; basis := null;
    reason := 'personal mailbox: legitimate interest does not cover it';
    return next; return;
  end if;

  allowed := true; basis := 'legitimate_interest';
  reason := 'B2B corporate address, role-relevant (UK GDPR legitimate interest)';
  return next;
end;
$$;

/**
 * Refuse to mark a marketing message sent unless a basis holds for it, and
 * record which one.
 */
create or replace function message_respects_marketing_rules()
returns trigger language plpgsql set search_path = public as $$
declare r record;
begin
  if new.direction <> 'outbound' or not new.is_marketing then return new; end if;
  if new.sent_at is null then return new; end if;
  if new.to_address is null then
    raise exception 'a marketing message needs an address';
  end if;

  select * into r from outreach_basis(new.org_id, new.to_address, new.channel,
                                      new.subject_type, new.subject_id);
  if not r.allowed then
    raise exception 'cannot send: %', r.reason
      using errcode = 'insufficient_privilege';
  end if;

  new.basis := r.basis;
  new.basis_note := r.reason;
  return new;
end;
$$;

create trigger t_message_marketing_rules
  before insert or update of sent_at on messages
  for each row execute function message_respects_marketing_rules();

-- ---------------------------------------------------------------------------
-- A finished sequence stops. It does not quietly loop.
-- ---------------------------------------------------------------------------
alter table sequence_enrolments
  add column if not exists reengage_after date,
  add column if not exists stopped_reason text;

alter table sequence_enrolments
  drop constraint if exists sequence_enrolments_status_check;
alter table sequence_enrolments
  add constraint sequence_enrolments_status_check
  check (status in ('active','completed','stopped','replied','bounced','suppressed'));

/**
 * When an enrolment finishes or is stopped, set the date it may be picked up
 * again. The method says ninety days, and "do not continue to email".
 */
create or replace function close_enrolment()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    new.next_due_at := null;
    if new.reengage_after is null and new.status in ('completed','stopped') then
      new.reengage_after := current_date + 90;
    end if;
  end if;
  return new;
end;
$$;

create trigger t_close_enrolment
  before update of status on sequence_enrolments
  for each row execute function close_enrolment();

-- A sequence cannot be switched on by a workspace that cannot identify itself.
create or replace function sequence_activation_requires_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.active and not coalesce(old.active, false) then
    if not org_can_send_marketing(new.org_id) then
      raise exception
        'set the legal name, postal address and unsubscribe link before activating a sequence'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger t_sequence_activation_identity
  before insert or update of active on sequences
  for each row execute function sequence_activation_requires_identity();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'org_can_send_marketing(uuid)',
    'is_suppressed(uuid, text, comms_channel)',
    'is_personal_address(text)',
    'outreach_basis(uuid, text, comms_channel, text, uuid)',
    'opt_out_suppresses()',
    'message_respects_marketing_rules()',
    'close_enrolment()',
    'sequence_activation_requires_identity()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function org_can_send_marketing(uuid)                        to authenticated;
grant execute on function is_suppressed(uuid, text, comms_channel)            to authenticated;
grant execute on function is_personal_address(text)                           to authenticated;
grant execute on function outreach_basis(uuid, text, comms_channel, text, uuid) to authenticated;
