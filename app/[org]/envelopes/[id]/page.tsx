import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, statusTone } from '@/components/ui'
import { EnvelopeActions } from './actions-ui'

export const metadata = { title: 'Document' }

const RECIPIENT_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'danger'> = {
  pending: 'neutral',
  delivered: 'accent',
  viewed: 'accent',
  signed: 'success',
  declined: 'danger',
  bounced: 'danger',
}

export default async function EnvelopePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>
}) {
  const { org: slug, id } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  // RLS scopes this to the caller's organisations, so a foreign id simply
  // returns nothing — no extra org_id check is needed here.
  const { data: envelope } = await supabase
    .from('envelopes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!envelope) notFound()

  const [{ data: recipients }, { data: events }, { data: documents }, { data: certificate }] =
    await Promise.all([
      supabase.from('envelope_recipients').select('*').eq('envelope_id', id).order('signing_order'),
      supabase.from('envelope_events').select('*').eq('envelope_id', id).order('occurred_at'),
      supabase.from('envelope_documents').select('*').eq('envelope_id', id).order('position'),
      supabase.from('signature_certificates').select('*').eq('envelope_id', id).maybeSingle(),
    ])

  const fmt = (t: string | null) =>
    t ? new Date(t).toLocaleString(ctx.region.locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  return (
    <div className="space-y-5 max-w-4xl">
      <nav className="text-sm">
        <Link href={`/${slug}/envelopes`} className="text-accent hover:underline">← Signatures</Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{envelope.subject}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
            <Pill tone={statusTone(envelope.status)}>{envelope.status.replace('_', ' ')}</Pill>
            <span>Created {fmt(envelope.created_at)}</span>
            {envelope.sequential && <span>· signs in order</span>}
          </p>
        </div>
        <EnvelopeActions
          orgSlug={slug}
          envelopeId={id}
          status={envelope.status}
          canManage={['owner', 'admin', 'recruiter', 'sales'].includes(ctx.role)}
        />
      </header>

      <Panel title="Recipients">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>#</th><th>Name</th><th>Role</th><th>Status</th><th>Viewed</th><th>Signed</th><th>Identity</th></tr>
            </thead>
            <tbody>
              {(recipients ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="text-ink-muted">{r.signing_order}</td>
                  <td>
                    {r.full_name}
                    <span className="block text-xs text-ink-muted">{r.email}</span>
                  </td>
                  <td className="text-ink-soft">{r.role}</td>
                  <td><Pill tone={RECIPIENT_TONE[r.status] ?? 'neutral'}>{r.status}</Pill></td>
                  <td className="text-ink-soft text-xs">{fmt(r.first_viewed_at)}</td>
                  <td className="text-ink-soft text-xs">{fmt(r.signed_at)}</td>
                  <td className="text-ink-muted text-xs">{r.auth_method.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(recipients ?? []).some((r) => r.status === 'declined') && (
          <p className="mt-3 text-sm text-state-danger">
            Declined: {(recipients ?? []).find((r) => r.decline_reason)?.decline_reason}
          </p>
        )}
      </Panel>

      <Panel title="Documents">
        <ul className="divide-y divide-line -my-1">
          {(documents ?? []).map((d) => (
            <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm truncate">{d.file_name}</span>
              <span className="font-mono text-[11px] text-ink-muted truncate max-w-[16rem]" title={d.sealed_hash ?? d.content_hash ?? ''}>
                {(d.sealed_hash ?? d.content_hash ?? 'no hash recorded').slice(0, 24)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Audit trail">
        <p className="text-sm text-ink-soft mb-4">
          Append-only. This is the record that answers who signed, when, and from
          where. {ctx.region.eSignatureLaw} governs its legal effect in{' '}
          {ctx.region.label}.
        </p>
        <ol className="space-y-3">
          {(events ?? []).map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="font-mono text-xs text-ink-muted shrink-0 w-40 pt-0.5">
                {fmt(e.occurred_at)}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{e.event_type.replace('_', ' ')}</span>
                <span className="text-ink-soft"> — {e.actor_label}</span>
                {e.ip_address && (
                  <span className="block text-xs text-ink-muted font-mono">{e.ip_address}</span>
                )}
              </span>
            </li>
          ))}
        </ol>

        {certificate && (
          <div className="mt-5 pt-4 border-t border-line">
            <div className="text-xs uppercase tracking-wider text-ink-soft">Evidence hash</div>
            <code className="block mt-1 text-xs font-mono break-all text-ink-soft">
              {certificate.evidence_hash}
            </code>
            <p className="mt-2 text-xs text-ink-muted">
              SHA-256 over the ordered event log and every document hash. Recompute
              it to prove nothing has been altered since {fmt(certificate.issued_at)}.
            </p>
          </div>
        )}
      </Panel>
    </div>
  )
}
