-- Minimal stand-ins for the Supabase-managed objects the migrations depend on.
-- Used only to verify the migrations apply against a vanilla Postgres; the
-- real platform provides these.
create schema if not exists auth;
create schema if not exists storage;

do $$ begin
  create role anon;            exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;   exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;    exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);
alter table storage.objects enable row level security;
