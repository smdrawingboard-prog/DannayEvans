'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface GrantResult {
  error?: string
  ok?: string
}

/**
 * Record a right to represent.
 *
 * The database refuses a second live grant for the same candidate and client,
 * so the check here is for the message, not the safety: the constraint is
 * what actually prevents the dual submission.
 */
export async function grantRightToRepresent(
  orgSlug: string,
  _prev: GrantResult,
  form: FormData,
): Promise<GrantResult> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  const candidateId = String(form.get('candidateId') ?? '').trim()
  const clientName = String(form.get('clientName') ?? '').trim()
  const months = Number(form.get('months') ?? 6)

  if (!candidateId) return { error: 'Choose a candidate.' }
  if (clientName.length < 2) return { error: 'Name the employer this covers.' }
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    return { error: 'The validity period must be between 1 and 24 months.' }
  }

  const expires = new Date()
  expires.setMonth(expires.getMonth() + months)

  const { error } = await supabase.from('right_to_represent').insert({
    org_id: ctx.orgId,
    candidate_id: candidateId,
    client_id: String(form.get('clientId') ?? '').trim() || null,
    job_id: String(form.get('jobId') ?? '').trim() || null,
    client_name: clientName,
    expires_at: expires.toISOString(),
    created_by: ctx.userId,
    notes: String(form.get('notes') ?? '').trim() || null,
  })

  if (error) {
    // The partial unique index is the dual-submission guard firing.
    if (error.code === '23505') {
      return {
        error: `There is already a live right to represent this candidate to ${clientName}.`,
      }
    }
    return { error: 'Could not record this grant.' }
  }

  revalidatePath(`/${orgSlug}/right-to-represent`)
  return { ok: `Recorded. It runs for ${months} months.` }
}

/** Withdraw a grant, which frees the candidate to be submitted by someone else. */
export async function withdrawGrant(orgSlug: string, form: FormData): Promise<void> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  await supabase
    .from('right_to_represent')
    .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
    .eq('org_id', ctx.orgId)
    .eq('id', String(form.get('id') ?? ''))
    .eq('status', 'active')

  revalidatePath(`/${orgSlug}/right-to-represent`)
}
