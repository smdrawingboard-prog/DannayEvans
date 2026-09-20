-- ============================================================================
-- 008 — PRICING, METERING AND BILLING
--
-- Commercial model, decided deliberately:
--
--   Billable unit .... one ENVELOPE SENT, regardless of how many recipients,
--                     documents or pages it carries. An offer letter going to
--                     a candidate and a hiring manager is one charge, not two.
--                     Charging per signer punishes exactly the multi-party
--                     deals we want customers to run through the platform.
--
--   Shape ............ monthly base fee + an included allowance + a per-unit
--                     overage rate. Predictable revenue, and heavy users still
--                     pay for what they use.
--
--   Enterprise ....... the overage rate is replaced by graduated volume bands,
--                     so the marginal envelope gets cheaper as volume grows
--                     without repricing the units already consumed.
--
-- Prices are DATA, in `plan_prices`, one row per plan per currency. Changing a
-- price is an UPDATE, never a deploy. Regional prices are set to what each
-- market bears — they are not currency conversions of one another.
-- ============================================================================

create type billing_segment as enum ('small', 'medium', 'enterprise');
create type subscription_status as enum
  ('trialing', 'active', 'past_due', 'cancelled', 'paused');

-- Graduated: each band prices only the units that fall inside it (like income
-- tax). Volume: reaching a band reprices every unit at that band's rate.
create type band_mode as enum ('graduated', 'volume');

