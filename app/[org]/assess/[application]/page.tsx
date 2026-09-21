import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, Stat } from '@/components/ui'
import { toggleShortlist } from './actions'
import { ScoringForm } from './scoring-form'

export const metadata = { title: 'Assessment' }

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

export default async function AssessPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; application: string }>
  searchParams: Promise<{ scorecard?: string }>
}) {
  const { org: slug, application: applicationId } = await params
  const { scorecard: picked } = await searchParams
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: application } = await supabase
    .from('applications')
    .select('id, score, candidates(id, full_name, current_title), jobs(id, title), pipeline_stages(name)')
    .eq('org_id', ctx.orgId)
    .eq('id', applicationId)
    .maybeSingle()

  if (!application) notFound()

  const [{ data: scorecards }, { data: assessments }] = await Promise.all([
    supabase
      .from('scorecards')
      .select('id, name, criteria')
      .eq('org_id', ctx.orgId)
      .order('name'),
    supabase
      .from('assessments')
      .select('id, scorecard_id, assessor_id, scores, weighted_total, recommendation, summary, submitted_at, shortlisted, profiles(full_name)')
      .eq('org_id', ctx.orgId)
      .eq('application_id', applicationId)
      .order('weighted_total', { ascending: false, nullsFirst: false }),
  ])

  const usable = (scorecards ?? []).filter((s) => criteriaOf(s.criteria).length > 0)
  const mine = (assessments ?? []).find((a) => a.assessor_id === ctx.userId)
  const activeId = picked ?? mine?.scorecard_id ?? usable[0]?.id ?? ''
  const active = usable.find((s) => s.id === activeId)
  const criteria = criteriaOf(active?.criteria)

  const candidate = application.candidates as unknown as {
    id: string
    full_name: string
    current_title: string | null
  } | null
  const job = application.jobs as unknown as { id: string; title: string } | null
  const stage = application.pipeline_stages as unknown as { name: string } | null

  const existing =
    (assessments ?? []).find(
      (a) => a.assessor_id === ctx.userId && a.scorecard_id === activeId,
    ) ?? null

  const submitted = (assessments ?? []).filter((a) => a.submitted_at)
  const consensus = submitted.length
    ? Math.round(
        submitted.reduce((sum, a) => sum + Number(a.weighted_total ?? 0), 0) /
          submitted.length,
      )
    : null

  return (
    <div className="space-y-5">
      <nav className="text-sm">
        <Link href={`/${slug}/pipeline`} className="text-accent hover:underline">
          ← Pipeline
        </Link>
      </nav>

      <header>
        <h1 className="text-2xl">{candidate?.full_name ?? 'Candidate'}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          {job?.title ?? 'Role'}
          {candidate?.current_title && ` · currently ${candidate.current_title}`}
          {stage && ` · ${stage.name}`}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Assessments submitted"
          value={submitted.length}
          hint={submitted.length === 0 ? 'None yet' : undefined}
        />
        <Stat
          label="Consensus score"
          value={consensus !== null ? `${consensus} / 500` : '—'}
          hint={submitted.length > 1 ? `averaged across ${submitted.length}` : undefined}
        />
        <Stat
          label="On the application"
          value={application.score !== null ? `${application.score}%` : '—'}
          hint="Derived, not typed"
        />
      </div>

      {usable.length === 0 ? (
        <Panel>
          <p className="text-sm text-ink-soft">
            No usable scorecard. A scorecard needs criteria whose weights sum to
            100 before anything can be scored against it.{' '}
            <Link href={`/${slug}/scorecards`} className="text-accent underline">
              Scorecards
            </Link>
          </p>
        </Panel>
      ) : (
        <>
          {usable.length > 1 && (
            <form className="flex gap-2 items-end text-sm">
              <div>
                <label className="block text-xs text-ink-soft mb-1" htmlFor="scorecard">
                  Scorecard
                </label>
                <select id="scorecard" name="scorecard" defaultValue={activeId} className="field">
                  {usable.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <button className="btn">Switch</button>
            </form>
          )}

          <ScoringForm
            slug={slug}
            applicationId={applicationId}
            scorecardId={activeId}
            criteria={criteria}
            existing={
              existing
                ? {
                    scores: (existing.scores ?? {}) as Record<
                      string,
                      { score?: number; evidence?: string }
                    >,
                    recommendation: existing.recommendation,
                    summary: existing.summary,
                    submitted: Boolean(existing.submitted_at),
                    weightedTotal: existing.weighted_total,
                  }
                : null
            }
          />
        </>
      )}

      {(assessments ?? []).length > 0 && (
        <Panel title="Everyone who has scored">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Assessor</th><th>Score</th><th>Recommendation</th>
                  <th>State</th><th>Shortlist</th>
                </tr>
              </thead>
              <tbody>
                {(assessments ?? []).map((a) => {
                  const who = a.profiles as unknown as { full_name: string | null } | null
                  return (
                    <tr key={a.id} className="align-top">
                      <td className="text-sm">
                        {who?.full_name ?? 'Someone'}
                        {a.assessor_id === ctx.userId && (
                          <span className="text-xs text-ink-muted"> (you)</span>
                        )}
                        {a.summary && (
                          <span className="block text-xs text-ink-muted max-w-lg mt-0.5">
                            {a.summary}
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums text-sm">
                        {a.weighted_total !== null ? `${a.weighted_total} / 500` : '—'}
                      </td>
                      <td className="text-sm text-ink-soft">
                        {a.recommendation?.replace(/_/g, ' ') ?? '—'}
                      </td>
                      <td>
                        {a.submitted_at ? (
                          <Pill tone="success">submitted</Pill>
                        ) : (
                          <Pill tone="warning">in progress</Pill>
                        )}
                      </td>
                      <td>
                        {a.weighted_total !== null && (
                          <form action={toggleShortlist.bind(null, slug)}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="applicationId" value={applicationId} />
                            <input
                              type="hidden" name="on"
                              value={a.shortlisted ? 'false' : 'true'}
                            />
                            <button className="text-xs underline text-ink-soft">
                              {a.shortlisted ? 'Remove' : 'Add'}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            The application shows the average across submitted assessments, not the
            best of them. One enthusiastic scorer should not carry a candidate onto
            a client&rsquo;s shortlist.
          </p>
        </Panel>
      )}
    </div>
  )
}
