import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill } from '@/components/ui'
import {
  buildMergeValues,
  renderTemplate,
  templateFields,
  statusLabel,
} from '@/lib/templates'
import { SendTemplateForm } from './send-form'

export const metadata = { title: 'Agreement' }

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ client?: string; candidate?: string; job?: string }>
}) {
  const { org: slug, id } = await params
  const picked = await searchParams
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: template } = await supabase
    .from('document_templates')
    .select('id, name, description, category, status, signed_by, merge_keys, field_schema, body_html, jurisdiction, is_system')
    .eq('org_id', ctx.orgId)
    .eq('id', id)
    .maybeSingle()

  if (!template) notFound()

  const [{ data: clients }, { data: candidates }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('org_id', ctx.orgId).order('name').limit(200),
    supabase
      .from('candidates')
      .select('id, full_name')
      .eq('org_id', ctx.orgId)
      .is('anonymised_at', null)
      .order('full_name')
      .limit(200),
  ])

  const values = await buildMergeValues({
    orgId: ctx.orgId,
    clientId: picked.client ?? null,
    candidateId: picked.candidate ?? null,
    jobId: picked.job ?? null,
  })
  const rendered = renderTemplate(template.body_html ?? '', values)
  const fields = templateFields(template.field_schema)
  const status = statusLabel(template.status)
  const sendable = template.status !== 'needs_legal_drafting'

  const signsCandidate = (template.signed_by ?? []).includes('candidate')
  const signsClient = (template.signed_by ?? []).includes('client')

  return (
    <div className="space-y-5">
      <nav className="text-sm">
        <Link href={`/${slug}/templates`} className="text-accent hover:underline">
          ← Agreements
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{template.name}</h1>
          {template.description && (
            <p className="mt-1 text-sm text-ink-soft max-w-2xl">{template.description}</p>
          )}
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </header>

      {!sendable && (
        <div role="status" className="panel p-4 text-sm border-state-danger">
          <p className="text-ink">This agreement has not been drafted.</p>
          <p className="mt-1 text-ink-soft">
            What follows is a list of the clauses it needs, not enforceable terms.
            It cannot be sent until a practitioner writes it.
          </p>
        </div>
      )}

      {sendable && rendered.missing.length > 0 && (
        <div role="status" className="panel p-4 text-sm border-state-warning">
          <p className="text-ink">
            {rendered.missing.length}{' '}
            {rendered.missing.length === 1 ? 'blank has' : 'blanks have'} nothing to fill them.
          </p>
          <p className="mt-1 text-ink-soft">
            They will print as visible gaps:{' '}
            <span className="font-mono text-xs">{rendered.missing.join(', ')}</span>
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        <Panel title="As it will be sent">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-ink font-body">
            {rendered.body}
          </pre>
        </Panel>

        <div className="space-y-5">
          <Panel title="Fill it in">
            <form className="space-y-3 text-sm">
              {signsClient && (
                <div>
                  <label className="block text-xs text-ink-soft mb-1" htmlFor="client">
                    Client
                  </label>
                  <select
                    id="client" name="client" className="field"
                    defaultValue={picked.client ?? ''}
                  >
                    <option value="">Not chosen</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {signsCandidate && (
                <div>
                  <label className="block text-xs text-ink-soft mb-1" htmlFor="candidate">
                    Candidate
                  </label>
                  <select
                    id="candidate" name="candidate" className="field"
                    defaultValue={picked.candidate ?? ''}
                  >
                    <option value="">Not chosen</option>
                    {(candidates ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button className="btn w-full">Preview with these</button>
            </form>
          </Panel>

          <Panel title="Signed by">
            <ul className="text-sm space-y-2">
              {fields.length === 0 && (
                <li className="text-ink-muted">No signing fields defined.</li>
              )}
              {fields.map((f, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <span className="text-ink-soft">{f.label}</span>
                  <span className="text-xs text-ink-muted shrink-0">
                    {f.recipient ?? 'either'}
                    {f.required === false && ' · optional'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">
              These are typed by whoever signs. They are never filled in from your
              records.
            </p>
          </Panel>

          {sendable && (
            <Panel title="Send for signature">
              <SendTemplateForm
                slug={slug}
                templateId={template.id}
                clientId={picked.client ?? ''}
                candidateId={picked.candidate ?? ''}
                needsClient={signsClient}
                needsCandidate={signsCandidate}
                missing={rendered.missing}
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
