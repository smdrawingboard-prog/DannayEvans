import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/region'
import { assistantsFor } from '@/lib/assist/registry'
import { Panel, Pill, statusTone } from '@/components/ui'

export const metadata = { title: 'Candidate' }

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>
}) {
  const { org: slug, id } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: candidate } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!candidate) notFound()

  const [{ data: applications }, { data: envelopes }, { data: documents }] =
    await Promise.all([
      supabase
        .from('applications')
        .select('id, score, rating, stage_entered_at, jobs(id, title), pipeline_stages(name)')
        .eq('candidate_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('envelopes')
        .select('id, subject, status, created_at')
        .eq('subject_type', 'candidate')
        .eq('subject_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('documents')
        .select('id, file_name, document_type, created_at')
        .eq('subject_type', 'candidate')
        .eq('subject_id', id)
        .order('created_at', { ascending: false }),
    ])

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(ctx.region.locale) : '—'

  return (
    <div className="max-w-3xl space-y-5">
      <nav className="text-sm">
        <Link href={`/${slug}/candidates`} className="text-accent hover:underline">
          ← Candidates
        </Link>
      </nav>

      <header>
        <h1 className="text-2xl">{candidate.full_name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {candidate.current_title ?? 'Role not recorded'}
          {candidate.current_company && ` at ${candidate.current_company}`}
          {(candidate.city || candidate.country) &&
            ` · ${[candidate.city, candidate.country].filter(Boolean).join(', ')}`}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Contact">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Email</dt>
              <dd className="truncate">{candidate.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Phone</dt>
              <dd>{candidate.phone ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">LinkedIn</dt>
              <dd className="truncate">
                {candidate.linkedin_url ? (
                  <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer"
                     className="text-accent underline">Profile</a>
                ) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Salary expectation</dt>
              <dd>
                {candidate.salary_expectation
                  ? formatMoney(Number(candidate.salary_expectation),
                      candidate.salary_currency ?? ctx.currency, ctx.region.locale)
                  : '—'}
              </dd>
            </div>
          </dl>
        </Panel>

        {/* Privacy is a first-class panel, not a footnote. These are the
            fields a regulator or a subject access request asks about. */}
        <Panel title={`${ctx.region.privacyRegime} record`}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Lawful basis</dt>
              <dd>{(candidate.lawful_basis as string).replace('_', ' ')}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Consent</dt>
              <dd>
                {candidate.consent_given
                  ? <Pill tone="success">given {fmtDate(candidate.consent_at)}</Pill>
                  : <Pill tone="warning">not recorded</Pill>}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Retain until</dt>
              <dd>{fmtDate(candidate.retain_until)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Right to work</dt>
              <dd>{candidate.right_to_work_checked ? 'Checked' : 'Not checked'}</dd>
            </div>
            {candidate.erasure_requested_at && (
              <p className="text-sm text-state-danger pt-1">
                Erasure requested {fmtDate(candidate.erasure_requested_at)}.
              </p>
            )}
          </dl>
        </Panel>
      </div>

      <Panel title="Applications">
        {(applications ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">Not attached to any role yet.</p>
        ) : (
          <table className="table-base">
            <thead><tr><th>Role</th><th>Stage</th><th>Score</th><th>Since</th></tr></thead>
            <tbody>
              {applications!.map((a) => {
                const j = a.jobs as unknown as { id: string; title: string } | null
                const s = a.pipeline_stages as unknown as { name: string } | null
                return (
                  <tr key={a.id}>
                    <td>
                      {j ? (
                        <Link href={`/${slug}/jobs/${j.id}`} className="hover:underline">{j.title}</Link>
                      ) : '—'}
                    </td>
                    <td className="text-ink-soft">{s?.name ?? '—'}</td>
                    <td>{a.score ?? '—'}</td>
                    <td className="text-ink-soft text-xs">{fmtDate(a.stage_entered_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel
        title="Documents sent for signature"
        action={
          <Link
            href={`/${slug}/envelopes/new?subjectType=candidate&subjectId=${id}`}
            className="text-xs text-accent underline"
          >
            Send a document
          </Link>
        }
      >
        {(envelopes ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-line -my-1">
            {envelopes!.map((e) => (
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

      {(documents ?? []).length > 0 && (
        <Panel title="Files">
          <ul className="divide-y divide-line -my-1">
            {documents!.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{d.file_name}</span>
                <span className="text-xs text-ink-muted">{d.document_type}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Assistants for this candidate">
        <ul className="space-y-2.5">
          {assistantsFor('candidate').map((a) => (
            <li key={a.key} className="text-sm">
              <span className="font-medium">{a.label}</span>
              <span className="text-ink-muted"> · not yet wired</span>
              <span className="block text-ink-soft">{a.description}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {candidate.notes && (
        <Panel title="Notes">
          <p className="text-sm text-ink-soft whitespace-pre-line">{candidate.notes}</p>
        </Panel>
      )}
    </div>
  )
}
