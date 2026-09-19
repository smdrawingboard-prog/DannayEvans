'use client'

import { useState, useTransition } from 'react'
import { remindEnvelope, sendEnvelope, voidEnvelope, type ActionResult } from './actions'

export function EnvelopeActions({
  orgSlug,
  envelopeId,
  status,
  canManage,
}: {
  orgSlug: string
  envelopeId: string
  status: string
  canManage: boolean
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult>({})
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')

  if (!canManage) return null

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => setResult(await fn()))

  const outstanding = status === 'sent' || status === 'in_progress'

  return (
    <div className="text-right">
      <div className="flex flex-wrap gap-2 justify-end">
        {status === 'draft' && (
          <button
            className="btn btn-primary" disabled={pending}
            onClick={() => run(() => sendEnvelope(orgSlug, envelopeId))}
          >
            {pending ? 'Sending…' : 'Send for signature'}
          </button>
        )}
        {outstanding && (
          <button
            className="btn" disabled={pending}
            onClick={() => run(() => remindEnvelope(orgSlug, envelopeId))}
          >
            Send a reminder
          </button>
        )}
        {status !== 'completed' && status !== 'voided' && (
          <button className="btn btn-danger" onClick={() => setVoiding((v) => !v)}>
            Void
          </button>
        )}
      </div>

      {voiding && (
        <div className="panel p-3 mt-3 text-left w-72">
          <label className="label" htmlFor="void-reason">Reason</label>
          <input
            id="void-reason" className="field" value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Superseded by a revised offer"
          />
          <p className="mt-1 text-xs text-ink-muted">Recorded in the audit trail.</p>
          <button
            className="btn btn-danger w-full mt-2" disabled={pending || !reason.trim()}
            onClick={() =>
              run(async () => {
                const r = await voidEnvelope(orgSlug, envelopeId, reason)
                if (!r.error) setVoiding(false)
                return r
              })
            }
          >
            Confirm void
          </button>
        </div>
      )}

      {result.error && <p role="alert" className="mt-2 text-sm text-state-danger">{result.error}</p>}
      {result.notice && <p role="status" className="mt-2 text-sm text-state-success">{result.notice}</p>}
    </div>
  )
}
