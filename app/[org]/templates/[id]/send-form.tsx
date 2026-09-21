'use client'

import { useActionState } from 'react'
import { sendFromTemplate, type SendTemplateResult } from './actions'

export function SendTemplateForm({
  slug,
  templateId,
  clientId,
  candidateId,
  needsClient,
  needsCandidate,
  missing,
}: {
  slug: string
  templateId: string
  clientId: string
  candidateId: string
  needsClient: boolean
  needsCandidate: boolean
  missing: string[]
}) {
  const action = sendFromTemplate.bind(null, slug, templateId)
  const [state, formAction, pending] = useActionState<SendTemplateResult, FormData>(action, {})

  const blocked = (needsClient && !clientId) || (needsCandidate && !candidateId)

  return (
    <form action={formAction} className="space-y-3 text-sm">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="candidateId" value={candidateId} />

      <div>
        <label className="block text-xs text-ink-soft mb-1" htmlFor="message">
          Note to the signers (optional)
        </label>
        <textarea id="message" name="message" rows={3} className="field" />
      </div>

      {state.error && (
        <p role="alert" className="text-state-danger text-sm">{state.error}</p>
      )}

      {blocked ? (
        <p className="text-ink-muted text-xs">
          Choose {needsClient && !clientId ? 'a client' : 'a candidate'} above before sending.
        </p>
      ) : (
        missing.length > 0 && (
          <p className="text-state-warning text-xs">
            Sending with {missing.length} visible {missing.length === 1 ? 'blank' : 'blanks'}.
          </p>
        )
      )}

      <button className="btn btn-primary w-full" disabled={pending || blocked}>
        {pending ? 'Sending…' : 'Send for signature'}
      </button>
    </form>
  )
}
