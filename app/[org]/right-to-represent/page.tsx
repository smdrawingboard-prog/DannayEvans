import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, Stat, EmptyState } from '@/components/ui'
import { withdrawGrant } from './actions'
import { GrantForm } from './grant-form'

export const metadata = { title: 'Right to represent' }

export default async function RtrPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  // Sweep expired grants before reading, so a stale row never shows as live
  // or blocks a legitimate new submission.
  await supabase.rpc('expire_stale_rtr', { p_org: ctx.orgId })

  const [{ data: grants }, { data: candidates }, { data: clients }] = await Promise.all([
    supabase
      .from('right_to_represent')
      .select('id, client_name, status, granted_at, expires_at, signed_at, envelope_id, notes, candidates(id, full_name)')
      .eq('org_id', ctx.orgId)
      .order('granted_at', { ascending: false })
      .limit(200),
    supabase
      .from('candidates')
      .select('id, full_name')
      .eq('org_id', ctx.orgId)
      .is('anonymised_at', null)
      .order('full_name')
      .limit(500),
    supabase.from('clients').select('id, name').eq('org_id', ctx.orgId).order('name').limit(200),
  ])

  const rows = grants ?? []
  const active = rows.filter((g) => g.status === 'active')
  const soon = active.filter(
    (g) => new Date(g.expires_at).getTime() - Date.now() < 30 * 86_400_000,
  )
  const unsigned = active.filter((g) => !g.signed_at)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Right to represent</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          One live grant per candidate per employer. A second is refused, which is
          what stops the dual submission that costs you the fee.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Live grants" value={active.length} />
        <Stat
          label="Expiring within 30 days"
          value={soon.length}
          hint={soon.length > 0 ? 'Renew before they lapse' : undefined}
        />
        <Stat
          label="Not yet signed"
          value={unsigned.length}
          hint={unsigned.length > 0 ? 'A grant is weak without a signature' : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <Panel title="All grants">
          {rows.length === 0 ? (
            <EmptyState
              title="No grants recorded"
              body="Record one before you send a candidate to an employer. It is the document that decides who is owed the fee if two agencies submit the same person."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Candidate</th><th>Employer</th><th>Status</th>
                    <th>Expires</th><th>Signed</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => {
                    const candidate = g.candidates as unknown as {
                      id: string
                      full_name: string
                    } | null
                    const expiring =
                      g.status === 'active' &&
                      new Date(g.expires_at).getTime() - Date.now() < 30 * 86_400_000
                    return (
                      <tr key={g.id} className="hover:bg-bg-secondary">
                        <td>
                          {candidate ? (
                            <Link
                              href={`/${slug}/candidates/${candidate.id}`}
                              className="hover:underline"
                            >
                              {candidate.full_name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-ink-soft">{g.client_name}</td>
                        <td>
                          {g.status === 'active' ? (
                            <Pill tone="success">live</Pill>
                          ) : (
                            <Pill>{g.status}</Pill>
                          )}
                        </td>
                        <td className="text-xs">
                          <span className={expiring ? 'text-state-warning' : 'text-ink-soft'}>
                            {new Date(g.expires_at).toLocaleDateString(ctx.region.locale)}
                          </span>
                        </td>
                        <td className="text-xs">
                          {g.signed_at ? (
                            <span className="text-ink-soft">
                              {new Date(g.signed_at).toLocaleDateString(ctx.region.locale)}
                            </span>
                          ) : g.envelope_id ? (
                            <Link
                              href={`/${slug}/envelopes/${g.envelope_id}`}
                              className="text-accent hover:underline"
                            >
                              awaiting
                            </Link>
                          ) : (
                            <span className="text-state-warning">not sent</span>
                          )}
                        </td>
                        <td>
                          {g.status === 'active' && (
                            <form action={withdrawGrant.bind(null, slug)}>
                              <input type="hidden" name="id" value={g.id} />
                              <button className="text-xs text-ink-soft underline">
                                Withdraw
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

        <Panel title="Record a grant">
          <GrantForm
            slug={slug}
            candidates={candidates ?? []}
            clients={clients ?? []}
          />
          <p className="mt-3 text-xs text-ink-muted">
            Recording it is not the same as having it signed. Send the Right to
            Represent agreement from{' '}
            <Link href={`/${slug}/templates`} className="text-accent underline">
              Agreements
            </Link>{' '}
            so the candidate actually signs it.
          </p>
        </Panel>
      </div>
    </div>
  )
}
