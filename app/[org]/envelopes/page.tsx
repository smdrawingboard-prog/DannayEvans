import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, statusTone, EmptyState } from '@/components/ui'

export const metadata = { title: 'Signatures' }

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'outstanding', label: 'Awaiting signature' },
  { key: 'completed', label: 'Completed' },
  { key: 'draft', label: 'Drafts' },
]

export default async function EnvelopesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const { org: slug } = await params
  const { filter = 'all' } = await searchParams
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  let query = supabase
    .from('envelopes')
    .select('id, subject, status, provider, sent_at, completed_at, created_at, subject_type')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (filter === 'outstanding') query = query.in('status', ['sent', 'in_progress'])
  if (filter === 'completed') query = query.eq('status', 'completed')
  if (filter === 'draft') query = query.eq('status', 'draft')

  const { data: envelopes } = await query

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl">Signatures</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            Every document sent for signature, with its audit trail.
          </p>
        </div>
        <Link href={`/${slug}/envelopes/new`} className="btn btn-primary">Send a document</Link>
      </header>

      <nav className="flex gap-1 flex-wrap" aria-label="Filter">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/${slug}/envelopes?filter=${f.key}`}
            aria-current={filter === f.key ? 'page' : undefined}
            className={`pill ${
              filter === f.key
                ? 'border-accent bg-accent-light text-accent'
                : 'border-line text-ink-soft hover:bg-bg-secondary'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Panel>
        {(envelopes ?? []).length === 0 ? (
          <EmptyState
            title="No documents here"
            body="Offer letters, employment contracts and terms of business are sent from this screen, or automatically when a candidate reaches the Offer stage."
            href={`/${slug}/envelopes/new`}
            cta="Send a document"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Document</th><th>Status</th><th>Linked to</th>
                  <th>Engine</th><th>Sent</th><th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {envelopes!.map((e) => (
                  <tr key={e.id} className="hover:bg-bg-secondary">
                    <td>
                      <Link href={`/${slug}/envelopes/${e.id}`} className="hover:underline">
                        {e.subject}
                      </Link>
                    </td>
                    <td><Pill tone={statusTone(e.status)}>{e.status.replace('_', ' ')}</Pill></td>
                    <td className="text-ink-soft">{e.subject_type ?? '—'}</td>
                    <td className="text-ink-muted font-mono text-xs">{e.provider}</td>
                    <td className="text-ink-soft">
                      {e.sent_at ? new Date(e.sent_at).toLocaleDateString(ctx.region.locale) : '—'}
                    </td>
                    <td className="text-ink-soft">
                      {e.completed_at ? new Date(e.completed_at).toLocaleDateString(ctx.region.locale) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
