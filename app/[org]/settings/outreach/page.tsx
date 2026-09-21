import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, Stat } from '@/components/ui'
import { OutreachForms } from './forms'

export const metadata = { title: 'Outreach and consent' }

export default async function OutreachSettingsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [{ data: org }, { data: suppressions }, { data: canSend }] = await Promise.all([
    supabase
      .from('organisations')
      .select(
        'legal_name, registration_number, vat_number, information_officer_name, information_officer_email, postal_address, sender_name, unsubscribe_url',
      )
      .eq('id', ctx.orgId)
      .maybeSingle(),
    supabase
      .from('suppressions')
      .select('id, address, channel, reason, source, created_at')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('org_can_send_marketing', { p_org: ctx.orgId }),
  ])

  const ready = canSend === true
  const isZA = ctx.region.privacyRegime.includes('POPIA')

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl">Outreach and consent</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          What has to be true before a marketing message can leave this workspace.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Marketing sends"
          value={ready ? 'Enabled' : 'Blocked'}
          hint={ready ? 'Sender details are complete' : 'Fill in the details below'}
        />
        <Stat label="Suppressed addresses" value={(suppressions ?? []).length} />
      </div>

      {isZA && (
        <Panel title="The rule that applies here">
          <div className="text-sm text-ink-soft space-y-2">
            <p>
              POPIA section 69 does not work like the UK rule. Electronic direct
              marketing needs the recipient&rsquo;s consent, or an existing customer
              relationship for similar services. Where neither holds you may
              approach them <strong className="text-ink">once</strong> to ask for
              that consent — and not at all if they have already refused.
            </p>
            <p>
              A juristic person is a data subject under POPIA, so
              &ldquo;it is business to business&rdquo; does not carry the exemption
              across the way it does under UK GDPR.
            </p>
            <p className="text-ink-muted text-xs">
              The platform enforces this: a second unconsented approach to the same
              address is refused at the point of sending, not flagged afterwards.
            </p>
          </div>
        </Panel>
      )}

      <OutreachForms slug={slug} org={org ?? {}} canEdit={ctx.role === 'owner' || ctx.role === 'admin'} />

      <Panel title="Suppression list">
        <p className="text-sm text-ink-soft mb-3">
          Permanent, and it crosses every channel. An opt-out outranks a consent
          recorded later, and it cannot be edited or deleted away.
        </p>
        {(suppressions ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">Nobody has opted out.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Address</th><th>Reason</th><th>Source</th><th>When</th></tr>
              </thead>
              <tbody>
                {(suppressions ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">{s.address}</td>
                    <td><Pill>{s.reason.replace(/_/g, ' ')}</Pill></td>
                    <td className="text-xs text-ink-muted">{s.source ?? '—'}</td>
                    <td className="text-xs text-ink-muted">
                      {new Date(s.created_at).toLocaleDateString(ctx.region.locale)}
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
