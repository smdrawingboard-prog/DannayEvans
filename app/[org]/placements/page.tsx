import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, Stat, EmptyState } from '@/components/ui'

export const metadata = { title: 'Placements' }

export default async function PlacementsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: placements } = await supabase
    .from('placements')
    .select(
      `id, start_date, salary, salary_currency, fee_amount, guarantee_until,
       international_placement, destination_country,
       applications(candidates(id, full_name), jobs(id, title)),
       clients(name)`,
    )
    .eq('org_id', ctx.orgId)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(200)

  const { data: checkins } = await supabase
    .from('onboarding_checkins')
    .select('id, placement_id, day_offset, due_on, sent_at, is_solicitation, held_reason, sentiment')
    .eq('org_id', ctx.orgId)
    .is('sent_at', null)
    .order('due_on')
    .limit(200)

  const rows = placements ?? []
  const today = new Date()
  const due = (checkins ?? []).filter((c) => new Date(c.due_on) <= today)
  const held = (checkins ?? []).filter((c) => c.held_reason)
  const inGuarantee = rows.filter(
    (p) => p.guarantee_until && new Date(p.guarantee_until) > today,
  )

  const byPlacement = new Map<string, typeof due>()
  for (const c of due) {
    const list = byPlacement.get(c.placement_id) ?? []
    list.push(c)
    byPlacement.set(c.placement_id, list)
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Placements</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Most agencies lose the candidate at the point of placement. The check-ins
          are scheduled from the start date, not from memory.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Within guarantee" value={inGuarantee.length} />
        <Stat
          label="Check-ins due"
          value={due.length}
          hint={due.length > 0 ? 'Overdue or due today' : undefined}
        />
        <Stat
          label="Held for consent"
          value={held.length}
          hint={held.length > 0 ? 'Referral asks need marketing opt-in' : undefined}
        />
      </div>

      {held.length > 0 && (
        <div role="status" className="panel p-4 text-sm border-state-warning">
          <p className="text-ink">
            {held.length} referral {held.length === 1 ? 'request is' : 'requests are'} held back.
          </p>
          <p className="mt-1 text-ink-soft">
            The day-90 message asks the candidate for introductions, which is direct
            marketing under {ctx.region.privacyRegime} rather than part of the
            placement. It needs its own opt-in before it can be sent.
          </p>
        </div>
      )}

      <Panel title="Placements">
        {rows.length === 0 ? (
          <EmptyState
            title="No placements yet"
            body="A placement is created when an offer is accepted. Its 90-day check-in schedule is laid down automatically from the start date."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Candidate</th><th>Role</th><th>Client</th>
                  <th>Starts</th><th>Guarantee</th><th>Check-ins due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const app = p.applications as unknown as {
                    candidates: { id: string; full_name: string } | null
                    jobs: { id: string; title: string } | null
                  } | null
                  const client = p.clients as unknown as { name: string } | null
                  const overdue = byPlacement.get(p.id) ?? []
                  const guaranteeLive =
                    p.guarantee_until && new Date(p.guarantee_until) > today

                  return (
                    <tr key={p.id} className="hover:bg-bg-secondary">
                      <td>
                        {app?.candidates ? (
                          <Link
                            href={`/${slug}/candidates/${app.candidates.id}`}
                            className="hover:underline"
                          >
                            {app.candidates.full_name}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {p.international_placement && (
                          <span className="block text-xs text-ink-muted">
                            relocating to {p.destination_country}
                          </span>
                        )}
                      </td>
                      <td className="text-ink-soft">{app?.jobs?.title ?? '—'}</td>
                      <td className="text-ink-soft">{client?.name ?? '—'}</td>
                      <td className="text-xs text-ink-soft">
                        {p.start_date
                          ? new Date(p.start_date).toLocaleDateString(ctx.region.locale)
                          : <span className="text-state-warning">not set</span>}
                      </td>
                      <td className="text-xs">
                        {p.guarantee_until ? (
                          <Pill tone={guaranteeLive ? 'accent' : 'neutral'}>
                            {guaranteeLive ? 'live' : 'ended'}
                          </Pill>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-xs">
                        {overdue.length > 0 ? (
                          <span className="text-state-warning">
                            day {overdue.map((c) => c.day_offset).join(', ')}
                          </span>
                        ) : (
                          <span className="text-ink-muted">none</span>
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

      <Panel title="Next check-ins">
        {(checkins ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing scheduled.</p>
        ) : (
          <ul className="text-sm divide-y divide-line">
            {(checkins ?? []).slice(0, 12).map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-ink-soft">
                  Day {c.day_offset}
                  {c.is_solicitation && (
                    <span className="ml-2 text-xs text-ink-muted">asks for referrals</span>
                  )}
                </span>
                <span className="text-xs shrink-0">
                  {c.held_reason ? (
                    <span className="text-state-warning">{c.held_reason}</span>
                  ) : (
                    <span className="text-ink-muted">
                      {new Date(c.due_on).toLocaleDateString(ctx.region.locale)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
