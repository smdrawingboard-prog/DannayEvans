'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface ScoreResult {
  error?: string
  ok?: string
}

/**
 * Save an assessment.
 *
 * The weighted total is not sent from here — the database derives it from the
 * scores on every write, and refuses a score outside 1 to 5 or against a
 * criterion the scorecard does not have. Submitting requires every criterion
 * to be scored; saving progress does not.
 */
export async function saveAssessment(
  orgSlug: string,
  applicationId: string,
  _prev: ScoreResult,
  form: FormData,
): Promise<ScoreResult> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  const scorecardId = String(form.get('scorecardId') ?? '').trim()
  if (!scorecardId) return { error: 'Choose a scorecard.' }

  const submit = form.get('submit') === 'on'

  // The form posts score_<key> and evidence_<key> for each criterion.
  const scores: Record<string, { score?: number; evidence?: string }> = {}
  for (const [field, raw] of form.entries()) {
    const value = String(raw)
    if (field.startsWith('score_')) {
      const key = field.slice(6)
      if (value === '') continue
      const n = Number(value)
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        return { error: `The score for "${key}" must be between 1 and 5.` }
      }
      scores[key] = { ...scores[key], score: n }
    } else if (field.startsWith('evidence_')) {
      const key = field.slice(9)
      const text = value.trim()
      if (text) scores[key] = { ...scores[key], evidence: text }
    }
  }

  // Evidence without a score is a note, not an assessment; drop it so the
  // database does not see a criterion keyed with no score at all.
  for (const [key, entry] of Object.entries(scores)) {
    if (entry.score === undefined) delete scores[key]
  }

  const payload = {
    org_id: ctx.orgId,
    application_id: applicationId,
    scorecard_id: scorecardId,
    assessor_id: ctx.userId,
    scores,
    recommendation: String(form.get('recommendation') ?? '').trim() || null,
    summary: String(form.get('summary') ?? '').trim() || null,
    submitted_at: submit ? new Date().toISOString() : null,
  }

  const { error } = await supabase
    .from('assessments')
    .upsert(payload, { onConflict: 'application_id,assessor_id,scorecard_id' })

  if (error) {
    // The trigger's messages are written for the assessor; keep them.
    return { error: error.message.replace(/^.*?:\s*/, '') }
  }

  revalidatePath(`/${orgSlug}/assess/${applicationId}`)
  return {
    ok: submit ? 'Submitted.' : 'Saved. Nothing is submitted until every criterion is scored.',
  }
}

/** Put a submitted assessment on, or take it off, the shortlist. */
export async function toggleShortlist(orgSlug: string, form: FormData): Promise<void> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  const id = String(form.get('id') ?? '')
  const on = form.get('on') === 'true'

  await supabase
    .from('assessments')
    .update({ shortlisted: on })
    .eq('org_id', ctx.orgId)
    .eq('id', id)
    .not('weighted_total', 'is', null)

  revalidatePath(`/${orgSlug}/assess/${String(form.get('applicationId') ?? '')}`)
}
