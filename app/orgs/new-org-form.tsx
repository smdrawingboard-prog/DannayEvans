'use client'

import { useActionState, useState } from 'react'
import { createOrganisation } from './actions'
import { REGIONS } from '@/lib/region'

/** Turns "Acme Recruitment (Pty) Ltd" into "acme-recruitment". */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/^-|-$/g, '')
}

export function NewOrgForm() {
  const [state, action, pending] = useActionState(createOrganisation, {})
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  return (
    <form action={action} className="panel p-5 mt-3">
      <div>
        <label className="label" htmlFor="name">Business name</label>
        <input
          id="name" name="name" required className="field" value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugEdited) setSlug(slugify(e.target.value))
          }}
        />
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="slug">Workspace address</label>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-ink-muted">/</span>
          <input
            id="slug" name="slug" required className="field" value={slug}
            onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)) }}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="region">Region</label>
        <select id="region" name="region" defaultValue="ZA" className="field">
          {Object.values(REGIONS).map((r) => (
            <option key={r.code} value={r.code}>
              {r.label} — {r.currency}, {r.privacyRegime}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          Sets your currency, the privacy law quoted on candidate forms, and
          whether messages default to WhatsApp or email. You can change it later.
        </p>
      </div>

      {state.error && <p role="alert" className="mt-4 text-sm text-state-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary mt-5">
        {pending ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  )
}
