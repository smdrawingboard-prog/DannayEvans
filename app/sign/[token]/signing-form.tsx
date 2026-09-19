'use client'

import { useActionState, useState } from 'react'
import { decline, sign, unlockWithCode, type SignResult } from './actions'

interface Field {
  id: string
  documentId: string
  type: string
  label: string | null
  required: boolean
  options: string[] | null
  value: string | null
}

interface Props {
  token: string
  subject: string
  message: string | null
  signerName: string
  signerEmail: string
  orgName: string
  documents: { id: string; fileName: string; url: string }[]
  fields: Field[]
  needsAccessCode: boolean
  eSignatureLaw: string
  regionLabel: string
}

export function SigningForm(props: Props) {
  const [mode, setMode] = useState<'sign' | 'decline'>('sign')

  const [unlockState, unlockAction, unlocking] = useActionState<SignResult, FormData>(
    unlockWithCode.bind(null, props.token),
    {},
  )
  const [signState, signAction, signing] = useActionState<SignResult, FormData>(
    sign.bind(null, props.token),
    {},
  )
  const [declineState, declineAction, declining] = useActionState<SignResult, FormData>(
    decline.bind(null, props.token),
    {},
  )

  if (signState.done) {
    return (
      <>
        <h1 className="text-xl">Done — thank you</h1>
        <p className="mt-2 text-sm text-ink-soft">
          “{props.subject}” has been signed. A copy and the completion
          certificate will reach {props.signerEmail} shortly.
        </p>
      </>
    )
  }

  if (declineState.done) {
    return (
      <>
        <h1 className="text-xl">Recorded</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {props.orgName} has been told you declined to sign, and why.
        </p>
      </>
    )
  }

  if (props.needsAccessCode) {
    return (
      <form action={unlockAction}>
        <h1 className="text-xl">Enter your access code</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {props.orgName} set a code for this document. They will have sent it
          to you separately.
        </p>
        <div className="mt-5 max-w-xs">
          <label className="label" htmlFor="code">Access code</label>
          <input id="code" name="code" required autoComplete="one-time-code" className="field" />
        </div>
        {unlockState.error && (
          <p role="alert" className="mt-3 text-sm text-state-danger">{unlockState.error}</p>
        )}
        <button className="btn btn-primary mt-4" disabled={unlocking}>
          {unlocking ? 'Checking…' : 'Continue'}
        </button>
      </form>
    )
  }

  if (mode === 'decline') {
    return (
      <form action={declineAction}>
        <h1 className="text-xl">Decline to sign</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Tell {props.orgName} why. This is recorded against the document.
        </p>
        <div className="mt-5">
          <label className="label" htmlFor="reason">Reason</label>
          <textarea id="reason" name="reason" rows={3} required className="field" />
        </div>
        {declineState.error && (
          <p role="alert" className="mt-3 text-sm text-state-danger">{declineState.error}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button className="btn btn-danger" disabled={declining}>
            {declining ? 'Sending…' : 'Confirm decline'}
          </button>
          <button type="button" className="btn" onClick={() => setMode('sign')}>
            Go back
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <h1 className="text-xl">{props.subject}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {props.orgName} has asked {props.signerName} to sign.
      </p>
      {props.message && (
        <p className="mt-3 text-sm text-ink-soft border-l-2 border-line pl-3">{props.message}</p>
      )}

      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-wider text-ink-soft">Documents</h2>
        <ul className="mt-2 space-y-1.5">
          {props.documents.map((d) => (
            <li key={d.id}>
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent underline break-all"
              >
                {d.fileName}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          Read every document before you sign. These links expire in 15 minutes;
          reload this page for fresh ones.
        </p>
      </section>

      <form action={signAction} className="mt-6">
        {props.fields.length > 0 && (
          <fieldset className="space-y-4">
            <legend className="text-sm uppercase tracking-wider text-ink-soft">
              Your details
            </legend>
            {props.fields.map((f) => (
              <FieldInput key={f.id} field={f} signerName={props.signerName} />
            ))}
          </fieldset>
        )}

        <label className="flex gap-2.5 items-start mt-6 text-sm">
          <input type="checkbox" name="consent" className="mt-1" required />
          <span>
            I agree to sign this document electronically and I intend my
            electronic signature to be as legally binding as a handwritten one.
            <span className="block mt-1 text-xs text-ink-muted">
              {props.eSignatureLaw} gives this effect in {props.regionLabel}. Your
              name, email, IP address and the time of signing are recorded as
              evidence.
            </span>
          </span>
        </label>

        {signState.error && (
          <p role="alert" className="mt-4 text-sm text-state-danger">{signState.error}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={signing}>
            {signing ? 'Signing…' : 'Sign document'}
          </button>
          <button type="button" className="btn" onClick={() => setMode('decline')}>
            Decline
          </button>
        </div>
      </form>
    </>
  )
}

function FieldInput({ field, signerName }: { field: Field; signerName: string }) {
  const name = `field:${field.id}`
  const label = field.label ?? defaultLabel(field.type)

  if (field.type === 'signature' || field.type === 'initials') {
    return (
      <div>
        <label className="label" htmlFor={name}>{label}</label>
        <input
          id={name} name={name} required={field.required} className="field"
          defaultValue={field.type === 'initials' ? initialsOf(signerName) : signerName}
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Type your {field.type === 'initials' ? 'initials' : 'full name'}. This
          is your signature mark and is stored with the audit record.
        </p>
      </div>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex gap-2.5 items-start text-sm">
        <input type="checkbox" name={name} value="yes" required={field.required} className="mt-1" />
        <span>{label}</span>
      </label>
    )
  }

  if (field.type === 'dropdown') {
    return (
      <div>
        <label className="label" htmlFor={name}>{label}</label>
        <select id={name} name={name} required={field.required} className="field" defaultValue="">
          <option value="" disabled>Choose…</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  if (field.type === 'date_signed') {
    return (
      <div>
        <label className="label" htmlFor={name}>{label}</label>
        <input
          id={name} name={name} readOnly className="field bg-bg-secondary"
          value={new Date().toISOString().slice(0, 10)}
        />
      </div>
    )
  }

  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input
        id={name} name={name} required={field.required} className="field"
        type={field.type === 'number' ? 'number' : 'text'}
        defaultValue={field.type === 'full_name' ? signerName : (field.value ?? '')}
      />
    </div>
  )
}

function defaultLabel(type: string): string {
  const map: Record<string, string> = {
    signature: 'Signature',
    initials: 'Initials',
    full_name: 'Full name',
    date_signed: 'Date',
    text: 'Response',
    number: 'Number',
    checkbox: 'I agree',
    dropdown: 'Select',
    attachment: 'Attachment',
  }
  return map[type] ?? type
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).join('')
}
