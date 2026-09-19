import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/region'
import { getUsageEstimate } from '@/lib/billing'
import { Panel, Pill, Stat, statusTone, EmptyState } from '@/components/ui'

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const ctx = await requireOrg(org)
  return { title: `${ctx.name} — Overview` }
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  // One round trip per tile rather than a single wide join: each of these is
  // a count, and counts do not benefit from being joined.
  const [estimate, openRoles, inPipeline, awaitingSignature, placedThisMonth, pipelineValue, recentEnvelopes, stalling] =
    await Promise.all([
      getUsageEstimate(ctx.orgId),
      supabase.from('jobs').select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId).eq('status', 'open'),
      supabase.from('applications').select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId),
      supabase.from('envelopes').select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId).in('status', ['sent', 'in_progress']),
      supabase.from('placements').select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .gte('created_at', new Date(new Date().setDate(1)).toISOString()),
      supabase.from('deals').select('value').eq('org_id', ctx.orgId).is('closed_at', null),
      supabase.from('envelopes')
        .select('id, subject, status, created_at')
        .eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(6),
      supabase.from('applications')
        .select('id, stage_entered_at, candidates(full_name), jobs(title), pipeline_stages(name, sla_days)')
        .eq('org_id', ctx.orgId).order('stage_entered_at').limit(50),
    ])

  const totalPipeline = (pipelineValue.data ?? []).reduce(
    (sum, d) => sum + Number(d.value ?? 0), 0,
  )

  // "Stalling" means past the stage's own SLA, which each org configures.
  const now = Date.now()
  const stalled = (stalling.data ?? [])
    .map((a) => {
      const stage = a.pipeline_stages as unknown as { name: string; sla_days: number | null } | null
      const days = Math.floor((now - new Date(a.stage_entered_at).getTime()) / 86_400_000)
      return { ...a, stageName: stage?.name, sla: stage?.sla_days, days }
    })
    .filter((a) => a.sla != null && a.days > a.sla!)
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl">Overview</h1>
        <Link href={`/${slug}/jobs/new`} className="btn btn-primary">Add a role</Link>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Stat label="Open roles" value={openRoles.count ?? 0} />
        <Stat label="In pipeline" value={inPipeline.count ?? 0} />
        <Stat
          label="Awaiting signature"
          value={awaitingSignature.count ?? 0}
          hint={awaitingSignature.count ? 'Chase these first' : undefined}
        />
        <Stat label="Placed this month" value={placedThisMonth.count ?? 0} />
        <Stat
          label="Pipeline value"
          value={formatMoney(totalPipeline, ctx.currency, ctx.region.locale)}
        />
      </div>

      {/* Surfaced on the overview, not buried in settings: a customer should
          never learn they are into overage from the invoice. */}
      {estimate && estimate.included !== null && estimate.used >= estimate.included && (
        <div role="status" className="panel border-state-warning p-4 text-sm">
          You have used {estimate.used} of {estimate.included} envelopes included
          this month. Further sends are charged at your overage rate — currently{' '}
          {formatMoney(estimate.usageAmount, estimate.currency, ctx.region.locale)} this period.{' '}
          <Link href={`/${slug}/settings/billing`} className="text-accent underline">
            See your usage
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Needs attention"
          action={<Link href={`/${slug}/pipeline`} className="text-xs text-accent underline">Pipeline</Link>}
        >
          {stalled.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing is past its stage target. That is the goal.
            </p>
          ) : (
            <table className="table-base">
              <thead>
                <tr><th>Candidate</th><th>Role</th><th>Stage</th><th>Days</th></tr>
              </thead>
              <tbody>
                {stalled.map((a) => {
                  const c = a.candidates as unknown as { full_name: string } | null
                  const j = a.jobs as unknown as { title: string } | null
                  return (
                    <tr key={a.id}>
                      <td>{c?.full_name ?? '—'}</td>
                      <td className="text-ink-soft">{j?.title ?? '—'}</td>
                      <td className="text-ink-soft">{a.stageName}</td>
                      <td>
                        <Pill tone={a.days > (a.sla ?? 0) * 2 ? 'danger' : 'warning'}>
                          {a.days}d
                        </Pill>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          title="Recent documents"
          action={<Link href={`/${slug}/envelopes`} className="text-xs text-accent underline">All</Link>}
        >
          {(recentEnvelopes.data ?? []).length === 0 ? (
            <EmptyState
              title="Nothing sent yet"
              body="Send an offer letter, a contract or terms of business and it will be tracked here with a full audit trail."
              href={`/${slug}/envelopes/new`}
              cta="Send a document"
            />
          ) : (
            <ul className="divide-y divide-line -my-1">
              {recentEnvelopes.data!.map((e) => (
                <li key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                  <Link href={`/${slug}/envelopes/${e.id}`} className="text-sm truncate hover:underline">
                    {e.subject}
                  </Link>
                  <Pill tone={statusTone(e.status)}>{e.status.replace('_', ' ')}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
