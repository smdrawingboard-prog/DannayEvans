-- ============================================================================
-- Pricing arithmetic, metering and entitlement.
--
-- Graduated band maths is exactly the kind of code that is subtly wrong and
-- silently under- or over-bills for months, so every boundary is asserted:
-- the first unit of a band, the last unit of a band, and the unit either
-- side of each threshold.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

begin;

create or replace function assert_eq(actual numeric, expected numeric, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED: % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'passed: % (%)', label, actual;
end $$;

create or replace function assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAILED: %', label; end if;
  raise notice 'passed: %', label;
end $$;

-- ---------------------------------------------------------------------------
-- Catalogue loaded
-- ---------------------------------------------------------------------------
select assert((select count(*) from pricing_plans where active) = 3,
  'three plans are published');
select assert((select count(*) from plan_prices) = 12,
  'each plan is priced in four currencies');
select assert(
  (select count(*) from plan_prices
    where overage_per_envelope is null
      and plan_id = (select id from pricing_plans where code = 'enterprise')) = 4,
  'enterprise has no flat overage — it uses bands');

-- The ladder that makes an upgrade the rational choice must actually hold.
select assert(
  (select pp.overage_per_envelope
     from plan_prices pp join pricing_plans p on p.id = pp.plan_id
    where p.code = 'starter' and pp.currency = 'ZAR')
  >
  (select round(pp.base_monthly / p.included_envelopes, 4)
     from plan_prices pp join pricing_plans p on p.id = pp.plan_id
    where p.code = 'starter' and pp.currency = 'ZAR'),
  'Starter overage costs more per envelope than the included rate');

select assert(
  (select pp.overage_per_envelope
     from plan_prices pp join pricing_plans p on p.id = pp.plan_id
    where p.code = 'growth' and pp.currency = 'ZAR')
  <
  (select pp.overage_per_envelope
     from plan_prices pp join pricing_plans p on p.id = pp.plan_id
    where p.code = 'starter' and pp.currency = 'ZAR'),
  'a bigger plan has a cheaper overage than a smaller one');

-- ---------------------------------------------------------------------------
-- Graduated volume bands, ZAR enterprise
--   1–1,750     @ R8.50
--   1,751–9,250 @ R5.50
--   9,251+      @ R3.50
-- ---------------------------------------------------------------------------
\set ent '(select id from pricing_plans where code = ''enterprise'')'

select assert_eq(price_volume_bands(:ent, 'ZAR', 0), 0,
  'nothing chargeable costs nothing');
select assert_eq(price_volume_bands(:ent, 'ZAR', 1), 8.50,
  'the first chargeable envelope is the entry band rate');
select assert_eq(price_volume_bands(:ent, 'ZAR', 1750), 14875.00,
  'the last envelope of band one is still band one');
select assert_eq(price_volume_bands(:ent, 'ZAR', 1751), 14880.50,
  'crossing into band two prices only the new unit at the new rate');
select assert_eq(price_volume_bands(:ent, 'ZAR', 9250), 56125.00,
  'the last envelope of band two is still band two');
select assert_eq(price_volume_bands(:ent, 'ZAR', 9251), 56128.50,
  'crossing into band three prices only the new unit at the new rate');
select assert_eq(price_volume_bands(:ent, 'ZAR', 10000), 58750.00,
  'ten thousand chargeable envelopes price correctly across all three bands');

-- Graduated must never cost more than pricing everything at the entry rate.
select assert(
  price_volume_bands(:ent, 'ZAR', 10000) < 10000 * 8.50,
  'bulk volume is genuinely cheaper than the entry rate');

-- And it must be monotonic: one more envelope never reduces the bill.
select assert(
  price_volume_bands(:ent, 'ZAR', 9251) > price_volume_bands(:ent, 'ZAR', 9250)
  and price_volume_bands(:ent, 'ZAR', 1751) > price_volume_bands(:ent, 'ZAR', 1750),
  'the total never falls as volume rises');

-- Volume mode reprices everything at the band reached. Checked on a copy so
-- the published enterprise plan is not disturbed.
insert into pricing_plans (code, name, segment, included_envelopes, uses_volume_bands, band_mode)
values ('_vol_test', 'Volume mode', 'enterprise', 0, true, 'volume');
insert into plan_volume_bands (plan_id, currency, from_qty, to_qty, unit_price)
values
  ((select id from pricing_plans where code='_vol_test'), 'ZAR',    1, 1750, 8.50),
  ((select id from pricing_plans where code='_vol_test'), 'ZAR', 1751, null, 5.50);

select assert_eq(
  price_volume_bands((select id from pricing_plans where code='_vol_test'), 'ZAR', 2000),
  11000.00,
  'volume mode prices every unit at the band reached, not just the new ones');

-- ---------------------------------------------------------------------------
-- Metering
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('99999999-9999-9999-9999-999999999999', 'faye@fatecollab.test');

set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select create_organisation('Meter Test', 'meter-test', 'ZA');
reset role;

\set org '(select id from organisations where slug = ''meter-test'')'

select assert(
  (select currency from subscriptions where org_id = :org) = 'ZAR',
  'a South African workspace is subscribed in rand');
select assert(
  (select status from subscriptions where org_id = :org) = 'trialing',
  'a new workspace starts on trial');

select assert_eq(envelopes_used(:org), 0, 'a new workspace has used nothing');

-- A draft envelope is not chargeable. Only sending is.
insert into envelopes (id, org_id, subject)
values ('aaaaaaaa-0000-0000-0000-000000000001', :org, 'Draft only');
select assert_eq(envelopes_used(:org), 0, 'a draft envelope is not billed');

update envelopes set status = 'sent', sent_at = now()
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq(envelopes_used(:org), 1, 'sending an envelope meters one unit');

-- Idempotency: the same envelope must never bill twice, however many times
-- a retry, a replayed webhook or a double-clicked button re-runs the update.
update envelopes set status = 'draft' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update envelopes set status = 'sent'  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq(envelopes_used(:org), 1,
  're-sending the same envelope does not bill twice');

-- Recipient count does not change the charge.
insert into envelope_recipients (envelope_id, org_id, full_name, email, signing_order)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', :org, 'A', 'a@t.test', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', :org, 'B', 'b@t.test', 2),
  ('aaaaaaaa-0000-0000-0000-000000000001', :org, 'C', 'c@t.test', 3);
