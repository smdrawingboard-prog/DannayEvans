import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { EmptyState, Panel } from '@/components/ui'
import { Board, type Card, type Stage } from './board'

export const metadata = { title: 'Pipeline' }

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ job?: string }>
}) {
  const { org: slug } = await params
  const { job: jobFilter } = await searchParams
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [{ data: stages }, { data: jobs }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, name, sla_days')
      .eq('org_id', ctx.orgId)
      .eq('kind', 'candidate')
      .order('position'),
    supabase
      .from('jobs')
      .select('id, title')
      .eq('org_id', ctx.orgId)
      .in('status', ['open', 'shortlisting', 'interviewing', 'offer'])
      .order('title'),
  ])

  let query = supabase
    .from('applications')
    .select('id, stage_id, stage_entered_at, score, candidates(id, full_name, current_title), jobs(id, title)')
    .eq('org_id', ctx.orgId)
    .limit(500)

  if (jobFilter) query = query.eq('job_id', jobFilter)

  const { data: applications } = await query

  const slaByStage = new Map(
    (stages ?? []).map((s) => [s.id, s.sla_days as number | null]),
  )
  const now = Date.now()

  const cards: Card[] = (applications ?? []).map((a) => {
    const c = a.candidates as unknown as { id: string; full_name: string; current_title: string | null } | null
    const j = a.jobs as unknown as { id: string; title: string } | null
    return {
      id: a.id,
      stageId: a.stage_id,
      candidateId: c?.id ?? '',
      score: a.score,
      candidateName: c?.full_name ?? 'Unknown',
      currentTitle: c?.current_title ?? null,
      jobTitle: j?.title ?? '—',
      daysInStage: Math.floor((now - new Date(a.stage_entered_at).getTime()) / 86_400_000),
      sla: a.stage_id ? slaByStage.get(a.stage_id) ?? null : null,
    }
  })

  const boardStages: Stage[] = (stages ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    slaDays: s.sla_days,
  }))

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl">Pipeline</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Cards turn amber past the target you set for that stage.
          </p>
        </div>
        <Link href={`/${slug}/settings`} className="text-sm text-accent hover:underline">
          Edit stages
        </Link>
      </header>

      {(jobs ?? []).length > 0 && (
        <nav className="flex gap-1 flex-wrap" aria-label="Filter by role">
          <Link
            href={`/${slug}/pipeline`}
            aria-current={!jobFilter ? 'page' : undefined}
            className={`pill ${!jobFilter ? 'border-accent bg-accent-light text-accent' : 'border-line text-ink-soft hover:bg-bg-secondary'}`}
          >
            All roles
          </Link>
          {jobs!.map((j) => (
            <Link
              key={j.id}
              href={`/${slug}/pipeline?job=${j.id}`}
              aria-current={jobFilter === j.id ? 'page' : undefined}
              className={`pill ${jobFilter === j.id ? 'border-accent bg-accent-light text-accent' : 'border-line text-ink-soft hover:bg-bg-secondary'}`}
            >
              {j.title}
            </Link>
          ))}
        </nav>
      )}

      {cards.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nobody in the pipeline"
            body="Publish a role and applications from your careers site land here automatically."
            href={`/${slug}/jobs`}
            cta="Go to roles"
          />
        </Panel>
      ) : (
        <Board orgSlug={slug} stages={boardStages} cards={cards} />
      )}
    </div>
  )
}
