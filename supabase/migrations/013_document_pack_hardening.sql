-- ============================================================================
-- 013 — HARDENING FOR THE DOCUMENT PACK FUNCTIONS
--
-- The Supabase security advisor caught three regressions introduced by 011.
-- Migration 010 had revoked EXECUTE from PUBLIC across the schema and set a
-- default-privileges rule, but that rule only binds functions created later
-- by the same role, and the document-pack migration was applied by another.
-- So the new functions carried Postgres's default EXECUTE-to-PUBLIC grant and
-- were reachable through PostgREST as `anon`.
--
-- Two of them also repeated the mistake the billing functions made: a
-- SECURITY DEFINER function that takes an org or client id and trusts it.
--   - rebate_credit_pct  read any tenant's negotiated rebate scale
--   - expire_stale_rtr   wrote to any tenant's right_to_represent rows
-- Both now assert membership first, the same way the billing functions do.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nobody calls a trigger function over HTTP.
-- ---------------------------------------------------------------------------
revoke execute on function apply_unsuccessful_retention() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A definer function that takes an id must prove the caller owns it.
-- ---------------------------------------------------------------------------

/**
 * Credit due when a placement terminates inside the guarantee window and no
 * replacement was found. Walks the client's own scale; returns 0 outside it.
 *
 * The rebate scale is a negotiated commercial term, so reading it requires
 * membership of the client's organisation.
 */
create or replace function rebate_credit_pct(p_client uuid, p_days_served int)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare band record; v_scale jsonb; v_org uuid;
begin
  if p_days_served < 0 then return 0; end if;

  select org_id, rebate_scale into v_org, v_scale from clients where id = p_client;
  if v_org is null then return 0; end if;
  perform assert_org_access(v_org);
  if v_scale is null then return 0; end if;

  for band in
    select (b->>'up_to_days')::int as up_to, (b->>'credit_pct')::numeric as pct
      from jsonb_array_elements(v_scale) b
     order by (b->>'up_to_days')::int
  loop
    if p_days_served <= band.up_to then return band.pct; end if;
  end loop;
  return 0;
end;
$$;

/**
 * Expire grants that have run out. Called before any check so a stale row
 * never blocks a legitimate new submission.
 */
create or replace function expire_stale_rtr(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  perform assert_org_access(p_org);

  update right_to_represent
     set status = 'expired'
   where org_id = p_org and status = 'active' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Close the PUBLIC grant on the callable three, then grant back narrowly.
--    After the definitions above, because a replaced function keeps its ACL.
-- ---------------------------------------------------------------------------
revoke execute on function rebate_credit_pct(uuid, int)           from public, anon;
revoke execute on function expire_stale_rtr(uuid)                 from public, anon;
revoke execute on function can_submit_candidate(uuid, uuid, text) from public, anon;

grant execute on function rebate_credit_pct(uuid, int)            to authenticated;
grant execute on function expire_stale_rtr(uuid)                  to authenticated;
grant execute on function can_submit_candidate(uuid, uuid, text)  to authenticated;

-- Re-assert the default rule under whichever role is applying migrations now,
-- so the next function added does not repeat this.
alter default privileges in schema public revoke execute on functions from public;
