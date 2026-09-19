-- ============================================================================
-- 007 — GRANTS
--
-- Supabase grants `anon` and `authenticated` broad access to new tables in
-- `public` by default. Nothing in this platform is reachable anonymously —
-- the public careers site and the signing ceremony both run server-side with
-- the service role and authorise for themselves — so `anon` is revoked.
--
-- Table privileges are the coarse gate; RLS is the fine one. Both are needed:
-- RLS with no grant is unreachable, and a grant with no RLS is a leak.
-- ============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- The audit trail is append-only for everyone; the trigger in 003 enforces
-- it, and removing the privilege means an attempt fails before the trigger.
revoke update, delete on envelope_events from authenticated;
revoke update, delete on application_stage_history from authenticated;
revoke update, delete on audit_log from authenticated;

-- Organisations are created only through create_organisation(), which also
-- installs the owner membership. A direct insert would strand a tenant with
-- no members.
revoke insert on organisations from authenticated;
