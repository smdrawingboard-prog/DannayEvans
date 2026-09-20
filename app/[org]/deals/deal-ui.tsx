'use client'

import { useActionState, useState, useTransition } from 'react'
import { createDeal, moveDeal, type DealResult } from './actions'

export function NewDealForm({
  action,
  stages,
  currency,
}: {
  action: (prev: DealResult, form: FormData) => Promise<DealResult>
  stages: { id: string; name: string }[]
  currency: string
}) {
  const [state, formAction, pending] = useActionState<DealResult, FormData>(action, {})
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        Add a deal
      </button>
    )
  }

  return (
    <form action={formAction} className="panel p-5 w-full">
      <h2 className="text-base">New deal</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="companyName">Company</label>
          <input id="companyName" name="companyName" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="roleToFill">Role they are filling</label>
          <input id="roleToFill" name="roleToFill" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="contactName">Contact</label>
          <input id="contactName" name="contactName" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="contactEmail">Contact email</label>
          <input id="contactEmail" name="contactEmail" type="email" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="mandate">Mandate</label>
          <select id="mandate" name="mandate" className="field" defaultValue="contingency">
            <option value="contingency">Contingency</option>
            <option value="retained">Retained</option>
            <option value="rpo">RPO</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="value">Fee ({currency})</label>
          <input id="value" name="value" type="number" min={0} step="any" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="stageId">Stage</label>
          <select id="stageId" name="stageId" className="field" defaultValue={stages[0]?.id}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="expectedClose">Expected close</label>
          <input id="expectedClose" name="expectedClose" type="date" className="field" />
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="source">Source</label>
        <input id="source" name="source" className="field" placeholder="Referral, LinkedIn, inbound…" />
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} className="field" />
      </div>

      {state.error && <p role="alert" className="mt-3 text-sm text-state-danger">{state.error}</p>}
      {state.notice && <p role="status" className="mt-3 text-sm text-state-success">{state.notice}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Add deal'}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

export function StageSelect({
  orgSlug,
  dealId,
  stageId,
  stages,
}: {
  orgSlug: string
  dealId: string
  stageId: string | null
  stages: { id: string; name: string }[]
}) {
  const [pending, start] = useTransition()

  return (
    <select
      className="field text-xs py-1"
      style={{ minHeight: '2rem' }}
      value={stageId ?? ''}
      disabled={pending}
      aria-label="Move deal to another stage"
      onChange={(e) => {
        const next = e.target.value
        start(async () => { await moveDeal(orgSlug, dealId, next) })
      }}
    >
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  )
}
