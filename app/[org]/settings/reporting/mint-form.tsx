'use client'

import { useActionState } from 'react'
import { Panel } from '@/components/ui'
import { mintReportToken, type TokenResult } from './actions'

const SCOPES: { code: string; label: string; note: string }[] = [
  { code: 'shortlist', label: 'Shortlist', note: 'Scored assessments, ranked, with the recommendation' },
  { code: 'pipeline', label: 'Pipeline', note: 'Counts by stage, median days, what is past target' },
  { code: 'placements', label: 'Placements', note: 'Fees, guarantees, time to fill, outstanding check-ins' },
  { code: 'candidates', label: 'Candidates', note: 'Names and contact details. No identity numbers.' },
  { code: 'clients', label: 'Clients', note: 'Commercials, open roles, whether terms are signed' },
  { code: 'billing', label: 'Billing', note: 'Envelopes sent by month' },
]

export function MintForm({ slug }: { slug: string }) {
  const action = mintReportToken.bind(null, slug)
  const [state, formAction, pending] = useActionState<TokenResult, FormData>(action, {})

  if (state.token) {
    return (
      <Panel title="Copy this now">
        <p className="text-sm text-ink-soft">
          This is the only time <strong className="text-ink">{state.name}</strong> will
          be shown. Paste it into the spreadsheet script as{' '}
          <code className="text-xs">REPORT_TOKEN</code>.
        </p>
        <pre className="mt-3 p-3 bg-bg-secondary border border-line rounded-panel text-xs overflow-x-auto select-all">
{state.token}
        </pre>
        <p className="mt-3 text-xs text-ink-muted">
          Only a hash of it is stored, so nobody — including us — can look it up
          again. Lost it? Revoke it below and mint another.
        </p>
      </Panel>
    )
  }

  return (
    <Panel title="Create a token">
      <form action={formAction} className="space-y-4 text-sm">
        <div>
          <label className="block text-xs text-ink-soft mb-1" htmlFor="name">
            What is it for
          </label>
          <input
            id="name" name="name" required className="field"
            placeholder="Monday KPI sheet"
          />
        </div>

        <fieldset>
          <legend className="text-xs text-ink-soft mb-2">
            Which reports it may read
          </legend>
          <div className="space-y-2">
            {SCOPES.map((s) => (
              <label key={s.code} className="flex items-start gap-2">
                <input
                  type="checkbox" name="scopes" value={s.code}
                  className="mt-1"
                  defaultChecked={s.code === 'pipeline' || s.code === 'placements'}
                />
                <span>
                  <span className="text-ink">{s.label}</span>
                  <span className="block text-xs text-ink-muted">{s.note}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Scope it narrowly. A sheet that shows the weekly numbers has no reason
            to be able to pull the candidate list.
          </p>
        </fieldset>

        <div>
          <label className="block text-xs text-ink-soft mb-1" htmlFor="days">
            Expires after (days)
          </label>
          <input
            id="days" name="days" type="number" min={1} max={365}
            defaultValue={90} className="field w-32"
          />
        </div>

        {state.error && <p role="alert" className="text-state-danger">{state.error}</p>}

        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Creating…' : 'Create token'}
        </button>
      </form>
    </Panel>
  )
}
