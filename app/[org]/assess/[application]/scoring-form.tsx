'use client'

import { useActionState, useState } from 'react'
import { Panel } from '@/components/ui'
import { saveAssessment, type ScoreResult } from './actions'

interface Criterion {
  key: string
  label: string
  weight: number
  guidance?: string
}

interface Existing {
  scores: Record<string, { score?: number; evidence?: string }>
  recommendation: string | null
  summary: string | null
  submitted: boolean
  weightedTotal: number | null
}

const ANCHORS: Record<number, string> = {
  5: 'Exceeds — direct relevant experience, evidenced with results',
  4: 'Meets fully — solid evidence',
  3: 'Meets adequately — some gaps but broadly competent',
  2: 'Partially meets — a significant gap',
  1: 'Does not meet — disqualifying on this criterion',
}

export function ScoringForm({
  slug,
  applicationId,
  scorecardId,
  criteria,
  existing,
}: {
  slug: string
  applicationId: string
  scorecardId: string
  criteria: Criterion[]
  existing: Existing | null
}) {
  const action = saveAssessment.bind(null, slug, applicationId)
  const [state, formAction, pending] = useActionState<ScoreResult, FormData>(action, {})

  const [scores, setScores] = useState<Record<string, number | ''>>(() => {
    const initial: Record<string, number | ''> = {}
    for (const c of criteria) {
      initial[c.key] = existing?.scores?.[c.key]?.score ?? ''
    }
    return initial
  })

  // Mirrors what the database will compute, so the assessor sees the total
  // move as they score. The stored value is always the database's, not this.
  const running = criteria.reduce((sum, c) => {
    const s = scores[c.key]
    return typeof s === 'number' ? sum + s * Number(c.weight) : sum
  }, 0)
  const scored = criteria.filter((c) => typeof scores[c.key] === 'number').length
  const complete = scored === criteria.length && criteria.length > 0

  return (
    <Panel
      title="Your assessment"
      action={
        <span className="text-sm tabular-nums text-ink-soft">
          {complete ? (
            <strong className="text-ink">{running} / 500</strong>
          ) : (
            <>
              {scored} of {criteria.length} scored
            </>
          )}
        </span>
      }
    >
      <form action={formAction} className="space-y-4 text-sm">
        <input type="hidden" name="scorecardId" value={scorecardId} />

        <div className="space-y-4">
          {criteria.map((c) => (
            <div key={c.key} className="pb-4 border-b border-line last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-ink" htmlFor={`score_${c.key}`}>
                  {c.label}
                </label>
                <span className="text-xs text-ink-muted shrink-0 tabular-nums">
                  weight {c.weight}%
                </span>
              </div>
              {c.guidance && (
                <p className="mt-0.5 text-xs text-ink-muted">{c.guidance}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = scores[c.key] === n
                  return (
                    <button
                      key={n}
                      type="button"
                      title={ANCHORS[n]}
                      aria-pressed={on}
                      onClick={() =>
                        setScores((s) => ({ ...s, [c.key]: on ? '' : n }))
                      }
                      className={`w-9 h-9 border text-sm tabular-nums transition-colors ${
                        on
                          ? 'border-accent bg-accent-light text-accent'
                          : 'border-line text-ink-soft hover:bg-bg-secondary'
                      }`}
                    >
                      {n}
                    </button>
                  )
                })}
                <input
                  type="hidden"
                  name={`score_${c.key}`}
                  value={scores[c.key] === '' ? '' : String(scores[c.key])}
                />
                {typeof scores[c.key] === 'number' && (
                  <span className="self-center ml-2 text-xs text-ink-muted">
                    {ANCHORS[scores[c.key] as number]}
                  </span>
                )}
              </div>

              <input
                id={`evidence_${c.key}`}
                name={`evidence_${c.key}`}
                defaultValue={existing?.scores?.[c.key]?.evidence ?? ''}
                placeholder="Evidence — what they actually did, with the number if there is one"
                className="field mt-2 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-ink-soft mb-1" htmlFor="recommendation">
              Recommendation
            </label>
            <select
              id="recommendation" name="recommendation" className="field"
              defaultValue={existing?.recommendation ?? ''}
            >
              <option value="">Not decided</option>
              <option value="strong_yes">Strong recommend</option>
              <option value="yes">Recommend</option>
              <option value="maybe">Borderline</option>
              <option value="no">Not recommended</option>
              <option value="strong_no">Strong no</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-ink-soft mb-1" htmlFor="summary">
            Summary for the client
          </label>
          <textarea
            id="summary" name="summary" rows={3} className="field"
            defaultValue={existing?.summary ?? ''}
            placeholder="Strengths against this mandate, and any risk worth naming. Clients trust recruiters who surface risks."
          />
        </div>

        {state.error && <p role="alert" className="text-state-danger">{state.error}</p>}
        {state.ok && <p role="status" className="text-state-success">{state.ok}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={pending} name="save" value="on">
            {pending ? 'Saving…' : 'Save progress'}
          </button>

          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="submit" disabled={!complete} />
            Submit this assessment
          </label>

          {!complete && (
            <span className="text-xs text-ink-muted">
              Every criterion has to be scored before it can be submitted.
            </span>
          )}
        </div>

        {existing?.submitted && (
          <p className="text-xs text-ink-muted">
            Already submitted at {existing.weightedTotal} / 500. Saving again
            replaces it.
          </p>
        )}
      </form>
    </Panel>
  )
}
