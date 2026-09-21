'use client'

import { useActionState, useMemo, useState } from 'react'
import { Panel } from '@/components/ui'
import { uploadDocument, type UploadResult } from './actions'

interface Kind {
  code: string
  label: string
  category: string
  special_personal_information: boolean
  post_offer_only: boolean
  guidance: string | null
}

export function UploadPanel({
  slug,
  kinds,
  candidates,
  clients,
}: {
  slug: string
  kinds: Kind[]
  candidates: { id: string; full_name: string }[]
  clients: { id: string; name: string }[]
}) {
  const action = uploadDocument.bind(null, slug)
  const [state, formAction, pending] = useActionState<UploadResult, FormData>(action, {})

  const [subjectType, setSubjectType] = useState('candidate')
  const [code, setCode] = useState('')

  const kind = useMemo(() => kinds.find((k) => k.code === code), [kinds, code])
  const needsJustification = code === 'criminal_check'

  const subjects =
    subjectType === 'candidate'
      ? candidates.map((c) => ({ id: c.id, label: c.full_name }))
      : subjectType === 'client'
        ? clients.map((c) => ({ id: c.id, label: c.name }))
        : []

  return (
    <Panel title="Add a document">
      <form action={formAction} className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-ink-soft mb-1" htmlFor="subjectType">
              Belongs to
            </label>
            <select
              id="subjectType" name="subjectType" className="field"
              value={subjectType} onChange={(e) => setSubjectType(e.target.value)}
            >
              <option value="candidate">A candidate</option>
              <option value="client">A client</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-ink-soft mb-1" htmlFor="subjectId">
              Who
            </label>
            <select id="subjectId" name="subjectId" required className="field">
              <option value="">Choose…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-ink-soft mb-1" htmlFor="documentType">
              Kind
            </label>
            <select
              id="documentType" name="documentType" required className="field"
              value={code} onChange={(e) => setCode(e.target.value)}
            >
              <option value="">Choose…</option>
              {kinds.map((k) => (
                <option key={k.code} value={k.code}>{k.label}</option>
              ))}
            </select>
          </div>
        </div>

        {kind && (kind.special_personal_information || kind.post_offer_only || kind.guidance) && (
          <div
            role="status"
            className={`panel p-3 text-xs ${
              kind.special_personal_information
                ? 'border-state-danger'
                : kind.post_offer_only
                  ? 'border-state-warning'
                  : ''
            }`}
          >
            {kind.special_personal_information && (
              <p className="text-ink">
                Special personal information. The candidate must already have
                consented, or this upload is refused.
              </p>
            )}
            {kind.post_offer_only && (
              <p className="text-ink">
                Post-offer only. Until an offer exists, this upload is refused.
              </p>
            )}
            {kind.guidance && <p className="mt-1 text-ink-soft">{kind.guidance}</p>}
          </div>
        )}

        {needsJustification && (
          <div>
            <label className="block text-xs text-ink-soft mb-1" htmlFor="justification">
              POPIA section 27 justification
            </label>
            <textarea
              id="justification" name="justification" rows={2} required className="field"
              placeholder="Why this role justifies a criminal record check."
            />
            <p className="mt-1 text-xs text-ink-muted">
              Consent alone does not lift the section 26 prohibition. The
              justification has to be written down.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs text-ink-soft mb-1" htmlFor="file">
            File
          </label>
          <input
            id="file" name="file" type="file" required className="field"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
          />
          <p className="mt-1 text-xs text-ink-muted">
            PDF, Word, Excel or an image. Up to 25 MB.
          </p>
        </div>

        {state.error && <p role="alert" className="text-state-danger">{state.error}</p>}
        {state.ok && <p role="status" className="text-state-success">{state.ok}</p>}

        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </form>
    </Panel>
  )
}