-- ---------------------------------------------------------------------------
-- Plan catalogue — global, not per tenant
-- ---------------------------------------------------------------------------
create table pricing_plans (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,     -- 'starter' | 'growth' | 'enterprise'
  name          text not null,
  segment       billing_segment not null,
  tagline       text,
  -- Envelopes included in the base fee each period.
  included_envelopes int not null default 0 check (included_envelopes >= 0),
  included_seats     int not null default 1 check (included_seats >= 1),
  -- Enterprise uses volume bands instead of a single overage rate.
  uses_volume_bands  boolean not null default false,
  band_mode          band_mode not null default 'graduated',
  -- A hard stop protects the customer from a runaway bill; null means none
  -- and the account is allowed to keep sending.
  hard_cap_envelopes int,
  features      jsonb not null default '[]'::jsonb,
  sort_order    int not null default 0,
  public        boolean not null default true,   -- false = negotiated only
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Price per plan per currency. One row per market.
-- ---------------------------------------------------------------------------
create table plan_prices (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references pricing_plans(id) on delete cascade,
  currency          char(3) not null,
  base_monthly      numeric(12,2) not null check (base_monthly >= 0),
  -- Annual is charged up front; the discount is expressed in the price, not
  -- as a percentage applied at checkout, so what is quoted is what is billed.
  base_annual       numeric(12,2),
  -- Flat overage rate. Null on plans that use volume bands.
  overage_per_envelope numeric(10,4) check (overage_per_envelope >= 0),
  extra_seat_monthly   numeric(12,2) not null default 0,
  unique (plan_id, currency)
);

-- ---------------------------------------------------------------------------
-- Volume bands — enterprise bulk pricing
-- ---------------------------------------------------------------------------
create table plan_volume_bands (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references pricing_plans(id) on delete cascade,
  currency   char(3) not null,
  -- Inclusive lower bound, counted from the first chargeable envelope (that
  -- is, after the included allowance is used up).
  from_qty   int not null check (from_qty >= 1),
  -- Null is "and above". Exactly one open-ended band per plan/currency.
  to_qty     int check (to_qty is null or to_qty >= from_qty),
  unit_price numeric(10,4) not null check (unit_price >= 0),
  unique (plan_id, currency, from_qty)
);
create unique index one_open_band_per_plan
  on plan_volume_bands (plan_id, currency) where to_qty is null;

-- ---------------------------------------------------------------------------
-- Subscriptions — the authoritative record of what a tenant is on
-- ---------------------------------------------------------------------------
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null unique references organisations(id) on delete cascade,
  plan_id         uuid not null references pricing_plans(id),
  currency        char(3) not null,
  status          subscription_status not null default 'trialing',
  interval        text not null default 'monthly' check (interval in ('monthly','annual')),

  seats           int not null default 1 check (seats >= 1),

  -- Negotiated overrides. Null means "use the catalogue price". Enterprise
  -- deals are struck one at a time, so this has to exist on day one rather
  -- than be retrofitted when the first big customer signs.
  override_base_monthly       numeric(12,2),
  override_included_envelopes int,
  override_overage            numeric(10,4),

  current_period_start date not null default date_trunc('month', now())::date,
  current_period_end   date not null default (date_trunc('month', now()) + interval '1 month - 1 day')::date,

  trial_ends_at   timestamptz,
  cancelled_at    timestamptz,
  -- Gateway reference: PayFast, Peach or Stripe depending on the market.
  gateway         text,
  gateway_ref     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on subscriptions (status, current_period_end);

-- Keep the denormalised column on organisations in step, so existing reads
-- of `organisations.plan` do not silently go stale.
create or replace function sync_org_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update organisations
     set plan = case (select segment from pricing_plans where id = new.plan_id)
                  when 'small'      then 'team'::plan_tier
                  when 'medium'     then 'growth'::plan_tier
                  when 'enterprise' then 'agency'::plan_tier
                end
   where id = new.org_id
     and new.status in ('active', 'past_due');
  return new;
end;
$$;
create trigger t_sync_org_plan after insert or update of plan_id, status
  on subscriptions for each row execute function sync_org_plan();

-- ---------------------------------------------------------------------------
-- Usage events — the meter
--
-- `source_id` plus `event_type` is unique per org, so a retried send, a
-- replayed webhook or a double-clicked button cannot bill twice. Idempotency
-- has to be a constraint, not a convention.
-- ---------------------------------------------------------------------------
create table usage_events (
  id          bigserial primary key,
  org_id      uuid not null references organisations(id) on delete cascade,
  event_type  text not null default 'envelope.sent',
  source_id   uuid not null,              -- the envelope id
  quantity    int not null default 1 check (quantity > 0),
  occurred_at timestamptz not null default now(),
  -- Stamped at write time so a later plan change does not retroactively
  -- rewrite history. Invoices must reproduce exactly.
  period_start date not null,
  billable     boolean not null default true,
  note         text,
  unique (org_id, event_type, source_id)
);
create index on usage_events (org_id, period_start) where billable;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  number         text unique,
  currency       char(3) not null,
  period_start   date not null,
  period_end     date not null,
  base_amount    numeric(12,2) not null default 0,
  seat_amount    numeric(12,2) not null default 0,
  usage_amount   numeric(12,2) not null default 0,
  subtotal       numeric(12,2) not null default 0,
  tax_rate       numeric(5,4) not null default 0,     -- 0.15 = 15% SA VAT
  tax_amount     numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  -- Per-line breakdown, frozen at issue so the invoice always reconciles even
  -- after the catalogue changes.
  line_items     jsonb not null default '[]'::jsonb,
  envelopes_used int not null default 0,
  status         text not null default 'draft'
                   check (status in ('draft','issued','paid','overdue','void')),
  issued_at      timestamptz,
  due_at         date,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (org_id, period_start)
);
create index on invoices (org_id, period_start desc);

-- ---------------------------------------------------------------------------
-- Pricing arithmetic
-- ---------------------------------------------------------------------------

/**
 * Cost of `p_qty` chargeable envelopes under a plan's volume bands.
 * Graduated walks the bands and prices each slice; volume finds the band the
 * total lands in and prices everything at that rate.
 */
create or replace function price_volume_bands(
  p_plan uuid, p_currency char(3), p_qty int
) returns numeric
language plpgsql stable as $$
declare
  v_mode  band_mode;
  v_total numeric(14,4) := 0;
  v_rate  numeric(10,4);
  b       record;
  v_slice int;
