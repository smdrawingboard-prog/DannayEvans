import Link from 'next/link'
import { requireOrg, canManage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { REGIONS } from '@/lib/region'
import { Panel, Pill } from '@/components/ui'

export const metadata = { title: 'Settings' }

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [{ data: members }, { data: stages }, { data: integrations }] =
    await Promise.all([
      supabase
        .from('memberships')
        .select('id, role, active, joined_at, profiles(full_name, email)')
        .eq('org_id', ctx.orgId)
        .order('joined_at'),
      supabase
        .from('pipeline_stages')
        .select('id, kind, name, position, sla_days, probability_pct')
        .eq('org_id', ctx.orgId)
        .order('kind')
        .order('position'),
      supabase
        .from('integrations')
        .select('provider, enabled, last_synced_at, last_error')
        .eq('org_id', ctx.orgId),
    ])

  const candidateStages = (stages ?? []).filter((s) => s.kind === 'candidate')
  const dealStages = (stages ?? []).filter((s) => s.kind === 'deal')
  const region = REGIONS[ctx.region.code]

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl">Settings</h1>
      </header>

      <Panel
        title="Workspace"
        action={
          <Link href={`/${slug}/settings/billing`} className="text-xs text-accent underline">
            Plan and usage
          </Link>
        }
      >
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Name</dt><dd>{ctx.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Address</dt><dd className="font-mono text-xs">/{ctx.slug}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Region</dt><dd>{region.label}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Currency</dt><dd>{ctx.currency}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Privacy regime</dt><dd>{region.privacyRegime}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Signature law</dt><dd>{region.eSignatureLaw}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Default channel</dt><dd>{region.primaryChannel}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          Region drives all of the above. Changing it is not editable here yet.
        </p>
      </Panel>

      <Panel title={`Team (${members?.length ?? 0})`}>
        <table className="table-base">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
          <tbody>
            {(members ?? []).map((m) => {
              const p = m.profiles as unknown as { full_name: string | null; email: string } | null
              return (
                <tr key={m.id}>
                  <td>{p?.full_name ?? '—'}</td>
                  <td className="text-ink-soft truncate">{p?.email}</td>
                  <td><Pill tone={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role}</Pill></td>
                  <td className="text-ink-soft text-xs">
                    {new Date(m.joined_at).toLocaleDateString(ctx.region.locale)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {canManage(ctx.role) && (
          <p className="mt-3 text-xs text-ink-muted">
            Inviting teammates is not built yet — the invitations table and
            policies exist, the screen does not.
          </p>
        )}
      </Panel>

      <Panel title="Pipeline stages">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-ink-soft">Candidates</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {candidateStages.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span>{s.position}. {s.name}</span>
                  <span className="text-ink-muted text-xs">
                    {s.sla_days ? `${s.sla_days}d target` : '—'}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-ink-soft">Deals</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {dealStages.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span>{s.position}. {s.name}</span>
                  <span className="text-ink-muted text-xs">
                    {s.probability_pct !== null ? `${s.probability_pct}%` : '—'}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="mt-4 text-xs text-ink-muted">
          Stages are per workspace and editable in the database. An editor for
          them is not built yet.
        </p>
      </Panel>

      <Panel title="Integrations">
        {(integrations ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">
            None connected. WhatsApp, email, LinkedIn, Apify and the CRM
            connectors have schema and configuration in place; the clients are
            not written yet.
          </p>
        ) : (
          <ul className="divide-y divide-line -my-1">
            {integrations!.map((i) => (
              <li key={i.provider} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <span>{i.provider}</span>
                <Pill tone={i.enabled ? 'success' : 'neutral'}>
                  {i.enabled ? 'on' : 'off'}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
