-- ============================================================================
-- 016 — THE ROLE SCORECARD LIBRARY
--
-- Two executive scorecards ship with the platform, weighted as the assessment
-- method specifies. They are starting points. The weights are agreed with the
-- client at search initiation and adjusted per mandate — that agreement is
-- what stops the argument at shortlist presentation, so the copy a workspace
-- gets is editable and the catalogue entry is not.
--
-- Same shape as the agreement pack: the library is data, a workspace gets its
-- own copy, and editing a copy takes it out of our hands.
-- ============================================================================

create table system_scorecards (
  code        text primary key,
  name        text not null,
  description text,
  -- [{ key, label, weight, guidance }] — validated to sum to 100.
  criteria    jsonb not null check (scorecard_criteria_valid(criteria)),
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);

alter table system_scorecards enable row level security;
create policy system_scorecards_read on system_scorecards for select using (true);
grant select on system_scorecards to authenticated;

alter table scorecards
  add column if not exists system_code    text references system_scorecards(code),
  add column if not exists system_version int,
  add column if not exists is_system      boolean not null default false;

create unique index scorecards_one_per_system_code
  on scorecards (org_id, system_code) where system_code is not null and job_id is null;

insert into system_scorecards (code, name, description, criteria) values
('cfo', 'Chief Financial Officer',
 'Weighted for a CFO mandate: scope of financial leadership first, sector relevance second.',
 $j$[
  {"key":"financial_leadership","label":"Financial leadership scope (P&L, team size, budget)","weight":25,
   "guidance":"Scale indicators, not job titles. Budget owned, team size, revenue responsibility."},
  {"key":"sector_relevance","label":"Industry and sector relevance","weight":20,
   "guidance":"Regulatory environment and capital structure matter more than the industry label."},
  {"key":"strategic_contribution","label":"Strategic contribution evidence","weight":15,
   "guidance":"Decisions influenced or led, with the outcome. Not attendance at strategy meetings."},
  {"key":"stakeholder_board","label":"Stakeholder and board management","weight":15,
   "guidance":"Direct board exposure, audit committee, investors, lenders."},
  {"key":"qualifications","label":"Qualifications (CA(SA), ACCA, CFA, MBA)","weight":10,
   "guidance":"Professional standing and good standing with the body."},
  {"key":"geographic","label":"Geographic experience relevant to the role","weight":10,
   "guidance":"Jurisdictional and currency exposure the mandate actually needs."},
  {"key":"cultural_fit","label":"Cultural and leadership style fit","weight":5,
   "guidance":"Against the client's stated priorities, evidenced, not impression."}
 ]$j$::jsonb),

('chro', 'Chief Human Resources Officer',
 'Weighted for a CHRO mandate: transformation scope first, organisational design second.',
 $j$[
  {"key":"hr_leadership","label":"HR leadership scope and transformation experience","weight":25,
   "guidance":"Headcount covered, transformation programmes led, and what changed as a result."},
  {"key":"org_design","label":"Organisational design and change management","weight":20,
   "guidance":"Restructures delivered, and how the people side was handled."},
  {"key":"employment_relations","label":"Employment relations and labour law competence","weight":15,
   "guidance":"CCMA, bargaining councils, union engagement, retrenchment consultation."},
  {"key":"talent_succession","label":"Talent development and succession planning","weight":15,
   "guidance":"Succession depth built, not frameworks bought."},
  {"key":"cultural_alignment","label":"Cultural alignment with the client organisation","weight":10,
   "guidance":"Against the client's stated priorities, evidenced."},
  {"key":"qualifications","label":"Qualifications and professional memberships","weight":10,
   "guidance":"SABPP registration and standing where relevant."},
  {"key":"data_systems","label":"Data and systems literacy (HRIS, analytics)","weight":5,
   "guidance":"What they did with the data, not which system they used."}
 ]$j$::jsonb);

/**
 * Give a workspace its own editable copy of every library scorecard it does
 * not have, and bring forward the ones it has not edited.
 */
create or replace function sync_scorecard_library(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into scorecards (org_id, job_id, name, criteria, is_system,
                          system_code, system_version)
  select p_org, null, s.name, s.criteria, true, s.code, s.version
    from system_scorecards s
  on conflict (org_id, system_code) where system_code is not null and job_id is null
  do update set
       name           = excluded.name,
       criteria       = excluded.criteria,
       system_version = excluded.system_version
     where scorecards.is_system
       and scorecards.system_version is distinct from excluded.system_version;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * An agency that reweights a scorecard owns it. The sync bumps the version in
 * the same statement, which is how it exempts itself.
 */
create or replace function release_edited_scorecard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.criteria is distinct from old.criteria
     and new.system_version is not distinct from old.system_version then
    new.is_system := false;
  end if;
  return new;
end;
$$;

create trigger t_release_edited_scorecard
  before update of criteria on scorecards
  for each row execute function release_edited_scorecard();

-- Install with every new workspace, and top up the ones that exist.
create or replace function create_organisation(
  p_name   text,
  p_slug   text,
  p_region region_code default 'ZA'
) returns organisations
language plpgsql security definer set search_path = public as $$
declare
  v_org      organisations;
  v_plan     uuid;
  v_currency char(3);
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_currency := default_currency_for_region(p_region);

  insert into organisations (name, legal_name, slug, region, currency, locale, timezone)
  values (
    p_name, p_name,
    lower(p_slug),
    p_region,
    v_currency,
    case p_region when 'ZA' then 'en-ZA' when 'UK' then 'en-GB' else 'en' end,
    case p_region
      when 'ZA' then 'Africa/Johannesburg'
      when 'UK' then 'Europe/London'
      when 'AE' then 'Asia/Dubai'
      when 'US' then 'America/New_York'
      when 'AU' then 'Australia/Sydney'
      else 'UTC' end
  )
  returning * into v_org;

  insert into memberships (org_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  perform seed_default_pipeline(v_org.id);
  perform seed_default_automations(v_org.id);
  perform seed_document_pack(v_org.id);
  perform sync_scorecard_library(v_org.id);

  insert into careers_sites (org_id, headline, meta_title, meta_description)
  values (
    v_org.id,
    'Careers at ' || p_name,
    left('Careers at ' || p_name, 60),
    left('Open roles at ' || p_name || '. Apply in minutes — we reply to every application.', 160)
  );

  select id into v_plan from pricing_plans where code = 'starter';
  if not exists (select 1 from plan_prices where plan_id = v_plan and currency = v_currency) then
    v_currency := 'USD';
  end if;

  insert into subscriptions (org_id, plan_id, currency, status, trial_ends_at)
  values (v_org.id, v_plan, v_currency, 'trialing', now() + interval '14 days');

  insert into audit_log (org_id, actor_id, entity_type, entity_id, action, new_value)
  values (v_org.id, auth.uid(), 'organisation', v_org.id, 'created',
          jsonb_build_object('name', p_name, 'region', p_region, 'currency', v_currency));

  return v_org;
end;
$$;

do $$
declare o record;
begin
  for o in select id from organisations loop
    perform sync_scorecard_library(o.id);
  end loop;
end $$;

revoke all on function create_organisation(text, text, region_code) from public;
grant execute on function create_organisation(text, text, region_code) to authenticated;
revoke execute on function sync_scorecard_library(uuid)   from public, anon, authenticated;
revoke execute on function release_edited_scorecard()     from public, anon, authenticated;
