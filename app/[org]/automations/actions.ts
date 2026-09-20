'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg, canManage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function toggleAutomation(
  orgSlug: string,
  id: string,
  active: boolean,
): Promise<{ error?: string }> {
  const ctx = await requireOrg(orgSlug)
  if (!canManage(ctx.role)) {
    return { error: 'Only an owner or admin can change automations.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('automations')
    .update({ active })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/automations`)
  return {}
}
