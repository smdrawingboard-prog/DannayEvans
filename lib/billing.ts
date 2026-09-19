import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Billing model, in one sentence: base fee + an included allowance of
 * envelopes + a per-envelope rate above it, with enterprise swapping the flat
 * rate for graduated volume bands.
 *
 * The arithmetic lives in Postgres (migration 008), not here. Two reasons:
 * an invoice and an in-app estimate must never disagree, and the meter is a
 * trigger — so every path that sends an envelope is billed identically,
 * including automations and webhooks that never touch this file.
 */

export type BillingSegment = 'small' | 'medium' | 'enterprise'

export interface VolumeBand {
  fromQty: number
  toQty: number | null
  unitPrice: number
}

export interface PlanPrice {
  currency: string
  baseMonthly: number
  baseAnnual: number | null
  overagePerEnvelope: number | null
  extraSeatMonthly: number
}

export interface Plan {
  id: string
  code: string
  name: string
  segment: BillingSegment
  tagline: string | null
  includedEnvelopes: number
  includedSeats: number
  usesVolumeBands: boolean
  hardCapEnvelopes: number | null
  features: string[]
  price: PlanPrice | null
  bands: VolumeBand[]
}

export interface UsageEstimate {
  planCode: string
  currency: string
  included: number | null
  used: number
  chargeable: number
  baseAmount: number
  usageAmount: number
  totalAmount: number
  overHardCap: boolean
}

export interface Entitlement {
  allowed: boolean
  /** 'included' | 'overage' | 'trial' | 'past_due' | 'hard_cap_reached' | 'subscription_cancelled' | 'subscription_paused' */
  reason: string
  used: number
  included: number | null
}

/**
 * The published price list in one currency. Read with the service role
 * because the pricing page is public and has no session to authorise with;
 * safe to do so, since the catalogue is public information and the query is
 * filtered to plans explicitly marked public.
 */
export async function getPlans(currency: string): Promise<Plan[]> {
  const db = createAdminClient()

  const { data } = await db
    .from('pricing_plans')
    .select(`
      id, code, name, segment, tagline, included_envelopes, included_seats,
      uses_volume_bands, hard_cap_envelopes, features, sort_order,
      plan_prices(currency, base_monthly, base_annual, overage_per_envelope, extra_seat_monthly),
      plan_volume_bands(currency, from_qty, to_qty, unit_price)
    `)
    .eq('active', true)
    .eq('public', true)
    .order('sort_order')

  return (data ?? []).map((p) => {
    const prices = (p.plan_prices ?? []) as {
      currency: string; base_monthly: number; base_annual: number | null
      overage_per_envelope: number | null; extra_seat_monthly: number
    }[]
    const price = prices.find((x) => x.currency === currency) ?? null

    const bands = ((p.plan_volume_bands ?? []) as {
      currency: string; from_qty: number; to_qty: number | null; unit_price: number
    }[])
      .filter((b) => b.currency === currency)
      .sort((a, b) => a.from_qty - b.from_qty)
      .map((b) => ({
        fromQty: b.from_qty,
        toQty: b.to_qty,
        unitPrice: Number(b.unit_price),
      }))

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      segment: p.segment as BillingSegment,
      tagline: p.tagline,
      includedEnvelopes: p.included_envelopes,
      includedSeats: p.included_seats,
      usesVolumeBands: p.uses_volume_bands,
      hardCapEnvelopes: p.hard_cap_envelopes,
      features: (p.features ?? []) as string[],
      price: price
        ? {
            currency: price.currency,
            baseMonthly: Number(price.base_monthly),
            baseAnnual: price.base_annual === null ? null : Number(price.base_annual),
            overagePerEnvelope:
              price.overage_per_envelope === null ? null : Number(price.overage_per_envelope),
            extraSeatMonthly: Number(price.extra_seat_monthly),
          }
        : null,
      bands,
    }
  })
}

/** What this period would cost if it closed now. Scoped by RLS to the caller. */
export async function getUsageEstimate(orgId: string): Promise<UsageEstimate | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('estimate_current_charges', { p_org: orgId })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null

  return {
    planCode: row.plan_code,
    currency: row.currency,
    included: row.included,
    used: row.used,
    chargeable: row.chargeable,
    baseAmount: Number(row.base_amount ?? 0),
    usageAmount: Number(row.usage_amount ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    overHardCap: Boolean(row.over_hard_cap),
  }
}

/**
 * Whether another envelope may be sent, and why.
 *
 * Deliberately permissive: running out of allowance moves the account into
 * overage rather than stopping it. Only a cancelled subscription or a hard
 * cap the customer themselves set will block a send — blocking a business
 * mid-hire over billing is how you lose the account, not how you collect.
 */
export async function checkEntitlement(orgId: string): Promise<Entitlement> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('can_send_envelope', { p_org: orgId })
  const row = Array.isArray(data) ? data[0] : data

  // Fail open on a read error rather than blocking a legitimate send. The
  // meter is a database trigger, so usage is still recorded either way and
  // nothing goes unbilled.
  if (!row) return { allowed: true, reason: 'unknown', used: 0, included: null }

  return {
    allowed: Boolean(row.allowed),
    reason: row.reason,
    used: row.used ?? 0,
    included: row.included,
  }
}

/** Plain-English explanation of a blocked or flagged send. */
export function entitlementMessage(e: Entitlement): string | null {
  switch (e.reason) {
    case 'subscription_cancelled':
      return 'Your subscription is cancelled, so documents cannot be sent. Reactivate it in Settings to carry on.'
    case 'subscription_paused':
      return 'Your subscription is paused. Resume it in Settings to send documents again.'
    case 'hard_cap_reached':
      return `You have hit the sending cap you set (${e.used} envelopes this month). Raise it in Settings to continue.`
    case 'past_due':
      return 'Your last invoice is unpaid. Sending still works, but please update your payment details.'
    case 'overage':
      return e.included
        ? `You have used all ${e.included} envelopes included this month. Further sends are charged at your overage rate.`
        : null
    default:
      return null
  }
}

/** Graduated bands as a readable price list. */
export function describeBand(band: VolumeBand, currencySymbol: string): string {
  const to = band.toQty === null ? 'and above' : `to ${band.toQty.toLocaleString()}`
  return `${band.fromQty.toLocaleString()} ${to} — ${currencySymbol}${band.unitPrice} each`
}
