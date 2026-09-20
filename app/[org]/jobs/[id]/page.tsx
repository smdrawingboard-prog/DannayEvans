import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { assistantsFor } from '@/lib/assist/registry'
import { Panel, Pill } from '@/components/ui'
import { updateJob } from '../actions'
import { JobForm } from '../job-form'
import { PublishControls } from './publish-controls'

export const metadata = { title: 'Role' }

export default async function JobPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>
}) {
  const { org: slug, id } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [{ data: job }, { data: clients }] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('clients').select('id, name').eq('org_id', ctx.orgId).order('name'),
  ])

  if (!job) notFound()

  const { data: applications } = await supabase
    .from('applications')
    .select('id, score, candidates(id, full_name, current_title), pipeline_stages(name)')
    .eq('job_id', id)
    .order('created_at', { ascending: false })
    .limit(25)

  const action = updateJob.bind(null, slug, id)
  const assistants = assistantsFor('job')

  return (
    <div className="max-w-3xl space-y-5">
      <nav className="text-sm">
        <Link href={`/${slug}/jobs`} className="text-accent hover:underline">← Roles</Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{job.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
            <Pill tone={job.status === 'open' ? 'success' : 'neutral'}>
              {job.status.replace('_', ' ')}
            </Pill>
            {job.published_at && (
              <span>
                published {new Date(job.published_at).toLocaleDateString(ctx.region.locale)}
              </span>
            )}
          </p>
        </div>
        <PublishControls orgSlug={slug} jobId={id} jobSlug={job.slug} status={job.status} />
      </header>

      <Panel title={`Applicants (${applications?.length ?? 0})`}
        action={<Link href={`/${slug}/pipeline?job=${id}`} className="text-xs text-accent underline">Pipeline</Link>}
      >
        {(applications ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nobody has applied yet. Publish the role and share the link.
          </p>
        ) : (
          <table className="table-base">
            <thead><tr><th>Candidate</th><th>Current role</th><th>Stage</th><th>Score</th></tr></thead>
            <tbody>
              {applications!.map((a) => {
                const c = a.candidates as unknown as { id: string; full_name: string; current_title: string | null } | null
                const s = a.pipeline_stages as unknown as { name: string } | null
                return (
                  <tr key={a.id}>
                    <td>
                      {c ? (
                        <Link href={`/${slug}/candidates/${c.id}`} className="hover:underline">
                          {c.full_name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="text-ink-soft">{c?.current_title ?? '—'}</td>
                    <td className="text-ink-soft">{s?.name ?? '—'}</td>
                    <td>{a.score ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {/* The assistants are registered and their prompts written; the model
          call is not wired yet, so they are listed rather than offered as
          buttons that would do nothing. */}
      <Panel title="Assistants for this role">
        <ul className="space-y-2.5">
          {assistants.map((a) => (
            <li key={a.key} className="text-sm">
              <span className="font-medium">{a.label}</span>
              <span className="text-ink-muted"> · not yet wired</span>
              <span className="block text-ink-soft">{a.description}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <h2 className="text-lg pt-2">Edit</h2>
      <JobForm
        action={action}
        clients={clients ?? []}
        currency={ctx.currency}
        submitLabel="Save changes"
        showSeo
        defaults={{
          title: job.title,
          clientId: job.client_id,
          employmentType: job.employment_type,
          workModel: job.work_model,
          city: job.city,
          country: job.country,
          salaryMin: job.salary_min,
          salaryMax: job.salary_max,
          salaryPeriod: job.salary_period,
          salaryPublic: job.salary_public,
          summary: job.summary,
          description: job.description_md,
          requirements: job.requirements ?? [],
          benefits: job.benefits ?? [],
          openings: job.openings,
          metaTitle: job.meta_title,
          metaDescription: job.meta_description,
          primaryKeyword: job.primary_keyword,
        }}
      />
    </div>
  )
}
