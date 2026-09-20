-- ============================================================================
-- 010 — FUNCTION HARDENING
--
-- Raised by the Supabase security advisor against the deployed project, and
-- not catchable by the local test suite because the local harness has no
-- PostgREST in front of it. Two genuine problems:
--
-- 1. CROSS-TENANT READ THROUGH SECURITY DEFINER FUNCTIONS.
--    `envelopes_used`, `estimate_current_charges` and `can_send_envelope` take
--    an org id, run as the definer, and never checked membership. RLS did not
--    save them precisely because SECURITY DEFINER bypasses it. Any signed-in
--    user could read any organisation's usage and billing by passing a uuid
--    to /rest/v1/rpc/. They now verify membership themselves.
--
-- 2. EVERY FUNCTION WAS CALLABLE BY `anon`.
--    Postgres grants EXECUTE to PUBLIC on new functions by default, and
--    PostgREST exposes anything the role can execute. That put the seed
--    helpers and the trigger functions on the public API. Execute is now
--    revoked wholesale and granted back only where it is needed.
--
-- Also pins `search_path` on the remaining functions: an unpinned
-- search_path on a definer function is a privilege-escalation vector.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Membership checks inside the billing functions
-- ---------------------------------------------------------------------------

-- Shared guard. The service role has no membership rows and legitimately
-- needs to read any org (invoicing, the public pricing page), so it is
-- allowed through explicitly rather than by accident.
create or replace function assert_org_access(p_org uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  -- Neither current_user nor session_user identifies the caller here:
  -- inside a SECURITY DEFINER function current_user is the *definer*, and
  -- PostgREST connects as `authenticator` before SET ROLE, so session_user
  -- is never the end user either. The JWT role claim is the only honest
  -- signal, so read that.
  v_role := coalesce(
    current_setting('request.jwt.claim.role', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );

  -- The service role legitimately reads any organisation: it runs the
  -- careers site, the signing ceremony and invoicing, none of which carry
  -- a membership.
  if v_role = 'service_role' then
    return;
  end if;

  -- No JWT at all means a direct database connection — a migration, a
  -- scheduled job, or psql. Those are already trusted by definition.
  if v_role = '' and auth.uid() is null then
    return;
  end if;

  if not is_org_member(p_org) then
    raise exception 'not a member of this organisation'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function envelopes_used(p_org uuid, p_period date default null)
returns int
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_org_access(p_org);
  return (
    select coalesce(sum(quantity), 0)::int
      from usage_events
     where org_id = p_org
       and billable
       and period_start = coalesce(p_period, date_trunc('month', now())::date)
  );
end;
$$;

create or replace function estimate_current_charges(p_org uuid)
returns table (
  plan_code text, currency char(3), included int, used int, chargeable int,
  base_amount numeric, usage_amount numeric, total_amount numeric,
  over_hard_cap boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  s record; p record; pr record;
  v_used int; v_charge int; v_usage numeric := 0; v_base numeric;
begin
  perform assert_org_access(p_org);

  select * into s from subscriptions where org_id = p_org;
  if not found then return; end if;

  select * into p from pricing_plans where id = s.plan_id;
  select * into pr from plan_prices
   where plan_prices.plan_id = s.plan_id
     and plan_prices.currency = s.currency;

  v_used  := envelopes_used(p_org, s.current_period_start);
  included := coalesce(s.override_included_envelopes, p.included_envelopes);
  v_charge := greatest(v_used - included, 0);

  if v_charge > 0 then
    if p.uses_volume_bands then
      v_usage := price_volume_bands(s.plan_id, s.currency, v_charge);
    else
      v_usage := round(v_charge * coalesce(s.override_overage, pr.overage_per_envelope, 0), 2);
    end if;
  end if;

  v_base := coalesce(s.override_base_monthly, pr.base_monthly, 0)
          + (greatest(s.seats - p.included_seats, 0) * coalesce(pr.extra_seat_monthly, 0));

  plan_code     := p.code;
  currency      := s.currency;
  used          := v_used;
  chargeable    := v_charge;
  base_amount   := v_base;
  usage_amount  := v_usage;
  total_amount  := v_base + v_usage;
  over_hard_cap := p.hard_cap_envelopes is not null and v_used >= p.hard_cap_envelopes;
  return next;
end;
$$;

create or replace function can_send_envelope(p_org uuid)
returns table (allowed boolean, reason text, used int, included int)
language plpgsql stable security definer set search_path = public as $$
declare s record; p record; v_used int; v_included int;
begin
  perform assert_org_access(p_org);

  select * into s from subscriptions where org_id = p_org;

  if not found then
    allowed := true; reason := 'trial'; used := envelopes_used(p_org);
    included := null; return next; return;
  end if;

  select * into p from pricing_plans where id = s.plan_id;
  v_used := envelopes_used(p_org, s.current_period_start);
  v_included := coalesce(s.override_included_envelopes, p.included_envelopes);

  if s.status in ('cancelled', 'paused') then
    allowed := false; reason := 'subscription_' || s.status;
  elsif s.status = 'past_due' then
    allowed := true; reason := 'past_due';
  elsif p.hard_cap_envelopes is not null and v_used >= p.hard_cap_envelopes then
    allowed := false; reason := 'hard_cap_reached';
  elsif v_used >= v_included then
    allowed := true; reason := 'overage';
  else
    allowed := true; reason := 'included';
  end if;

  used := v_used; included := v_included;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Pin search_path on the functions that were missing it
-- ---------------------------------------------------------------------------
alter function default_currency_for_region(region_code) set search_path = public;
alter function touch_updated_at()                       set search_path = public;
alter function reject_mutation()                        set search_path = public;
alter function candidate_search_text(text, text, text, text, text[])
                                                        set search_path = public;
alter function storage_path_org(text)                   set search_path = public;
alter function price_volume_bands(uuid, char, int)      set search_path = public;

-- ---------------------------------------------------------------------------
-- 3. Take EXECUTE away from everyone, then grant it back deliberately
--
-- PostgREST publishes any function the caller can execute, so the grant list
-- below is effectively the RPC surface of this API. Nothing should be on it
-- that is not meant to be called from a client.
-- ---------------------------------------------------------------------------
-- Revoke only from functions this application owns. A blanket
-- `revoke execute on all functions in schema public` also strips the citext
-- extension's operator functions — which live in public on this project —
-- and every citext comparison then fails with "permission denied for
-- function citext_eq". Extension-owned functions are filtered out via
-- pg_depend.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid
            and d.deptype = 'e'          -- owned by an extension
       )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public;

-- Trigger functions need no grant at all: a trigger runs as the table owner.
-- Leaving them ungranted takes handle_new_user, meter_envelope_sent,
-- sync_envelope_status, record_stage_move, sync_org_plan, reject_mutation and
-- touch_updated_at off the public API entirely.

-- The seed helpers are only ever called from inside create_organisation,
-- which is SECURITY DEFINER, so they need no grant either. Previously an
-- authenticated user could have seeded stages into somebody else's workspace.

-- RLS policy expressions are evaluated as the querying role, so these four
-- must stay executable by authenticated. Each only ever reports on the
-- caller's own memberships, so exposure through RPC is harmless.
grant execute on function current_org_ids()        to authenticated;
grant execute on function is_org_member(uuid)      to authenticated;
grant execute on function is_org_admin(uuid)       to authenticated;
grant execute on function org_role_of(uuid)        to authenticated;
grant execute on function assert_org_access(uuid)  to authenticated;

-- Used by the storage policies.
grant execute on function storage_path_org(text)   to authenticated;

-- Deliberate RPC surface, all membership-checked.
grant execute on function create_organisation(text, text, region_code) to authenticated;
grant execute on function envelopes_used(uuid, date)                   to authenticated;
grant execute on function estimate_current_charges(uuid)               to authenticated;
grant execute on function can_send_envelope(uuid)                      to authenticated;

-- Read-only pricing helpers. Safe: they read the public catalogue only.
grant execute on function price_volume_bands(uuid, char, int)          to authenticated;
grant execute on function default_currency_for_region(region_code)     to authenticated;
grant execute on function candidate_search_text(text, text, text, text, text[])
                                                                       to authenticated;

-- The service role runs the careers site, the signing ceremony and billing,
-- none of which carry a membership.
grant execute on all functions in schema public to service_role;
