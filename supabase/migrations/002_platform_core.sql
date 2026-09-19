-- ============================================================================
-- 002 — PLATFORM CORE
-- Multi-tenant foundation: organisations, members, roles, regional config.
--
-- Tenancy model: every business-domain row carries org_id. Access is granted
-- only through a membership row. RLS is forced on every table; there is no
-- code path in the application that can read across tenants.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Region drives currency, data-protection regime, and default comms channel.
-- 'ZA' -> ZAR / POPIA / WhatsApp-first. 'UK' -> GBP / UK GDPR / email-first.
create type region_code as enum ('ZA', 'UK', 'EU', 'AE', 'US', 'AU', 'GLOBAL');

create type org_role as enum (
  'owner',      -- billing + everything
  'admin',      -- everything except billing
  'recruiter',  -- own candidates and mandates
  'sales',      -- own deals
  'viewer',     -- read-only
  'client'      -- external hiring manager, scoped to shared mandates only
);

create type plan_tier as enum ('trial', 'solo', 'team', 'growth', 'agency');

-- ---------------------------------------------------------------------------
-- Organisations (tenants)
-- ---------------------------------------------------------------------------
create table organisations (
  id              uuid primary key default gen_random_uuid(),
  slug            citext not null unique
                    check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name            text not null,
  region          region_code not null default 'ZA',
  currency        char(3) not null default 'ZAR',
  locale          text not null default 'en-ZA',
  timezone        text not null default 'Africa/Johannesburg',

  -- Branding, used by the tenant careers microsite and by signature envelopes.
  logo_url        text,
  brand_primary   text default '#2C3E50',
  website_url     text,
  support_email   citext,
  whatsapp_number text,

  -- Billing
  plan            plan_tier not null default 'trial',
  trial_ends_at   timestamptz default (now() + interval '14 days'),
  seats_purchased int not null default 1 check (seats_purchased > 0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table organisations is
  'One tenant. Region drives currency, privacy regime and default comms channel.';

-- Keep currency and region coherent unless deliberately overridden.
create or replace function default_currency_for_region(r region_code)
returns char(3) language sql immutable as $$
  select case r
    when 'ZA' then 'ZAR' when 'UK' then 'GBP' when 'EU' then 'EUR'
    when 'AE' then 'AED' when 'US' then 'USD' when 'AU' then 'AUD'
    else 'USD' end::char(3)
$$;

-- ---------------------------------------------------------------------------
-- Profiles — one row per auth user, shared across organisations
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       citext not null,
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Memberships — the only bridge between a user and a tenant
-- ---------------------------------------------------------------------------
create table memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       org_role not null default 'recruiter',
  job_title  text,
  active     boolean not null default true,
  invited_by uuid references profiles(id),
  joined_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index on memberships (user_id) where active;
create index on memberships (org_id) where active;

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  email       citext not null,
  role        org_role not null default 'recruiter',
  token_hash  text not null unique,
  invited_by  uuid references profiles(id),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on invitations (org_id) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- RLS helper functions
--
-- SECURITY DEFINER so a policy on `memberships` cannot recurse into itself.
-- STABLE so Postgres calls them once per statement, not once per row.
-- ---------------------------------------------------------------------------
create or replace function current_org_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from memberships
  where user_id = auth.uid() and active
$$;

create or replace function is_org_member(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target and active
  )
$$;

create or replace function org_role_of(target uuid)
returns org_role
language sql stable security definer set search_path = public as $$
  select role from memberships
  where user_id = auth.uid() and org_id = target and active
  limit 1
$$;

create or replace function is_org_admin(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select org_role_of(target) in ('owner', 'admin')
$$;

-- ---------------------------------------------------------------------------
-- Audit log — append-only, one row per meaningful state change
-- ---------------------------------------------------------------------------
create table audit_log (
  id          bigserial primary key,
  org_id      uuid not null references organisations(id) on delete cascade,
  actor_id    uuid references profiles(id),
  actor_label text,                    -- retained if the profile is later deleted
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on audit_log (org_id, created_at desc);
create index on audit_log (org_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger, reused by later migrations
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger t_org_touch before update on organisations
  for each row execute function touch_updated_at();
create trigger t_profile_touch before update on profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table organisations enable row level security;
alter table profiles      enable row level security;
alter table memberships   enable row level security;
alter table invitations   enable row level security;
alter table audit_log     enable row level security;

-- Organisations: visible to members; editable by owner/admin.
create policy org_select on organisations for select
  using (is_org_member(id));
create policy org_update on organisations for update
  using (is_org_admin(id)) with check (is_org_admin(id));
-- Creation goes through create_organisation() below, never a direct insert.

-- Profiles: your own row, plus anyone sharing an organisation with you.
create policy profile_self on profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from memberships m
      where m.user_id = profiles.id and m.org_id in (select current_org_ids())
    )
  );
create policy profile_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships: members see the roster; admins manage it.
create policy member_select on memberships for select
  using (org_id in (select current_org_ids()));
create policy member_write on memberships for all
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

create policy invite_admin on invitations for all
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- Audit log is readable by admins and append-only for members.
create policy audit_select on audit_log for select
  using (is_org_admin(org_id));
create policy audit_insert on audit_log for insert
  with check (org_id in (select current_org_ids()));

-- ---------------------------------------------------------------------------
-- Onboarding: create an organisation and make the caller its owner, atomically
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

  insert into audit_log (org_id, actor_id, entity_type, entity_id, action, new_value)
  values (v_org.id, auth.uid(), 'organisation', v_org.id, 'created',
          jsonb_build_object('name', p_name, 'region', p_region));

  return v_org;
end;
$$;

revoke all on function create_organisation(text, text, region_code) from public;
grant execute on function create_organisation(text, text, region_code) to authenticated;
