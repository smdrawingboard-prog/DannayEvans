'use client'

import { useActionState } from 'react'
import type { JobResult } from './actions'

export interface JobDefaults {
  title?: string
  clientId?: string | null
  employmentType?: string
  workModel?: string
  city?: string | null
  country?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryPeriod?: string
  salaryPublic?: boolean
  summary?: string | null
  description?: string | null
  requirements?: string[]
  benefits?: string[]
  openings?: number
  metaTitle?: string | null
  metaDescription?: string | null
  primaryKeyword?: string | null
}

export function JobForm({
  action,
  defaults = {},
  clients,
  currency,
  submitLabel,
  showSeo = false,
}: {
  action: (prev: JobResult, form: FormData) => Promise<JobResult>
  defaults?: JobDefaults
  clients: { id: string; name: string }[]
  currency: string
  submitLabel: string
  showSeo?: boolean
}) {
  const [state, formAction, pending] = useActionState<JobResult, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          The role
        </legend>

        <div className="mt-2">
          <label className="label" htmlFor="title">Job title</label>
          <input
            id="title" name="title" required className="field"
            defaultValue={defaults.title ?? ''}
            placeholder="Financial Manager"
          />
          <p className="mt-1 text-xs text-ink-muted">
            Use the title people search for, not an internal grade. &ldquo;Financial
            Manager&rdquo; is searched; &ldquo;Finance Specialist II&rdquo; is not.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="clientId">Client</label>
            <select id="clientId" name="clientId" className="field" defaultValue={defaults.clientId ?? ''}>
              <option value="">Hiring for ourselves</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="openings">Openings</label>
            <input
              id="openings" name="openings" type="number" min={1} max={999}
              className="field" defaultValue={defaults.openings ?? 1}
            />
          </div>
          <div>
            <label className="label" htmlFor="employmentType">Employment type</label>
            <select
              id="employmentType" name="employmentType" className="field"
              defaultValue={defaults.employmentType ?? 'permanent'}
            >
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
              <option value="temporary">Temporary</option>
              <option value="fixed_term">Fixed term</option>
              <option value="part_time">Part time</option>
              <option value="internship">Internship</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="workModel">Work model</label>
            <select
              id="workModel" name="workModel" className="field"
              defaultValue={defaults.workModel ?? 'onsite'}
            >
              <option value="onsite">On site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="city">City</label>
            <input id="city" name="city" className="field" defaultValue={defaults.city ?? ''} placeholder="Cape Town" />
          </div>
          <div>
            <label className="label" htmlFor="country">Country</label>
            <input id="country" name="country" className="field" defaultValue={defaults.country ?? ''} placeholder="South Africa" />
          </div>
        </div>
      </fieldset>

      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          Pay
        </legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="salaryMin">Minimum ({currency})</label>
            <input
              id="salaryMin" name="salaryMin" type="number" min={0} step="any"
              className="field" defaultValue={defaults.salaryMin ?? ''}
            />
          </div>
          <div>
            <label className="label" htmlFor="salaryMax">Maximum ({currency})</label>
            <input
              id="salaryMax" name="salaryMax" type="number" min={0} step="any"
              className="field" defaultValue={defaults.salaryMax ?? ''}
            />
          </div>
          <div>
            <label className="label" htmlFor="salaryPeriod">Per</label>
            <select
              id="salaryPeriod" name="salaryPeriod" className="field"
              defaultValue={defaults.salaryPeriod ?? 'year'}
            >
              <option value="year">Year</option>
              <option value="month">Month</option>
              <option value="day">Day</option>
              <option value="hour">Hour</option>
            </select>
          </div>
        </div>
        <label className="flex gap-2.5 items-start mt-4 text-sm">
          <input
            type="checkbox" name="salaryPublic" className="mt-1"
            defaultChecked={defaults.salaryPublic ?? false}
          />
          <span>
            Show the salary on the public advert
            <span className="block mt-0.5 text-xs text-ink-muted">
              Adverts that state pay get meaningfully more applications, and it
              is becoming a legal requirement in more places each year.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="panel p-5">
        <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
          The advert
        </legend>

        <div className="mt-2">
          <label className="label" htmlFor="summary">Short summary</label>
          <textarea
            id="summary" name="summary" rows={2} maxLength={400} className="field"
            defaultValue={defaults.summary ?? ''}
            placeholder="One or two sentences. This is what shows in search results and on the role list."
          />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="description">Description</label>
          <textarea
            id="description" name="description" rows={10} className="field"
            defaultValue={defaults.description ?? ''}
            placeholder="What the person will actually do, who they work with, and why the role exists."
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="requirements">Requirements</label>
            <textarea
              id="requirements" name="requirements" rows={5} className="field"
              defaultValue={(defaults.requirements ?? []).join('\n')}
              placeholder={'One per line\nKeep it to genuine non-negotiables'}
            />
            <p className="mt-1 text-xs text-ink-muted">
              Long lists suppress applications, especially from strong
              candidates who self-select out.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="benefits">Benefits</label>
            <textarea
              id="benefits" name="benefits" rows={5} className="field"
              defaultValue={(defaults.benefits ?? []).join('\n')}
              placeholder="One per line"
            />
          </div>
        </div>
      </fieldset>

      {showSeo && (
        <fieldset className="panel p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-soft">
            Search visibility
          </legend>
          <p className="mt-2 text-sm text-ink-soft">
            Leave these blank and sensible defaults are generated when you publish.
          </p>

          <div className="mt-4">
            <label className="label" htmlFor="primaryKeyword">Primary keyword</label>
            <input
              id="primaryKeyword" name="primaryKeyword" className="field"
              defaultValue={defaults.primaryKeyword ?? ''}
              placeholder="financial manager jobs cape town"
            />
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="metaTitle">Meta title</label>
            <input
              id="metaTitle" name="metaTitle" maxLength={60} className="field"
              defaultValue={defaults.metaTitle ?? ''}
            />
            <p className="mt-1 text-xs text-ink-muted">60 characters maximum.</p>
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="metaDescription">Meta description</label>
            <textarea
              id="metaDescription" name="metaDescription" rows={2} maxLength={160}
              className="field" defaultValue={defaults.metaDescription ?? ''}
            />
            <p className="mt-1 text-xs text-ink-muted">160 characters maximum.</p>
          </div>
        </fieldset>
      )}

      {state.error && <p role="alert" className="text-sm text-state-danger">{state.error}</p>}
      {state.notice && <p role="status" className="text-sm text-state-success">{state.notice}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