begin
  if p_qty <= 0 then return 0; end if;

  select band_mode into v_mode from pricing_plans where id = p_plan;

  if v_mode = 'volume' then
    select unit_price into v_rate
      from plan_volume_bands
     where plan_id = p_plan and currency = p_currency
       and from_qty <= p_qty
       and (to_qty is null or to_qty >= p_qty)
     order by from_qty desc
     limit 1;
    return round(coalesce(v_rate, 0) * p_qty, 2);
  end if;

  for b in
    select from_qty, to_qty, unit_price
      from plan_volume_bands
     where plan_id = p_plan and currency = p_currency
     order by from_qty
  loop
    exit when b.from_qty > p_qty;
    v_slice := least(coalesce(b.to_qty, p_qty), p_qty) - b.from_qty + 1;
    if v_slice > 0 then
      v_total := v_total + (v_slice * b.unit_price);
    end if;
  end loop;

  return round(v_total, 2);
end;
$$;

/** Billable envelopes for an organisation in a given period. */
create or replace function envelopes_used(p_org uuid, p_period date default null)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity), 0)::int
    from usage_events
   where org_id = p_org
     and billable
     and period_start = coalesce(p_period, date_trunc('month', now())::date)
$$;

/**
 * What the current period would cost if it closed now. Used by the in-app
 * usage meter, so a customer is never surprised by an invoice.
 */
create or replace function estimate_current_charges(p_org uuid)
returns table (
  plan_code text,
  currency char(3),
  included int,
  used int,
  chargeable int,
  base_amount numeric,
  usage_amount numeric,
  total_amount numeric,
  over_hard_cap boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  s record; p record; pr record;
  v_used int; v_charge int; v_usage numeric := 0; v_base numeric;
begin
  select * into s from subscriptions where org_id = p_org;
  if not found then return; end if;

  select * into p from pricing_plans where id = s.plan_id;
  -- Columns are qualified because this function's OUT parameters share
  -- names with them, and an unqualified reference is ambiguous.
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

/**
 * Whether an organisation may send another envelope right now.
 *
 * Returns a reason rather than a bare boolean: the UI has to tell the user
 * what to do about it, and "no" on its own is useless to them.
 */
create or replace function can_send_envelope(p_org uuid)
returns table (allowed boolean, reason text, used int, included int)
language plpgsql stable security definer set search_path = public as $$
declare s record; p record; v_used int; v_included int;
begin
  select * into s from subscriptions where org_id = p_org;

  -- No subscription row yet means the workspace is still in its free trial.
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
    -- Past due still sends. Cutting off a customer mid-hire over an expired
    -- card loses the account, not just the invoice.
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
-- The meter itself: an envelope leaving draft is the billable moment.
-- Recorded by trigger rather than in application code, so every path —
-- UI, automation, API, webhook — is metered identically and none can forget.
-- ---------------------------------------------------------------------------
create or replace function meter_envelope_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_period date;
begin
  if old.status = 'draft' and new.status = 'sent' then
    select current_period_start into v_period
      from subscriptions where org_id = new.org_id;

    insert into usage_events (org_id, event_type, source_id, period_start)
    values (new.org_id, 'envelope.sent', new.id,
            coalesce(v_period, date_trunc('month', now())::date))
    on conflict (org_id, event_type, source_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger t_meter_envelope after update of status on envelopes
  for each row execute function meter_envelope_sent();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table pricing_plans     enable row level security;
alter table plan_prices       enable row level security;
alter table plan_volume_bands enable row level security;
alter table subscriptions     enable row level security;
alter table usage_events      enable row level security;
alter table invoices          enable row level security;

-- The catalogue is public information; negotiated plans are not listed.
create policy plans_read on pricing_plans for select using (active and public);
create policy prices_read on plan_prices for select
  using (exists (select 1 from pricing_plans p
                  where p.id = plan_id and p.active and p.public));
create policy bands_read on plan_volume_bands for select
  using (exists (select 1 from pricing_plans p
                  where p.id = plan_id and p.active and p.public));

-- A tenant reads its own commercials. Changing them is a billing operation,
-- not something a member can do to themselves, so there is no write policy.
create policy sub_read on subscriptions for select
  using (org_id in (select current_org_ids()));
create policy usage_read on usage_events for select
  using (org_id in (select current_org_ids()));
create policy invoice_read on invoices for select
  using (is_org_admin(org_id));

grant select on pricing_plans, plan_prices, plan_volume_bands to authenticated;
grant select on subscriptions, usage_events, invoices to authenticated;
revoke insert, update, delete on subscriptions, invoices from authenticated;
revoke update, delete on usage_events from authenticated;
