import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/region'
import { Panel, Stat, EmptyState } from '@/components/ui'
import { createDeal } from './actions'
import { NewDealForm, StageSelect } from './deal-ui'

export const metadata = { title: 'Business development' }

export default async function DealsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [{ data: stages }, { data: deals }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, name, is_won, is_lost, probability_pct')
      .eq('org_id', ctx.orgId)
      .eq('kind', 'deal')
      .order('position'),
    supabase
      .from('deals')
      .select('id, company_name, contact_name, role_to_fill, mandate, value, currency, stage_id, probability_pct, expected_close, outcome, source')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const open = (deals ?? []).filter((d) => !d.outcome)
  const won = (deals ?? []).filter((d) => d.outcome === 'won')

  const pipelineValue = open.reduce((sum, d) => sum + Number(d.value ?? 0), 0)
  // Weighted by each stage's own probability — the forecast a sales lead
  // would actually quote, rather than the gross pipeline.
  const weighted = open.reduce(
    (sum, d) => sum + (Number(d.value ?? 0) * (d.probability_pct ?? 0)) / 100,
    0,
  )
  const wonValue = won.reduce((sum, d) => sum + Number(d.value ?? 0), 0)

  const money = (n: number) => formatMoney(n, ctx.currency, ctx.region.locale)
  const stageOptions = (stages ?? []).map((s) => ({ id: s.id, name: s.name }))

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl">Business development</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Moving a deal to a won or lost stage closes it automatically.
          </p>
        </div>
        <NewDealForm
          action={createDeal.bind(null, slug)}
          stages={stageOptions}
          currency={ctx.currency}
        />
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Open deals" value={open.length} />
        <Stat label="Pipeline value" value={money(pipelineValue)} />
        <Stat label="Weighted forecast" value={money(weighted)} hint="by stage probability" />
        <Stat label="Won" value={money(wonValue)} hint={`${won.length} deals`} />
      </div>

      <Panel>
        {(deals ?? []).length === 0 ? (
          <EmptyState
            title="No deals yet"
            body="Track the clients you are pitching, what the mandate is worth, and where each conversation has got to."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Company</th><th>Role</th><th>Contact</th><th>Mandate</th>
                  <th>Fee</th><th>Close</th><th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {deals!.map((d) => (
                  <tr key={d.id} className="hover:bg-bg-secondary">
                    <td>
                      {d.company_name}
                      {d.source && (
                        <span className="block text-xs text-ink-muted">{d.source}</span>
                      )}
                    </td>
                    <td className="text-ink-soft">{d.role_to_fill ?? '—'}</td>
                    <td className="text-ink-soft">{d.contact_name ?? '—'}</td>
                    <td className="text-ink-soft">{d.mandate}</td>
                    <td>
                      {d.value
                        ? money(Number(d.value))
                        : '—'}
                      {d.probability_pct !== null && !d.outcome && (
                        <span className="block text-xs text-ink-muted">{d.probability_pct}%</span>
                      )}
                    </td>
                    <td className="text-ink-soft text-xs">
                      {d.expected_close
                        ? new Date(d.expected_close).toLocaleDateString(ctx.region.locale)
                        : '—'}
                    </td>
                    <td className="min-w-[10rem]">
                      <StageSelect
                        orgSlug={slug}
                        dealId={d.id}
                        stageId={d.stage_id}
                        stages={stageOptions}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
