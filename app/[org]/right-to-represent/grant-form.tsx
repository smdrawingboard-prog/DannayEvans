'use client'

import { useActionState, useState } from 'react'
import { grantRightToRepresent, type GrantResult } from './actions'

export function GrantForm({
  slug,
  candidates,
  clients,
}: {
  slug: string
  candidates: { id: string; full_name: string }[]
  clients: { id: string; name: string }[]
}) {
  const action = grantRightToRepresent.bind(null, slug)
  const [state, formAction, pending] = useActionState<GrantResult, FormData>(action, {})
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')

  // An agency often submits to a company that is not a client record yet, so
  // picking one fills the name but typing a name on its own is also fine.
  function pickClient(id: string) {
    setClientId(id)
    const found = clients.find((c) => c.id === id)
    if (found) setClientName(found.name)
  }

  return (
    <form action={formAction} className="space-y-3 text-sm">
      <div>
        <label className="block text-xs text-ink-soft mb-1" htmlFor="candidateId">
          Candidate
        </label>
        <select id="candidateId" name="candidateId" required className="field">
          <option value="">Choose…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-ink-soft mb-1" htmlFor="clientId">
          Existing client (optional)
        </label>
        <select
          id="clientId" name="clientId" className="field"
          value={clientId} onChange={(e) => pickClient(e.target.value)}
        >
          <option value="">Not a client yet</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-ink-soft mb-1" htmlFor="clientName">
          Employer name
        </label>
        <input
          id="clientName" name="clientName" required className="field"
          value={clientName} onChange={(e) => setClientName(e.target.value)}
          placeholder="Who the candidate is being submitted to"
        />
      </div>

      <div>
        <label className="block text-xs text-ink-soft mb-1" htmlFor="months">
          Valid for (months)
        </label>
        <input
          id="months" name="months" type="number" min={1} max={24}
          defaultValue={6} className="field"
        />
      </div>

      <div>
        <label className="block text-xs text-ink-soft mb-1" htmlFor="notes">
          Notes (optional)
        </label>
        <textarea id="notes" name="notes" rows={2} className="field" />
      </div>

      {state.error && <p role="alert" className="text-state-danger">{state.error}</p>}
      {state.ok && <p role="status" className="text-state-success">{state.ok}</p>}

      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? 'Recording…' : 'Record grant'}
      </button>
    </form>
  )
}
