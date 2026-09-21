import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, EmptyState } from '@/components/ui'

export const metadata = { title: 'Scorecards' }

interface Criterion {
  key: string
  label: string
  weight: number
  guidance?: string
}

function criteriaOf(value: unknown): Criterion[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (c): c is Criterion =>
      typeof c === 'object' && c !== null && typeof (c as Criterion).key === 'string',
  )
}

export default async function ScorecardsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: scorecards } = await supabase
    .from('scorecards')
    .select('id, name, criteria, is_system, system_code, job_id, jobs(title)')
    .eq('org_id', ctx.orgId)
    .order('name')

  const rows = scorecards ?? []

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Scorecards</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Weights are agreed with the client at the start of a search. That
          agreement is what stops the argument at shortlist presentation.
        </p>
      </header>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="No scorecards yet"
            body="The executive scorecards install with a new workspace. Reweight one per mandate and it becomes yours."
          />
        </Panel>
      ) : (
        <div className="space-y-5">
          {rows.map((s) => {
            const criteria = criteriaOf(s.criteria)
            const total = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0)
            const job = s.jobs as unknown as { title: string } | null
            const draft = criteria.length === 0

            return (
              <Panel
                key={s.id}
                title={s.name}
                action={
                  <div className="flex items-center gap-2">
                    {job && <Pill>{job.title}</Pill>}
                    <Pill tone={s.is_system ? 'neutral' : 'accent'}>
                      {s.is_system ? 'Standard' : 'Yours'}
                    </Pill>
                  </div>
                }
              >
                {draft ? (
                  <p className="text-sm text-ink-muted">
                    Draft — no criteria yet. Nothing can be scored against it until
                    the weights add up to 100.
                  </p>
                ) : (
                  <>
                    <table className="table-base">
                      <thead>
                        <tr><th>Criterion</th><th className="w-24">Weight</th><th>Looking for</th></tr>
                      </thead>
                      <tbody>
                        {criteria.map((c) => (
                          <tr key={c.key}>
                            <td>{c.label}</td>
                            <td className="text-ink-soft tabular-nums">{c.weight}%</td>
                            <td className="text-xs text-ink-muted max-w-md">
                              {c.guidance ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3 text-xs text-ink-muted">
                      Totals {total}%. Maximum score {total * 5}, which the platform
                      computes from the scores rather than accepting a typed total.
                    </p>
                  </>
                )}
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
