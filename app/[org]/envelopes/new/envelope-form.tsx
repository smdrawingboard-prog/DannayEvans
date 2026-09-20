'use client'

import { useActionState, useState } from 'react'
import type { NewEnvelopeResult } from './actions'

interface Row {
  key: number
  name: string
  email: string
}

export function EnvelopeForm({
  action,
  subjectType,
  subjectId,
  prefill,
}: {
  action: (prev: NewEnvelopeResult, form: FormData) => Promise<NewEnvelopeResult>
  subjectType?: string
  subjectId?: string
  prefill?: { name: string; email: string } | null
}) {
  const [state, formAction, pending] = useActionState<NewEnvelopeResult, FormData>(action, {})
  const [rows, setRows] = useState<Row[]>([
    { key: 0, name: prefill?.name ?? '', email: prefill?.email ?? '' },
  ])
  const [sequential, setSequential] = useState(false)

  function addRow() {
    setRows((r) => [...r, { key: Date.now(), name: '', email: '' }])
  }
  function removeRow(key: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((row) => row.key !== key)))
  }
  function update(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  return (
    <form action={formAction} className="space-y-5">
      {subjectType && <input type="hidden" name="subjectType" value={subjectType} />}
      {subjectId && <input type="hidden" name="subjectId" value={subjectId} />}

      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          The document
        </legend>

        <div className="mt-2">
          <label className="label" htmlFor="subject">Subject</label>
          <input
            id="subject" name="subject" required className="field"
            placeholder="Offer of employment — Financial Manager"
          />
          <p className="mt-1 text-xs text-ink-muted">
            This is the email subject line and how the document appears in your list.
          </p>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="message">Message (optional)</label>
          <textarea
            id="message" name="message" rows={3} className="field"
            placeholder="A short note to whoever is signing."
          />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="documents">Files</label>
          <input
            id="documents" name="documents" type="file" multiple required
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            className="field py-1.5"
          />
          <p className="mt-1 text-xs text-ink-muted">
            PDF, Word, PNG or JPEG. Up to 25 MB each. However many files you
            attach, this counts as one envelope for billing.
          </p>
        </div>
      </fieldset>

      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          Who signs
        </legend>

        <div className="mt-2 space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
              <div>
                <label className="label" htmlFor={`name-${row.key}`}>
                  {sequential ? `Signer ${index + 1} — name` : 'Name'}
                </label>
                <input
                  id={`name-${row.key}`} name="recipientName" className="field"
                  value={row.name}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor={`email-${row.key}`}>Email</label>
                <input
                  id={`email-${row.key}`} name="recipientEmail" type="email" className="field"
                  value={row.email}
                  onChange={(e) => update(row.key, { email: e.target.value })}
                />
              </div>
              <button
                type="button" className="btn"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
                aria-label={`Remove recipient ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn mt-3" onClick={addRow}>
          Add another signer
        </button>

        <label className="flex gap-2.5 items-start mt-4 text-sm">
          <input
            type="checkbox" name="sequential" className="mt-1"
            checked={sequential}
            onChange={(e) => setSequential(e.target.checked)}
          />
          <span>
            Sign in order
            <span className="block mt-0.5 text-xs text-ink-muted">
              Each person is only emailed once the one above them has signed.
              Leave this off and everyone gets it at the same time.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          Send
        </legend>
        <label className="flex gap-2.5 items-start mt-2 text-sm">
          <input type="checkbox" name="sendNow" className="mt-1" defaultChecked />
          <span>
            Send straight away
            <span className="block mt-0.5 text-xs text-ink-muted">
              Uncheck to save it as a draft. You are charged for one envelope
              when it is sent, not when it is created.
            </span>
          </span>
        </label>
      </fieldset>

      {state.error && <p role="alert" className="text-sm text-state-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Preparing…' : 'Create document'}
      </button>
    </form>
  )
}
