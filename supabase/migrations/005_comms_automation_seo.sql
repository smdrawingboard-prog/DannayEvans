-- ============================================================================
-- 005 — COMMUNICATIONS, AUTOMATION, CAREERS SITE, INTEGRATIONS
-- ============================================================================

create type comms_channel as enum ('whatsapp', 'email', 'sms', 'linkedin', 'call');
create type message_direction as enum ('outbound', 'inbound');
create type message_state as enum
  ('queued','sent','delivered','read','replied','failed','bounced','unsubscribed');

-- ---------------------------------------------------------------------------
-- Contact channel consent. A single opt-out must silence every sequence,
-- so consent lives on the contact point rather than inside each campaign.
-- ---------------------------------------------------------------------------
create table contact_channels (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  subject_type  text not null check (subject_type in ('candidate','client','deal')),
  subject_id    uuid not null,
  channel       comms_channel not null,
  address       text not null,         -- phone in E.164, or an email address
  opted_in      boolean not null default false,
  opted_in_at   timestamptz,
  opted_in_source text,                -- how consent was obtained, for POPIA/GDPR
  opted_out_at  timestamptz,
  verified      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (org_id, channel, address, subject_id)
);
create index on contact_channels (org_id, subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- Templates and sequences
-- ---------------------------------------------------------------------------
create table message_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  channel     comms_channel not null,
  -- WhatsApp Cloud API template name, once Meta has approved it.
  provider_template_name text,
  subject     text,
  body        text not null,           -- {{merge_key}} placeholders
  merge_keys  text[] not null default '{}',
  category    text,
  approved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table sequences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  audience    text not null check (audience in ('candidate','client','deal')),
  active      boolean not null default false,
  -- Stop the whole sequence the moment the contact replies.
  stop_on_reply boolean not null default true,
  -- Send windows, respecting the organisation's timezone. Avoids the
  -- 06:00 WhatsApp that gets an agency blocked.
  send_window_start time not null default '08:00',
  send_window_end   time not null default '18:00',
  send_weekdays_only boolean not null default true,
  created_at  timestamptz not null default now()
);

create table sequence_steps (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  sequence_id uuid not null references sequences(id) on delete cascade,
  position    int not null,
  delay_days  int not null default 0,
  channel     comms_channel not null,
  template_id uuid references message_templates(id) on delete set null,
  unique (sequence_id, position)
);

create table sequence_enrolments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  sequence_id  uuid not null references sequences(id) on delete cascade,
  subject_type text not null,
  subject_id   uuid not null,
  current_step int not null default 0,
  next_due_at  timestamptz,
  status       text not null default 'active'
                 check (status in ('active','completed','stopped','replied','bounced')),
  enrolled_at  timestamptz not null default now(),
  unique (sequence_id, subject_id)
);
create index on sequence_enrolments (org_id, status, next_due_at);

-- ---------------------------------------------------------------------------
-- Message log — every outbound and inbound message, whatever the channel
-- ---------------------------------------------------------------------------
create table messages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  subject_type  text,
  subject_id    uuid,
  channel       comms_channel not null,
  direction     message_direction not null,
  state         message_state not null default 'queued',
  to_address    text,
  from_address  text,
  subject_line  text,
  body          text,
  template_id   uuid references message_templates(id) on delete set null,
  enrolment_id  uuid references sequence_enrolments(id) on delete set null,
  provider      text,
  provider_ref  text,
  error         text,
  scheduled_for timestamptz,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  read_at       timestamptz,
  replied_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index on messages (org_id, created_at desc);
create index on messages (org_id, state, scheduled_for) where direction = 'outbound';
create index on messages (provider, provider_ref);

-- ---------------------------------------------------------------------------
-- Automation rules — the "pre-built workflows" every tenant gets on day one
-- ---------------------------------------------------------------------------
create table automations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  -- e.g. 'application.stage_changed', 'envelope.completed', 'deal.won',
  --      'application.stalled', 'placement.created', 'schedule.weekly'
  trigger_key text not null,
  conditions  jsonb not null default '{}'::jsonb,
  -- [{ type: 'send_message'|'create_envelope'|'notify'|'move_stage'|'create_task', ... }]
  actions     jsonb not null default '[]'::jsonb,
  active      boolean not null default true,
  last_run_at timestamptz,
  run_count   int not null default 0,
  created_at  timestamptz not null default now()
);
create index on automations (org_id, trigger_key) where active;

create table automation_runs (
  id            bigserial primary key,
  org_id        uuid not null references organisations(id) on delete cascade,
  automation_id uuid not null references automations(id) on delete cascade,
  trigger_payload jsonb,
  status        text not null check (status in ('success','failed','skipped')),
  error         text,
  ran_at        timestamptz not null default now()
);
create index on automation_runs (automation_id, ran_at desc);

