-- ============================================================================
-- 009 — SEED THE PRICE LIST
--
-- Three tiers, one per business size, all on the same shape: base fee +
-- included envelopes + per-envelope overage. Enterprise swaps the flat
-- overage for graduated volume bands.
--
-- The ladder is deliberate. Each tier's overage rate sits just above that
-- tier's own effective included rate:
--
--   Starter     R499 / 25   = R20.00 each included, R25.00 overage
--   Growth    R1,799 / 150  = R11.99 each included, R14.00 overage
--   Enterprise R5,999 / 750 =  R8.00 each included, R8.50 first band
--
-- So going over is never punitive, but it is always slightly more expensive
-- than moving up — the overage nudges an upgrade instead of resenting it, and
-- a customer who is consistently over is being told so by their invoice.
--
-- Regional prices are set to what each market bears. They are NOT currency
-- conversions: R499 is not £29 at any exchange rate, and should not be.
--
-- To change a price, UPDATE the row. Nothing here is compiled into the app.
-- ============================================================================

insert into pricing_plans
  (code, name, segment, tagline, included_envelopes, included_seats,
   uses_volume_bands, band_mode, hard_cap_envelopes, sort_order, features)
values
  ('starter', 'Starter', 'small',
   'For a small team that hires a few times a year.',
   25, 3, false, 'graduated', 200, 1,
   '["25 signature envelopes a month","3 users","Careers site with job structured data","Applicant tracking and pipelines","Full audit trail and completion certificates","Email support"]'::jsonb),

  ('growth', 'Growth', 'medium',
   'For a business hiring every month, across more than one role.',
   150, 10, false, 'graduated', 1500, 2,
   '["150 signature envelopes a month","10 users","Everything in Starter","WhatsApp and email sequences","Weighted scorecards and shortlist reports","Automations and weekly digests","Priority support"]'::jsonb),

  ('enterprise', 'Enterprise', 'enterprise',
   'High volume, bulk rates, and terms negotiated with you.',
   750, 25, true, 'graduated', null, 3,
   '["750 signature envelopes a month, then bulk rates","25 users","Everything in Growth","Bulk volume pricing on every extra envelope","Custom signing workflows and templates","SSO and named account manager","Annual contract and invoicing"]'::jsonb)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Prices. Annual is twelve months for the price of ten.
-- ---------------------------------------------------------------------------
insert into plan_prices
  (plan_id, currency, base_monthly, base_annual, overage_per_envelope, extra_seat_monthly)
select p.id, v.currency, v.base_monthly, v.base_annual, v.overage, v.seat
from pricing_plans p
join (values
  -- South Africa — the home market, priced for it.
  ('starter',    'ZAR',   499.00,   4990.00,  25.0000, 149.00),
  ('growth',     'ZAR',  1799.00,  17990.00,  14.0000, 119.00),
  ('enterprise', 'ZAR',  5999.00,  59990.00,      null,  89.00),
  -- United Kingdom
  ('starter',    'GBP',    29.00,    290.00,   1.4000,   8.00),
  ('growth',     'GBP',    99.00,    990.00,   0.8000,   7.00),
  ('enterprise', 'GBP',   349.00,   3490.00,      null,   5.00),
  -- Euro area
  ('starter',    'EUR',    32.00,    320.00,   1.6000,   9.00),
  ('growth',     'EUR',   109.00,   1090.00,   0.9000,   7.50),
  ('enterprise', 'EUR',   379.00,   3790.00,      null,   5.50),
  -- United States and everything else
  ('starter',    'USD',    35.00,    350.00,   1.7500,  10.00),
  ('growth',     'USD',   119.00,   1190.00,   0.9500,   8.00),
  ('enterprise', 'USD',   399.00,   3990.00,      null,   6.00)
) as v(code, currency, base_monthly, base_annual, overage, seat)
  on v.code = p.code
on conflict (plan_id, currency) do nothing;

-- ---------------------------------------------------------------------------
-- Enterprise volume bands.
--
-- Counted from the first CHARGEABLE envelope, i.e. after the 750 included.
-- Graduated, so crossing a threshold never reprices what has already been
-- consumed — an account that lands one envelope into a cheaper band does not
-- get a retrospective discount, and one that lands one envelope over does not
-- get a shock.
--
--   chargeable 1–1,750      (total     751–2,500)   entry bulk
--   chargeable 1,751–9,250  (total   2,501–10,000)  mid bulk
--   chargeable 9,251+       (total  10,001+)        top bulk
-- ---------------------------------------------------------------------------
insert into plan_volume_bands (plan_id, currency, from_qty, to_qty, unit_price)
select p.id, v.currency, v.from_qty, v.to_qty, v.unit_price
from pricing_plans p
join (values
  ('enterprise', 'ZAR',    1, 1750,  8.5000),
  ('enterprise', 'ZAR', 1751, 9250,  5.5000),
  ('enterprise', 'ZAR', 9251, null,  3.5000),

  ('enterprise', 'GBP',    1, 1750,  0.4800),
  ('enterprise', 'GBP', 1751, 9250,  0.3100),
  ('enterprise', 'GBP', 9251, null,  0.2000),

  ('enterprise', 'EUR',    1, 1750,  0.5400),
  ('enterprise', 'EUR', 1751, 9250,  0.3500),
  ('enterprise', 'EUR', 9251, null,  0.2200),

  ('enterprise', 'USD',    1, 1750,  0.5800),
  ('enterprise', 'USD', 1751, 9250,  0.3700),
  ('enterprise', 'USD', 9251, null,  0.2400)
) as v(code, currency, from_qty, to_qty, unit_price)
  on v.code = p.code
on conflict (plan_id, currency, from_qty) do nothing;

-- ---------------------------------------------------------------------------
-- Give every new workspace a Starter trial subscription, so the meter, the
-- usage display and the entitlement check all have something to read from
-- the first minute rather than special-casing "no subscription yet".
-- ---------------------------------------------------------------------------
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

  insert into organisations (name, slug, region, currency, locale, timezone)
  values (
    p_name,
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

  insert into careers_sites (org_id, headline, meta_title, meta_description)
  values (
    v_org.id,
    'Careers at ' || p_name,
    left('Careers at ' || p_name, 60),
    left('Open roles at ' || p_name || '. Apply in minutes — we reply to every application.', 160)
  );

  select id into v_plan from pricing_plans where code = 'starter';

  -- Fall back to a currency we actually publish a price in, rather than
  -- leaving a market with no price list at all.
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

revoke all on function create_organisation(text, text, region_code) from public;
grant execute on function create_organisation(text, text, region_code) to authenticated;
