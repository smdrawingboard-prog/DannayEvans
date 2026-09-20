'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface MoveResult {
  error?: string
  notice?: string
}

/**
 * Move an application to another stage.
 *
 * The stage history row is written by a database trigger, not here, so a move
 * made from anywhere — this screen, an automation, the API — lands in the
 * same audit trail with the same time-in-stage arithmetic.
 */
export async function moveApplication(
  orgSlug: string,
  applicationId: string,
  stageId: string,
): Promise<MoveResult> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  // Confirm the destination stage belongs to this tenant. RLS would refuse a
  // foreign stage anyway, but failing here gives a usable message instead of
  // a constraint error.
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id, name, kind')
    .eq('id', stageId)
    .eq('org_id', ctx.orgId)
    .eq('kind', 'candidate')
    .maybeSingle()

  if (!stage) return { error: 'That stage does not exist.' }

  const { error } = await supabase
    .from('applications')
    .update({ stage_id: stageId })
    .eq('id', applicationId)

  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/pipeline`)
  return { notice: `Moved to ${stage.name}.` }
}
