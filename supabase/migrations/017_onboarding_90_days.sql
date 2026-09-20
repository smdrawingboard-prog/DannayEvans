-- ============================================================================
-- 017 — PLACEMENT ONBOARDING AND THE 90-DAY CHECK-IN SCHEDULE
--
-- Most agencies lose the candidate at the point of placement. The five
-- check-ins are what stops that, so they are scheduled by the database when
-- the placement is created rather than by someone remembering.
--
-- Two things the schedule has to get right:
--
--   Start dates slip. Dates are computed from the placement's start date and
--   recomputed when it moves, but only for check-ins that have not been sent:
--   a message already delivered cannot be un-sent by editing a date.
--
--   The day-90 message asks for referrals. That is direct marketing under
--   POPIA s69 and PECR in the UK, however warmly it is phrased, and it is
--   not covered by the consent to be contacted about the placement itself.
--   So it is marked as solicitation and held back unless the candidate has
--   opted in on that channel.
-- ============================================================================

alter table placements
  add column if not exists reporting_line         text,
  add column if not exists team_size              int check (team_size >= 0),
  add column if not exists international_placement boolean not null default false,
  add column if not exists destination_country    text,
  -- The candidate fills this in during week one; we pre-populate what we know.
  add column if not exists stakeholder_map        jsonb not null default '[]'::jsonb,
  add column if not exists onboarding_generated_at timestamptz,
  -- An international placement has to say where to.
  add constraint placements_destination_when_international
    check (not international_placement or destination_country is not null);

alter table onboarding_checkins
  add column if not exists template_key  text,
  -- True where the message asks the candidate for something for us, rather
  -- than asking after them. Those need marketing consent, not service consent.
  add column if not exists is_solicitation boolean not null default false,
  add column if not exists held_reason   text;

-- The method specifies five touch points, not the four this table was built
-- for. Nothing has been scheduled yet, so the set can simply be stated.
alter table onboarding_checkins
  add constraint onboarding_checkin_known_offset
  check (day_offset in (3, 10, 30, 60, 90));

