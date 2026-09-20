'use client'

import { useActionState, useState } from 'react'
import type { CareersResult } from './actions'

interface FaqRow { key: number; q: string; a: string }

export function CareersForm({
  action,
  defaults,
}: {
  action: (prev: CareersResult, form: FormData) => Promise<CareersResult>
  defaults: {
    enabled: boolean
    headline: string
    introMd: string
    metaTitle: string
    metaDescription: string
    primaryKeyword: string
    googleSiteVerification: string
    faq: { q: string; a: string }[]
  }
}) {
  const [state, formAction, pending] = useActionState<CareersResult, FormData>(action, {})
  const [faq, setFaq] = useState<FaqRow[]>(
    defaults.faq.length > 0
      ? defaults.faq.map((f, i) => ({ key: i, ...f }))
      : [{ key: 0, q: '', a: '' }],
  )
  const [metaTitle, setMetaTitle] = useState(defaults.metaTitle)
  const [metaDesc, setMetaDesc] = useState(defaults.metaDescription)

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">Page</legend>

        <label className="flex gap-2.5 items-start mt-2 text-sm">
          <input type="checkbox" name="enabled" className="mt-1" defaultChecked={defaults.enabled} />
          <span>
            Careers site is live
            <span className="block mt-0.5 text-xs text-ink-muted">
              Turn this off and the public page returns a not-found. Your roles
              stay where they are.
            </span>
          </span>
        </label>

        <div className="mt-4">
          <label className="label" htmlFor="headline">Headline</label>
          <input id="headline" name="headline" className="field" defaultValue={defaults.headline} />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="introMd">Introduction</label>
          <textarea
            id="introMd" name="introMd" rows={4} className="field"
            defaultValue={defaults.introMd}
            placeholder="Two or three sentences about what it is like to work here."
          />
        </div>
      </fieldset>

      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          Search and AI visibility
        </legend>

        <div className="mt-2">
          <label className="label" htmlFor="primaryKeyword">Primary keyword</label>
          <input
            id="primaryKeyword" name="primaryKeyword" className="field"
            defaultValue={defaults.primaryKeyword}
            placeholder="jobs at [your company]"
          />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="metaTitle">Meta title</label>
          <input
            id="metaTitle" name="metaTitle" maxLength={60} className="field"
            value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)}
          />
          <p className={`mt-1 text-xs ${metaTitle.length > 60 ? 'text-state-danger' : 'text-ink-muted'}`}>
            {metaTitle.length} / 60
          </p>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="metaDescription">Meta description</label>
          <textarea
            id="metaDescription" name="metaDescription" rows={2} maxLength={160} className="field"
            value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)}
          />
          <p className={`mt-1 text-xs ${metaDesc.length > 160 ? 'text-state-danger' : 'text-ink-muted'}`}>
            {metaDesc.length} / 160
          </p>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="googleSiteVerification">
            Google Search Console verification
          </label>
          <input
            id="googleSiteVerification" name="googleSiteVerification" className="field"
            defaultValue={defaults.googleSiteVerification}
            placeholder="The content value from the meta tag Google gives you"
          />
        </div>
      </fieldset>

      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          Questions and answers
        </legend>
        <p className="mt-2 text-sm text-ink-soft">
          Plainly worded answers are what ChatGPT, Perplexity and Google AI
          Overviews quote, and they earn an FAQ rich result at the same time.
          Write the questions candidates actually ask.
        </p>

        <div className="mt-4 space-y-4">
          {faq.map((row, index) => (
            <div key={row.key} className="border-l-2 border-line pl-3">
              <label className="label" htmlFor={`q-${row.key}`}>Question {index + 1}</label>
              <input
                id={`q-${row.key}`} name="faqQuestion" className="field"
                value={row.q}
                onChange={(e) =>
                  setFaq((f) => f.map((r) => (r.key === row.key ? { ...r, q: e.target.value } : r)))
                }
                placeholder="Do you offer hybrid working?"
              />
              <label className="label mt-2" htmlFor={`a-${row.key}`}>Answer</label>
              <textarea
                id={`a-${row.key}`} name="faqAnswer" rows={3} className="field"
                value={row.a}
                onChange={(e) =>
                  setFaq((f) => f.map((r) => (r.key === row.key ? { ...r, a: e.target.value } : r)))
                }
              />
              <button
                type="button" className="btn mt-2"
                onClick={() => setFaq((f) => (f.length === 1 ? f : f.filter((r) => r.key !== row.key)))}
                disabled={faq.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          type="button" className="btn mt-4"
          onClick={() => setFaq((f) => [...f, { key: Date.now(), q: '', a: '' }])}
        >
          Add a question
        </button>
      </fieldset>

      {state.error && <p role="alert" className="text-sm text-state-danger">{state.error}</p>}
      {state.notice && <p role="status" className="text-sm text-state-success">{state.notice}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Saving…' : 'Save careers site'}
      </button>
    </form>
  )
}
