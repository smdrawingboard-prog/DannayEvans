import Link from 'next/link'
import { requireOrg, canManage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/region'
import { checkEntitlement, entitlementMessage, getUsageEstimate } from '@/lib/billing'
import { Panel, Pill, Stat } from '@/components/ui'

export const metadata = { title: 'Plan and usage' }

export default async function BillingPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [estimate, entitlement, { data: subscription }, { data: invoices }, { data: recent }] =
    await Promise.all([
      getUsageEstimate(ctx.orgId),
      checkEntitlement(ctx.orgId),
      supabase
        .from('subscriptions')
        .select('*, pricing_plans(code, name, segment, included_envelopes, included_seats, uses_volume_bands)')
        .eq('org_id', ctx.orgId)
        .maybeSingle(),
      supabase
        .from('invoices')
        .select('*')
        .eq('org_id', ctx.orgId)
        .order('period_start', { ascending: false })
        .limit(12),
      supabase
        .from('usage_events')
        .select('source_id, occurred_at, envelopes:source_id(subject)')
        .eq('org_id', ctx.orgId)
        .order('occurred_at', { ascending: false })
        .limit(10),
    ])

  const plan = subscription?.pricing_plans as unknown as {
    code: string; name: string; segment: string
    included_envelopes: number; included_seats: number; uses_volume_bands: boolean
  } | null

  const money = (n: number) =>
    formatMoney(n, estimate?.currency ?? ctx.currency, ctx.region.locale)

  const included = estimate?.included ?? plan?.included_envelopes ?? 0
  const used = estimate?.used ?? 0
  // Capped at 100 for the bar; the number beside it tells the real story.
  const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0
  const warning = entitlementMessage(entitlement)

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-2xl">Plan and usage</h1>
        <p className="mt-1 text-sm text-ink-soft">
          You are charged for each envelope sent, however many people sign it.
        </p>
      </header>

      {warning && (
        <div
          role="status"
          className={`panel p-4 text-sm ${
            entitlement.allowed ? 'border-state-warning' : 'border-state-danger'
          }`}
        >
          {warning}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Plan"
          value={plan?.name ?? 'Trial'}
          hint={subscription?.status?.replace('_', ' ')}
        />
        <Stat
          label="Envelopes this month"
          value={included > 0 ? `${used} / ${included}` : String(used)}
          hint={estimate && estimate.chargeable > 0 ? `${estimate.chargeable} over` : 'within allowance'}
        />
        <Stat
          label="Estimated charge"
          value={estimate ? money(estimate.totalAmount) : '—'}
          hint="if the period closed now"
        />
      </div>

      <Panel title="This billing period">
        {included > 0 && (
          <>
            {/* A plain meter rather than a chart: one number against one
                limit does not need an axis. */}
            <div
              className="h-2 bg-bg-secondary border border-line rounded-panel overflow-hidden"
              role="progressbar"
              aria-valuenow={used}
              aria-valuemin={0}
              aria-valuemax={included}
              aria-label="Envelopes used against your monthly allowance"
            >
              <div
                className={`h-full ${
                  used >= included ? 'bg-state-warning' : 'bg-accent'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {used} of {included} included envelopes used
              {used > included && ` — ${used - included} charged as overage`}
            </p>
          </>
        )}

        {estimate && (
          <dl className="mt-5 pt-4 border-t border-line space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Base fee{plan ? ` (${plan.name})` : ''}</dt>
              <dd>{money(estimate.baseAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">
                Usage{estimate.chargeable > 0 ? ` — ${estimate.chargeable} envelopes` : ''}
              </dt>
              <dd>{money(estimate.usageAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3 pt-2 border-t border-line font-medium">
              <dt>Estimated total</dt>
              <dd>{money(estimate.totalAmount)}</dd>
            </div>
          </dl>
        )}

        {subscription && (
          <p className="mt-4 text-xs text-ink-muted">
            Period {new Date(subscription.current_period_start).toLocaleDateString(ctx.region.locale)}
            {' to '}
            {new Date(subscription.current_period_end).toLocaleDateString(ctx.region.locale)}.
            Excludes {ctx.region.code === 'ZA' ? 'VAT' : 'sales tax'}.
          </p>
        )}
      </Panel>

      <Panel
        title="Recent charges"
        action={<Link href={`/${slug}/envelopes`} className="text-xs text-accent underline">All documents</Link>}
      >
        {(recent ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing sent this period.</p>
        ) : (
          <ul className="divide-y divide-line -my-1">
            {recent!.map((u) => {
              const env = u.envelopes as unknown as { subject: string } | null
              return (
                <li key={u.source_id} className="py-2.5 flex items-center justify-between gap-3">
                  <Link
                    href={`/${slug}/envelopes/${u.source_id}`}
                    className="text-sm truncate hover:underline"
                  >
                    {env?.subject ?? 'Envelope'}
                  </Link>
                  <span className="text-xs text-ink-muted shrink-0">
                    {new Date(u.occurred_at).toLocaleDateString(ctx.region.locale)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {canManage(ctx.role) && (
        <Panel title="Invoices">
          {(invoices ?? []).length === 0 ? (
            <p className="text-sm text-ink-soft">
              No invoices yet. Your first one is raised at the end of this period.
            </p>
          ) : (
            <table className="table-base">
              <thead>
                <tr><th>Period</th><th>Envelopes</th><th>Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                {invoices!.map((inv) => (
                  <tr key={inv.id}>
                    <td>{new Date(inv.period_start).toLocaleDateString(ctx.region.locale, { month: 'long', year: 'numeric' })}</td>
                    <td className="text-ink-soft">{inv.envelopes_used}</td>
                    <td>{formatMoney(Number(inv.total), inv.currency, ctx.region.locale)}</td>
                    <td>
                      <Pill tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'neutral'}>
                        {inv.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      <p className="text-sm text-ink-soft">
        Need different terms or higher volume?{' '}
        <Link href="/pricing" className="text-accent underline">See the plans</Link> or talk to us
        about enterprise bulk rates.
      </p>
    </div>
  )
}