select assert_eq(envelopes_used(:org), 1,
  'three recipients on one envelope is still one charge');

-- ---------------------------------------------------------------------------
-- Entitlement
-- ---------------------------------------------------------------------------
select assert(
  (select allowed from can_send_envelope(:org)),
  'a workspace inside its allowance may send');
select assert(
  (select reason from can_send_envelope(:org)) = 'included',
  'and the reason given is that it is within the included allowance');

-- Fill the Starter allowance of 25.
do $$
declare i int; v_org uuid;
begin
  select id into v_org from organisations where slug = 'meter-test';
  for i in 2..25 loop
    insert into envelopes (id, org_id, subject)
    values (gen_random_uuid(), v_org, 'Bulk ' || i);
  end loop;
  update envelopes set status = 'sent'
   where org_id = v_org and status = 'draft';
end $$;

select assert_eq(envelopes_used(:org), 25, 'the allowance is fully consumed');
select assert(
  (select reason from can_send_envelope(:org)) = 'overage',
  'the next envelope is flagged as overage, but is still allowed');
select assert(
  (select allowed from can_send_envelope(:org)),
  'reaching the allowance never blocks a send');

-- Charge estimate: 25 used, 25 included, so no usage charge yet.
select assert_eq((select usage_amount from estimate_current_charges(:org)), 0,
  'no usage charge while inside the allowance');
select assert_eq((select base_amount from estimate_current_charges(:org)), 499.00,
  'the base charge is the Starter rand price');

-- Three over the allowance at R25 each.
do $$
declare i int; v_org uuid; v_id uuid;
begin
  select id into v_org from organisations where slug = 'meter-test';
  for i in 1..3 loop
    v_id := gen_random_uuid();
    insert into envelopes (id, org_id, subject) values (v_id, v_org, 'Over ' || i);
    update envelopes set status = 'sent' where id = v_id;
  end loop;
end $$;

select assert_eq((select usage_amount from estimate_current_charges(:org)), 75.00,
  'three envelopes over the allowance cost three times the overage rate');
select assert_eq((select total_amount from estimate_current_charges(:org)), 574.00,
  'the estimated total is the base plus the overage');

-- A cancelled subscription stops sends; past due does not.
update subscriptions set status = 'past_due' where org_id = :org;
select assert((select allowed from can_send_envelope(:org)),
  'a past-due account can still send — losing a customer costs more than the invoice');

update subscriptions set status = 'cancelled' where org_id = :org;
select assert(not (select allowed from can_send_envelope(:org)),
  'a cancelled subscription cannot send');

-- The hard cap protects the customer from a runaway bill.
update subscriptions set status = 'active' where org_id = :org;
update pricing_plans set hard_cap_envelopes = 20 where code = 'starter';
select assert(
  (select reason from can_send_envelope(:org)) = 'hard_cap_reached',
  'passing the hard cap stops further sends rather than running up the bill');

rollback;

\echo ''
\echo 'All pricing assertions passed.'