-- ---------------------------------------------------------------------------
-- The five messages, seeded per workspace so an agency can reword them
-- ---------------------------------------------------------------------------
create or replace function seed_onboarding_templates(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into message_templates (org_id, name, channel, body, merge_keys, category)
  select p_org, v.name, 'whatsapp'::comms_channel, v.body,
         array['candidate_first_name'], v.category
    from (values
      ('Onboarding check-in — day 3',
       'service',
       $m$Hi {{candidate_first_name}}, just checking in — how has the first few days been? Any surprises or anything you need from our side? Here if you need anything at all.$m$),
      ('Onboarding check-in — day 10',
       'service',
       $m$Hi {{candidate_first_name}}, hope you are settling in well. How is the team dynamic feeling? Anything I can help with at this stage? Would love to hear how it is going.$m$),
      ('Onboarding check-in — day 30',
       'service',
       $m$Hi {{candidate_first_name}}, a month in — well done. How are you feeling about the role? Is it matching what we discussed? Any concerns or gaps we should know about? Happy to grab a call this week if useful.$m$),
      ('Onboarding check-in — day 60',
       'service',
       $m$Hi {{candidate_first_name}}, two months in — you are doing brilliantly by all accounts. How are the first wins shaping up? And on a personal note, are you happy with the move? I always like to check in properly at this stage.$m$),
      ('Onboarding check-in — day 90',
       'solicitation',
       $m$Hi {{candidate_first_name}}, three months — that went quickly. Really glad the placement has worked out. I would love to have a proper catch-up call this month. And if there is anyone in your network who might benefit from what we do, I would be very grateful for an introduction. No pressure at all — just keeping in touch.$m$)
    ) as v(name, category, body)
  where not exists (
    select 1 from message_templates m
     where m.org_id = p_org and m.name = v.name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------

/**
 * Whether a candidate may be sent a message on a channel, and whether that
 * extends to messages that ask something of them.
 *
 * Service messages about their own placement rest on the recruitment
 * relationship. A referral request does not: it is direct marketing, and
 * POPIA s69 wants consent for it specifically.
 */
create or replace function candidate_channel_open(
  p_org uuid, p_candidate uuid, p_channel comms_channel, p_solicitation boolean
) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  -- Definer rights, so the caller's membership is checked explicitly.
  perform assert_org_access(p_org);

  return exists (
    select 1 from contact_channels c
     where c.org_id = p_org
       and c.subject_type = 'candidate'
       and c.subject_id = p_candidate
       and c.channel = p_channel
       and c.opted_out_at is null
       and (not p_solicitation or c.opted_in)
  );
end;
$$;

/**
 * Lay down the five check-ins for a placement, dated from the start date.
 *
 * Re-runnable: a start date that moves shifts the check-ins that have not
 * gone out and leaves the ones that have. Returns how many rows it touched.
 */
create or replace function schedule_onboarding_checkins(p_placement uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  p          record;
  v_cand     uuid;
  v_touched  int := 0;
  v_rows     int;
  d          record;
begin
  select pl.*, a.candidate_id
    into p
    from placements pl
    join applications a on a.id = pl.application_id
   where pl.id = p_placement;

  if not found then
    raise exception 'placement not found';
  end if;
  perform assert_org_access(p.org_id);
  if p.start_date is null then
    -- Nothing to count from yet. The trigger will call again once it is set.
    return 0;
  end if;
  v_cand := p.candidate_id;

  for d in select * from (values (3, false), (10, false), (30, false),
                                 (60, false), (90, true))
                           as t(offset_days, solicits)
  loop
    insert into onboarding_checkins
      (org_id, placement_id, day_offset, due_on, channel,
       template_key, is_solicitation, held_reason)
    values (
      p.org_id, p_placement, d.offset_days,
      p.start_date + d.offset_days, 'whatsapp',
      'onboarding_day_' || d.offset_days, d.solicits,
      case when d.solicits
             and not candidate_channel_open(p.org_id, v_cand, 'whatsapp', true)
           then 'awaiting marketing consent on WhatsApp'
      end
    )
    on conflict (placement_id, day_offset) do update
       set due_on = excluded.due_on
     where onboarding_checkins.sent_at is null;

    get diagnostics v_rows = row_count;
    v_touched := v_touched + v_rows;
  end loop;

  return v_touched;
end;
$$;

create or replace function t_placement_schedules_onboarding()
returns trigger language plpgsql set search_path = public as $$
begin
  perform schedule_onboarding_checkins(new.id);
  return new;
end;
$$;

create trigger t_placement_onboarding
  after insert or update of start_date on placements
  for each row execute function t_placement_schedules_onboarding();

-- ---------------------------------------------------------------------------
-- A check-in cannot be marked sent if the channel is closed
-- ---------------------------------------------------------------------------
create or replace function checkin_respects_consent()
returns trigger language plpgsql set search_path = public as $$
declare v_cand uuid; v_org uuid;
begin
  if new.sent_at is null then return new; end if;

  select pl.org_id, a.candidate_id into v_org, v_cand
    from placements pl
    join applications a on a.id = pl.application_id
   where pl.id = new.placement_id;

  if not candidate_channel_open(v_org, v_cand, new.channel::comms_channel,
                                new.is_solicitation) then
    raise exception
      'the candidate has not opted in to % on this channel',
      case when new.is_solicitation then 'messages asking for referrals'
           else 'being contacted' end
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger t_checkin_respects_consent
  before insert or update of sent_at on onboarding_checkins
  for each row execute function checkin_respects_consent();

-- ---------------------------------------------------------------------------
-- Relocation briefings carry a standing disclaimer
-- ---------------------------------------------------------------------------
alter table mobility_briefings
  add column if not exists disclaimer text not null default
    'General information only. This is not legal, tax, or immigration advice. '
    'Take independent professional advice on visa, tax, and legal matters '
    'before acting on any of it.';

-- An international placement needs a briefing before the candidate travels.
create or replace function placement_needs_briefing(p_placement uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from placements where id = p_placement;
  if v_org is null then return false; end if;
  perform assert_org_access(v_org);

  return exists (
    select 1 from placements pl
     where pl.id = p_placement
       and pl.international_placement
       and not exists (
         select 1 from mobility_briefings b where b.placement_id = pl.id
       )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Install with every workspace
-- ---------------------------------------------------------------------------
/**
 * Everything this migration adds to a new workspace, in one idempotent call.
 *
 * Hung off a trigger rather than added to create_organisation: that function
 * has now been rewritten three times to bolt on another seeding step, which
 * is a sign the seeding does not belong inside it.
 */
create or replace function seed_onboarding_workspace(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform seed_onboarding_templates(p_org);

  insert into automations (org_id, name, trigger_key, conditions, actions)
  select p_org, 'Run the 90-day onboarding schedule on every placement',
         'placement.created', '{}'::jsonb,
         '[{"type":"schedule_checkins","offsets":[3,10,30,60,90]},
           {"type":"notify","target":"admin",
            "message":"Placement confirmed. Onboarding plan generated, check-in schedule active."}]'::jsonb
  where not exists (
    select 1 from automations a
     where a.org_id = p_org and a.trigger_key = 'placement.created'
  );
end;
$$;

create or replace function t_organisation_seeds_onboarding()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform seed_onboarding_workspace(new.id);
  return new;
end;
$$;

create trigger t_organisation_onboarding_seed
  after insert on organisations
  for each row execute function t_organisation_seeds_onboarding();

do $$
declare o record;
begin
  for o in select id from organisations loop
    perform seed_onboarding_workspace(o.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and PostgREST
-- publishes anything `anon` can execute. Migration 010 set a default-privileges
-- rule to stop that, but the rule only binds functions created later by the
-- role that set it, and migrations do not all run as the same role — so it has
-- silently failed to cover 011, 015 and 017 in turn.
--
-- Rather than remember an explicit revoke for each new function, sweep the
-- ones this migration adds and grant back only what is meant to be callable.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'candidate_channel_open(uuid, uuid, comms_channel, boolean)',
    'placement_needs_briefing(uuid)',
    'schedule_onboarding_checkins(uuid)',
    'seed_onboarding_templates(uuid)',
    'seed_onboarding_workspace(uuid)',
    't_organisation_seeds_onboarding()',
    't_placement_schedules_onboarding()',
    'checkin_respects_consent()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Callable by a signed-in member. Each one asserts membership itself, because
-- being signed in somewhere is not the same as being signed in here.
grant execute on function candidate_channel_open(uuid, uuid, comms_channel, boolean) to authenticated;
grant execute on function placement_needs_briefing(uuid)      to authenticated;
grant execute on function schedule_onboarding_checkins(uuid)  to authenticated;
