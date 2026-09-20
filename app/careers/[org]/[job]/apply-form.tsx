'use client'

import { useActionState } from 'react'
import { apply, type ApplyState } from './actions'

export function ApplyForm({
  jobId,
  consentText,
  whatsappNumber,
  jobTitle,
}: {
  jobId: string
  orgSlug: string
  consentText: string
  whatsappNumber: string | null
  jobTitle: string
}) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(apply, {})

  if (state.done) {
    return (
      <div className="panel p-5 mt-4">
        <h3 className="text-base">Application received</h3>
        <p className="mt-2 text-sm text-ink-soft">
          Thank you. You will get an email confirming this, and we reply to
          every application — including the ones we cannot take forward.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* In WhatsApp-first markets this converts several times better than a
          form, so it is offered first rather than buried underneath. */}
      {whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
            `Hi, I would like to apply for the ${jobTitle} role.`,
          )}`}
          className="btn btn-primary mt-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Apply on WhatsApp
        </a>
      )}

      <form action={action} className="panel p-5 mt-4">
        <input type="hidden" name="jobId" value={jobId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" required autoComplete="name" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="linkedin">LinkedIn (optional)</label>
            <input id="linkedin" name="linkedin" type="url" className="field" placeholder="https://" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="message">Why you (optional)</label>
          <textarea id="message" name="message" rows={4} className="field" maxLength={4000} />
        </div>

        <label className="flex gap-2.5 items-start mt-5 text-sm">
          <input type="checkbox" name="consent" required className="mt-1" />
          <span className="text-ink-soft">{consentText}</span>
        </label>

        {state.error && <p role="alert" className="mt-4 text-sm text-state-danger">{state.error}</p>}

        <button className="btn btn-primary mt-5" disabled={pending}>
          {pending ? 'Sending…' : 'Submit application'}
        </button>
      </form>
    </>
  )
}
