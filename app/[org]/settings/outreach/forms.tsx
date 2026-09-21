'use client'

import { useActionState } from 'react'
import { Panel } from '@/components/ui'
import {
  saveSenderIdentity,
  suppressAddress,
  type OutreachResult,
} from './actions'

interface OrgFields {
  legal_name?: string | null
  registration_number?: string | null
  vat_number?: string | null
  information_officer_name?: string | null
  information_officer_email?: string | null
  postal_address?: string | null
  sender_name?: string | null
  unsubscribe_url?: string | null
}

function Field({
  name, label, defaultValue, hint, type = 'text', required = false,
}: {
  name: string
  label: string
  defaultValue?: string | null
  hint?: string
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs text-ink-soft mb-1" htmlFor={name}>
        {label}
      </label>
      <input
        id={name} name={name} type={type} required={required}
        defaultValue={defaultValue ?? ''} className="field"
      />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export function OutreachForms({
  slug,
  org,
  canEdit,
}: {
  slug: string
  org: OrgFields
  canEdit: boolean
}) {
  const identityAction = saveSenderIdentity.bind(null, slug)
  const suppressAction = suppressAddress.bind(null, slug)

  const [identity, identityForm, identityPending] =
    useActionState<OutreachResult, FormData>(identityAction, {})
  const [suppress, suppressForm, suppressPending] =
    useActionState<OutreachResult, FormData>(suppressAction, {})

  return (
    <>
      <Panel title="Who the email is from">
        <form action={identityForm} className="space-y-3 text-sm">
          <Field
            name="legalName" label="Registered legal name" required
            defaultValue={org.legal_name}
            hint="As registered, not the trading name."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              name="registrationNumber" label="Registration number"
              defaultValue={org.registration_number}
            />
            <Field name="vatNumber" label="VAT number" defaultValue={org.vat_number} />
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1" htmlFor="postalAddress">
              Postal address
            </label>
            <textarea
              id="postalAddress" name="postalAddress" rows={2} required
              defaultValue={org.postal_address ?? ''} className="field"
            />
            <p className="mt-1 text-xs text-ink-muted">
              A physical address is required at the foot of every marketing email.
            </p>
          </div>
          <Field
            name="unsubscribeUrl" label="Unsubscribe link" required
            defaultValue={org.unsubscribe_url}
            hint="An https address that actually works. Opt-outs must be honoured within ten business days."
          />
          <Field
            name="senderName" label="Sender name"
            defaultValue={org.sender_name}
            hint="The person the email appears to come from."
          />

          <div className="pt-2 border-t border-line grid gap-3 sm:grid-cols-2">
            <Field
              name="officerName" label="Information Officer"
              defaultValue={org.information_officer_name}
              hint="Named on every consent form."
            />
            <Field
              name="officerEmail" label="Information Officer email" type="email"
              defaultValue={org.information_officer_email}
            />
          </div>

          {identity.error && (
            <p role="alert" className="text-state-danger">{identity.error}</p>
          )}
          {identity.ok && <p role="status" className="text-state-success">{identity.ok}</p>}

          <button className="btn btn-primary" disabled={identityPending || !canEdit}>
            {identityPending ? 'Saving…' : 'Save'}
          </button>
          {!canEdit && (
            <p className="text-xs text-ink-muted">
              Only an owner or admin can change these.
            </p>
          )}
        </form>
      </Panel>

      <Panel title="Suppress an address">
        <form action={suppressForm} className="flex flex-wrap gap-2 items-end text-sm">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-ink-soft mb-1" htmlFor="address">
              Email address or phone number
            </label>
            <input id="address" name="address" required className="field" />
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1" htmlFor="reason">
              Reason
            </label>
            <select id="reason" name="reason" className="field">
              <option value="do_not_contact">Asked not to be contacted</option>
              <option value="opted_out">Opted out</option>
              <option value="complained">Complained</option>
              <option value="bounced">Bounced</option>
              <option value="manual">Other</option>
            </select>
          </div>
          <button className="btn" disabled={suppressPending}>
            {suppressPending ? 'Adding…' : 'Suppress'}
          </button>
        </form>
        {suppress.error && (
          <p role="alert" className="mt-2 text-state-danger text-sm">{suppress.error}</p>
        )}
        {suppress.ok && (
          <p role="status" className="mt-2 text-state-success text-sm">{suppress.ok}</p>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          This cannot be undone from the interface. That is deliberate.
        </p>
      </Panel>
    </>
  )
}
