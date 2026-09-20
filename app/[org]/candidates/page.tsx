import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, EmptyState } from '@/components/ui'

export const metadata = { title: 'Candidates' }

export default async function CandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { org: slug } = await params
  const { q } = await searchParams
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  let query = supabase
    .from('candidates')
    .select('id, full_name, email, current_title, current_company, city, country, source, consent_given, retain_until, created_at')
    .eq('org_id', ctx.orgId)
    .is('anonymised_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  // Simple ILIKE across the obvious columns. The GIN index on
  // candidate_search_text() is there for when this needs to scale past a
  // few thousand rows and move to full-text ranking.
  if (q?.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(
      `full_name.ilike.${term},current_title.ilike.${term},current_company.ilike.${term},city.ilike.${term}`,
    )
  }

  const { data: candidates } = await query
  const today = new Date()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Candidates</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Everyone in your database, with their {ctx.region.privacyRegime} status.
        </p>
      </header>

      <form className="flex gap-2 max-w-md" role="search">
        <label className="sr-only" htmlFor="q">Search candidates</label>
        <input
          id="q" name="q" defaultValue={q ?? ''} className="field"
          placeholder="Name, job title, company or city"
        />
        <button className="btn">Search</button>
      </form>

      <Panel>
        {(candidates ?? []).length === 0 ? (
          <EmptyState
            title={q ? 'Nothing matched' : 'No candidates yet'}
            body={
              q
                ? 'Try a shorter search term.'
                : 'Candidates arrive when someone applies through your careers site, or when you add them from a sourcing list.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th><th>Current role</th><th>Where</th>
                  <th>Source</th><th>Consent</th><th>Retain until</th>
                </tr>
              </thead>
              <tbody>
                {candidates!.map((c) => {
                  const expiring =
                    c.retain_until &&
                    new Date(c.retain_until).getTime() - today.getTime() < 60 * 86_400_000
                  return (
                    <tr key={c.id} className="hover:bg-bg-secondary">
                      <td>
                        <Link href={`/${slug}/candidates/${c.id}`} className="hover:underline">
                          {c.full_name}
                        </Link>
                        {c.email && (
                          <span className="block text-xs text-ink-muted">{c.email}</span>
                        )}
                      </td>
                      <td className="text-ink-soft">
                        {c.current_title ?? '—'}
                        {c.current_company && (
                          <span className="block text-xs text-ink-muted">{c.current_company}</span>
                        )}
                      </td>
                      <td className="text-ink-soft">
                        {[c.city, c.country].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="text-ink-muted text-xs">{c.source ?? '—'}</td>
                      <td>
                        {c.consent_given
                          ? <Pill tone="success">given</Pill>
                          : <Pill tone="warning">not recorded</Pill>}
                      </td>
                      <td className="text-ink-soft text-xs">
                        {c.retain_until
                          ? <span className={expiring ? 'text-state-warning' : undefined}>
                              {new Date(c.retain_until).toLocaleDateString(ctx.region.locale)}
                            </span>
                          : '—'}
                      </td>
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
