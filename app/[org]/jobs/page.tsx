import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/region'
import { Panel, Pill, EmptyState } from '@/components/ui'

export const metadata = { title: 'Roles' }

const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  open: 'success',
  shortlisting: 'accent',
  interviewing: 'accent',
  offer: 'warning',
  filled: 'neutral',
  on_hold: 'warning',
  cancelled: 'danger',
}

export default async function JobsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, slug, status, city, country, work_model, employment_type, salary_min, salary_max, salary_currency, salary_public, published_at, openings, clients(name)')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })

  // One grouped count instead of a query per row.
  const { data: counts } = await supabase
    .from('applications')
    .select('job_id')
    .eq('org_id', ctx.orgId)

  const applicantsByJob = new Map<string, number>()
  for (const a of counts ?? []) {
    applicantsByJob.set(a.job_id, (applicantsByJob.get(a.job_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl">Roles</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Publishing a role puts it on your careers site with the structured
            data Google Jobs reads.
          </p>
        </div>
        <Link href={`/${slug}/jobs/new`} className="btn btn-primary">Add a role</Link>
      </header>

      <Panel>
        {(jobs ?? []).length === 0 ? (
          <EmptyState
            title="No roles yet"
            body="Add the first role. You can save it as a draft and publish once the description is ready."
            href={`/${slug}/jobs/new`}
            cta="Add a role"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Role</th><th>Client</th><th>Where</th>
                  <th>Salary</th><th>Applicants</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs!.map((j) => {
                  const client = j.clients as unknown as { name: string } | null
                  const count = applicantsByJob.get(j.id) ?? 0
                  return (
                    <tr key={j.id} className="hover:bg-bg-secondary">
                      <td>
                        <Link href={`/${slug}/jobs/${j.id}`} className="hover:underline">
                          {j.title}
                        </Link>
                        {j.openings > 1 && (
                          <span className="text-xs text-ink-muted"> · {j.openings} openings</span>
                        )}
                      </td>
                      <td className="text-ink-soft">{client?.name ?? '—'}</td>
                      <td className="text-ink-soft">
                        {[j.city, j.country].filter(Boolean).join(', ') || '—'}
                        <span className="block text-xs text-ink-muted">{j.work_model}</span>
                      </td>
                      <td className="text-ink-soft">
                        {j.salary_min
                          ? formatMoney(Number(j.salary_min), j.salary_currency ?? ctx.currency, ctx.region.locale)
                          : '—'}
                        {!j.salary_public && j.salary_min && (
                          <span className="block text-xs text-ink-muted">not shown publicly</span>
                        )}
                      </td>
                      <td>{count || '—'}</td>
                      <td><Pill tone={STATUS_TONE[j.status] ?? 'neutral'}>{j.status.replace('_', ' ')}</Pill></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
