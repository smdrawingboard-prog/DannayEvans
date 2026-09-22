import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, EmptyState } from '@/components/ui'
import { revokeReportToken } from './actions'
import { MintForm } from './mint-form'

export const metadata = { title: 'Reporting' }

export default async function ReportingPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [{ data: tokens }, { data: exports }] = await Promise.all([
    supabase
      .from('report_tokens')
      .select('id, name, scopes, expires_at, revoked_at, last_used_at, use_count, created_at')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('report_exports')
      .select('id, report, row_count, created_at')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const rows = tokens ?? []
  const isAdmin = ctx.role === 'owner' || ctx.role === 'admin'
  const now = Date.now()

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl">Reporting</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Read-only access for Google Sheets and anything else that pulls a report.
        </p>
      </header>

      <Panel title="How this works">
        <div className="text-sm text-ink-soft space-y-2">
          <p>
            A report token is its own credential. It reads named reports for this
            workspace and nothing else — it is not a database key, it cannot write,
            and it cannot reach another workspace.
          </p>
          <p>
            The token is shown <strong className="text-ink">once</strong>. Only a
            hash is stored, so it cannot be looked up later. If you lose it, revoke
            it and mint another.
          </p>
          <p className="text-ink-muted text-xs">
            Anyone with edit access to the spreadsheet can read the token inside it.
            Share the sheet accordingly, and revoke the token here if it goes
            somewhere it should not have. Every pull is logged below.
          </p>
        </div>
      </Panel>

      {isAdmin ? (
        <MintForm slug={slug} />
      ) : (
        <Panel>
          <p className="text-sm text-ink-soft">
            Only an owner or admin can create a report token.
          </p>
        </Panel>
      )}

      <Panel title="Tokens">
        {rows.length === 0 ? (
          <EmptyState
            title="No tokens yet"
            body="Create one to connect a spreadsheet. Scope it to just the reports that sheet needs."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th><th>Reports</th><th>State</th>
                  <th>Used</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const expired = new Date(t.expires_at).getTime() <= now
                  const live = !t.revoked_at && !expired
                  return (
                    <tr key={t.id} className="align-top">
                      <td>
                        {t.name}
                        <span className="block text-xs text-ink-muted">
                          expires{' '}
                          {new Date(t.expires_at).toLocaleDateString(ctx.region.locale)}
                        </span>
                      </td>
                      <td className="text-xs text-ink-soft">
                        {(t.scopes ?? []).join(', ')}
                      </td>
                      <td>
                        {t.revoked_at ? (
                          <Pill tone="danger">revoked</Pill>
                        ) : expired ? (
                          <Pill tone="warning">expired</Pill>
                        ) : (
                          <Pill tone="success">live</Pill>
                        )}
                      </td>
                      <td className="text-xs text-ink-muted">
                        {t.use_count} {t.use_count === 1 ? 'pull' : 'pulls'}
                        {t.last_used_at && (
                          <span className="block">
                            last{' '}
                            {new Date(t.last_used_at).toLocaleDateString(ctx.region.locale)}
                          </span>
                        )}
                      </td>
                      <td>
                        {live && isAdmin && (
                          <form action={revokeReportToken.bind(null, slug)}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="text-xs text-state-danger underline">
                              Revoke
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
        )}
      </Panel>

      <Panel title="Recent pulls">
        {(exports ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing has been exported yet.</p>
        ) : (
          <ul className="text-sm divide-y divide-line">
            {(exports ?? []).map((x) => (
              <li key={x.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-ink-soft">{x.report}</span>
                <span className="text-xs text-ink-muted">
                  {x.row_count} rows ·{' '}
                  {new Date(x.created_at).toLocaleString(ctx.region.locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="What leaves the building">
        <div className="text-sm text-ink-soft space-y-2">
          <p>
            The candidate export carries names, contact details, current role,
            location, skills, consent state and retention date. It carries{' '}
            <strong className="text-ink">no identity numbers</strong>, no date of
            birth, and nothing from the special personal information categories —
            no criminal checks, no medical disclosures.
          </p>
          <p className="mb-0">
            A candidate who has asked to be erased, or who has been anonymised, is
            not in the export at all. A spreadsheet is a file that gets forwarded,
            and {ctx.region.privacyRegime} asks the security of the processing to
            suit the sensitivity of the data.
          </p>
        </div>
      </Panel>
    </div>
  )
}