-- Default automations, installed with every new organisation.
create or replace function seed_default_automations(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into automations (org_id, name, trigger_key, conditions, actions) values
    (p_org, 'Acknowledge every application within the hour',
     'application.created', '{}'::jsonb,
     '[{"type":"send_message","channel":"email","template":"application_received","delay_minutes":0}]'::jsonb),

    (p_org, 'Nudge a stalled application',
     'application.stalled', '{"sla_breached":true}'::jsonb,
     '[{"type":"notify","target":"owner","message":"{{candidate_name}} has sat in {{stage_name}} for {{days}} days"}]'::jsonb),

    (p_org, 'Send the offer pack for signature when the stage hits Offer',
     'application.stage_changed', '{"to_stage":"Offer"}'::jsonb,
     '[{"type":"create_envelope","template_category":"offer_letter","subject_type":"application"}]'::jsonb),

    (p_org, 'Start the 90-day check-ins once a contract is signed',
     'envelope.completed', '{"subject_type":"placement"}'::jsonb,
     '[{"type":"schedule_checkins","offsets":[7,30,60,90],"channel":"whatsapp"}]'::jsonb),

    (p_org, 'Chase an unsigned document after three days',
     'envelope.unsigned', '{"days_outstanding":3}'::jsonb,
     '[{"type":"remind_envelope"},{"type":"notify","target":"owner"}]'::jsonb),

    (p_org, 'Publish a new open role to the careers site and social queue',
     'job.published', '{}'::jsonb,
     '[{"type":"reindex_careers_site"},{"type":"queue_social_posts","platforms":["linkedin","facebook","instagram"]}]'::jsonb),

    (p_org, 'Weekly pipeline digest to owners and admins',
     'schedule.weekly', '{"weekday":1,"hour":9}'::jsonb,
     '[{"type":"generate_report","report":"pipeline_digest"},{"type":"notify","target":"admins"}]'::jsonb)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Careers microsite — one public, indexable site per tenant.
-- SEO and AI-answer-engine visibility are product features, not an add-on.
-- ---------------------------------------------------------------------------
create table careers_sites (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null unique references organisations(id) on delete cascade,
  enabled         boolean not null default true,
  custom_domain   citext unique,
  headline        text,
  intro_md        text,
  about_md        text,
  -- Answer-engine optimisation: a plain question-and-answer block is the
  -- single most reliably quoted format for ChatGPT, Perplexity and AI
  -- Overviews, and it earns an FAQPage rich result at the same time.
  faq             jsonb not null default '[]'::jsonb,
  meta_title      text check (char_length(meta_title) <= 60),
  meta_description text check (char_length(meta_description) <= 160),
  og_image_url    text,
  primary_keyword text,
  google_site_verification text,
  analytics_id    text,
  -- Applications from the public site land here before entering the pipeline.
  auto_acknowledge boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AI assist runs. Every generated artefact (JD rewrite, CV reformat, interview
-- pack, mobility briefing, outreach draft) is logged so output is auditable
-- and a human approval step is always recorded.
-- ---------------------------------------------------------------------------
create table assist_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  assistant_key text not null,          -- see lib/assist/registry.ts
  subject_type  text,
  subject_id    uuid,
  input         jsonb not null default '{}'::jsonb,
  output_md     text,
  model         text,
  token_cost    int,
  requested_by  uuid references profiles(id),
  approved_by   uuid references profiles(id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on assist_runs (org_id, assistant_key, created_at desc);

-- ---------------------------------------------------------------------------
-- Third-party integrations. Credentials are never stored here — this table
-- holds configuration and sync state only; secrets live in Supabase Vault and
-- are read server-side.
-- ---------------------------------------------------------------------------
create table integrations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  provider       text not null,   -- 'whatsapp'|'hubspot'|'pipedrive'|'salesforce'|
                                  -- 'bullhorn'|'linkedin'|'apify'|'pandadoc'|'sendgrid'
  enabled        boolean not null default false,
  sync_direction text not null default 'push'
                   check (sync_direction in ('push','pull','bidirectional')),
  config         jsonb not null default '{}'::jsonb,
  vault_secret_id uuid,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  unique (org_id, provider)
);

-- ---------------------------------------------------------------------------
-- Extend organisation creation to install the default pipeline and automations
-- ---------------------------------------------------------------------------
create or replace function create_organisation(
  p_name   text,
  p_slug   text,
  p_region region_code default 'ZA'
) returns organisations
language plpgsql security definer set search_path = public as $$
declare
  v_org organisations;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into organisations (name, slug, region, currency, locale, timezone)
  values (
    p_name,
    lower(p_slug),
    p_region,
    default_currency_for_region(p_region),
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

  insert into careers_sites (org_id, headline, meta_title, meta_description)
  values (
    v_org.id,
    'Careers at ' || p_name,
    left('Careers at ' || p_name, 60),
    left('Open roles at ' || p_name || '. Apply in minutes — we reply to every application.', 160)
  );

  insert into audit_log (org_id, actor_id, entity_type, entity_id, action, new_value)
  values (v_org.id, auth.uid(), 'organisation', v_org.id, 'created',
          jsonb_build_object('name', p_name, 'region', p_region));

  return v_org;
end;
$$;

revoke all on function create_organisation(text, text, region_code) from public;
grant execute on function create_organisation(text, text, region_code) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'contact_channels','message_templates','sequences','sequence_steps',
    'sequence_enrolments','messages','automations','automation_runs',
    'careers_sites','assist_runs','integrations'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (org_id in (select current_org_ids()))
         with check (org_id in (select current_org_ids()))',
      t || '_member', t);
  end loop;
end $$;

-- The public careers site is served by the server with the service role and a
-- published-only filter, so no anonymous policy is granted here.
