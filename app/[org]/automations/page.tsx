import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill } from '@/components/ui'
import { ToggleAutomation } from './toggle'

export const metadata = { title: 'Automations' }

// Trigger keys are stored as machine strings; this is the only place they
// are turned into something a person reads.
const TRIGGER_LABEL: Record<string, string> = {
  'application.created': 'Someone applies',
  'application.stalled': 'An application sits too long',
  'application.stage_changed': 'A candidate moves stage',
  'envelope.completed': 'A document is fully signed',
  'envelope.unsigned': 'A document stays unsigned',
  'job.published': 'A role goes live',
  'schedule.weekly': 'Every week',
}

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: automations } = await supabase
    .from('automations')
    .select('id, name, trigger_key, active, run_count, last_run_at')
    .eq('org_id', ctx.orgId)
    .order('created_at')

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl">Automations</h1>
        <p className="mt-1 text-sm text-ink-soft">
          These are installed with every workspace. Turn off anything you would
          rather do by hand.
        </p>
      </header>

      {/* Said plainly rather than hidden: the rules exist and can be
          toggled, but nothing fires until the sending layer is connected. */}
      <div role="status" className="panel border-state-warning p-4 text-sm">
        The rules below are stored and can be switched on and off, but they do
        not fire yet — WhatsApp and email sending is not connected. Everything
        else in the platform works without them.
      </div>

      <Panel>
        <ul className="divide-y divide-line -my-1">
          {(automations ?? []).map((a) => (
            <li key={a.id} className="py-3.5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm">{a.name}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  When: {TRIGGER_LABEL[a.trigger_key] ?? a.trigger_key}
                  {a.run_count > 0 && ` · run ${a.run_count} times`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Pill tone={a.active ? 'success' : 'neutral'}>
                  {a.active ? 'on' : 'off'}
                </Pill>
                <ToggleAutomation orgSlug={slug} id={a.id} active={a.active} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
