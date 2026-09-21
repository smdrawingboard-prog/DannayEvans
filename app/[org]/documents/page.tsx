import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, Stat, EmptyState } from '@/components/ui'
import { deleteDocument } from './actions'
import { UploadPanel } from './upload-panel'
import { DocumentRow } from './document-row'

export const metadata = { title: 'Documents' }

function bytes(n: number | null): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ kind?: string; subject?: string }>
}) {
  const { org: slug } = await params
  const { kind, subject } = await searchParams
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  let query = supabase
    .from('documents')
    .select('id, file_name, mime_type, document_type, size_bytes, subject_type, subject_id, justification, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(300)

  if (kind) query = query.eq('document_type', kind)
  if (subject) query = query.eq('subject_type', subject)

  const [{ data: docs }, { data: kinds }, { data: candidates }, { data: clients }] =
    await Promise.all([
      query,
      supabase
        .from('document_kinds')
        .select('code, label, category, special_personal_information, post_offer_only, guidance')
        .order('category')
        .order('label'),
      supabase
        .from('candidates')
        .select('id, full_name')
        .eq('org_id', ctx.orgId)
        .is('anonymised_at', null)
        .order('full_name')
        .limit(500),
      supabase.from('clients').select('id, name').eq('org_id', ctx.orgId).order('name').limit(200),
    ])

  const rows = docs ?? []
  const taxonomy = kinds ?? []
  const byCode = new Map(taxonomy.map((k) => [k.code, k]))
  const names = new Map<string, string>([
    ...(candidates ?? []).map((c) => [c.id, c.full_name] as [string, string]),
    ...(clients ?? []).map((c) => [c.id, c.name] as [string, string]),
  ])

  const specialCount = rows.filter(
    (d) => byCode.get(d.document_type)?.special_personal_information,
  ).length

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Documents</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Everything you hold, and what {ctx.region.privacyRegime} says about
          holding it.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Documents" value={rows.length} />
        <Stat
          label="Special personal information"
          value={specialCount}
          hint={specialCount > 0 ? 'Criminal or medical records' : undefined}
        />
        <Stat label="Document kinds" value={taxonomy.length} />
      </div>

      <UploadPanel
        slug={slug}
        kinds={taxonomy}
        candidates={candidates ?? []}
        clients={clients ?? []}
      />

      <Panel
        title="Library"
        action={
          <form className="flex gap-2 text-sm">
            <select name="subject" defaultValue={subject ?? ''} className="field py-1">
              <option value="">Everyone</option>
              <option value="candidate">Candidates</option>
              <option value="client">Clients</option>
              <option value="job">Roles</option>
            </select>
            <select name="kind" defaultValue={kind ?? ''} className="field py-1">
              <option value="">All kinds</option>
              {taxonomy.map((k) => (
                <option key={k.code} value={k.code}>{k.label}</option>
              ))}
            </select>
            <button className="btn">Filter</button>
          </form>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            title={kind || subject ? 'Nothing matched' : 'No documents yet'}
            body={
              kind || subject
                ? 'Try a wider filter.'
                : 'Upload a CV, a signed agreement or a verification result and it will be filed against the person it belongs to.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>File</th><th>Kind</th><th>Belongs to</th>
                  <th>Size</th><th>Added</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const k = byCode.get(d.document_type)
                  return (
                    <tr key={d.id} className="hover:bg-bg-secondary align-top">
                      <td>
                        <DocumentRow slug={slug} id={d.id} fileName={d.file_name} />
                        {d.justification && (
                          <span className="block text-xs text-ink-muted max-w-sm mt-0.5">
                            s27: {d.justification}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="text-ink-soft text-sm">
                          {k?.label ?? d.document_type}
                        </span>
                        {k?.special_personal_information && (
                          <span className="block mt-1">
                            <Pill tone="danger">special</Pill>
                          </span>
                        )}
                      </td>
                      <td className="text-ink-soft text-sm">
                        {names.get(d.subject_id) ?? d.subject_type}
                        <span className="block text-xs text-ink-muted">{d.subject_type}</span>
                      </td>
                      <td className="text-xs text-ink-muted">{bytes(d.size_bytes)}</td>
                      <td className="text-xs text-ink-muted">
                        {new Date(d.created_at).toLocaleDateString(ctx.region.locale)}
                      </td>
                      <td>
                        <form action={deleteDocument.bind(null, slug)}>
                          <input type="hidden" name="id" value={d.id} />
                          <button className="text-xs text-ink-soft underline">Delete</button>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="What the rules are">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>Kind</th><th>When</th><th>Why</th></tr>
            </thead>
            <tbody>
              {taxonomy
                .filter((k) => k.special_personal_information || k.post_offer_only || k.guidance)
                .map((k) => (
                  <tr key={k.code}>
                    <td className="text-sm">{k.label}</td>
                    <td className="text-xs">
                      {k.post_offer_only ? (
                        <Pill tone="warning">post-offer only</Pill>
                      ) : k.special_personal_information ? (
                        <Pill tone="danger">consent first</Pill>
                      ) : (
                        <span className="text-ink-muted">any time</span>
                      )}
                    </td>
                    <td className="text-xs text-ink-muted max-w-xl">{k.guidance ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          These are refused at the database, not just hidden here. An upload that
          breaks one of them never reaches storage.
        </p>
      </Panel>
    </div>
  )
}
