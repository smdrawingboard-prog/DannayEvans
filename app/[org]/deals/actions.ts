'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface DealResult {
  error?: string
  notice?: string
}

const dealSchema = z.object({
  companyName: z.string().min(2, 'Give the company name').max(160),
  contactName: z.string().max(120).optional().or(z.literal('')),
  contactEmail: z.string().email('Check the contact email').optional().or(z.literal('')),
  roleToFill: z.string().max(160).optional().or(z.literal('')),
  mandate: z.enum(['retained', 'contingency', 'rpo', 'internal']),
  value: z.coerce.number().nonnegative().optional().or(z.nan()),
  stageId: z.string().uuid('Pick a stage'),
  expectedClose: z.string().optional().or(z.literal('')),
  source: z.string().max(60).optional().or(z.literal('')),
  notes: z.string().max(4000).optional().or(z.literal('')),
})

export async function createDeal(
  orgSlug: string,
  _prev: DealResult,
  form: FormData,
): Promise<DealResult> {
  const ctx = await requireOrg(orgSlug)
  const parsed = dealSchema.safeParse({
    companyName: form.get('companyName'),
    contactName: form.get('contactName') ?? '',
    contactEmail: form.get('contactEmail') ?? '',
    roleToFill: form.get('roleToFill') ?? '',
    mandate: form.get('mandate'),
    value: form.get('value') || Number.NaN,
    stageId: form.get('stageId'),
    expectedClose: form.get('expectedClose') ?? '',
    source: form.get('source') ?? '',
    notes: form.get('notes') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const d = parsed.data
  const supabase = await createClient()

  // The stage carries the default probability, so a new deal inherits a
  // forecast without anyone typing a percentage.
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('probability_pct')
    .eq('id', d.stageId)
    .eq('org_id', ctx.orgId)
    .eq('kind', 'deal')
    .maybeSingle()

  if (!stage) return { error: 'That stage does not exist.' }

  const { error } = await supabase.from('deals').insert({
    org_id: ctx.orgId,
    company_name: d.companyName,
    contact_name: d.contactName || null,
    contact_email: d.contactEmail || null,
    role_to_fill: d.roleToFill || null,
    mandate: d.mandate,
    value: Number.isFinite(d.value as number) ? d.value : null,
    currency: ctx.currency,
    stage_id: d.stageId,
    probability_pct: stage.probability_pct,
    expected_close: d.expectedClose || null,
    source: d.source || null,
    notes: d.notes || null,
    owner_id: ctx.userId,
  })

  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/deals`)
  return { notice: 'Added.' }
}

export async function moveDeal(
  orgSlug: string,
  dealId: string,
  stageId: string,
): Promise<DealResult> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id, name, probability_pct, is_won, is_lost')
    .eq('id', stageId)
    .eq('org_id', ctx.orgId)
    .eq('kind', 'deal')
    .maybeSingle()

  if (!stage) return { error: 'That stage does not exist.' }

  const closed = stage.is_won || stage.is_lost

  const { error } = await supabase
    .from('deals')
    .update({
      stage_id: stageId,
      stage_entered_at: new Date().toISOString(),
      probability_pct: stage.probability_pct,
      // A won or lost stage is what closes a deal, so the close date and
      // outcome follow from the move rather than needing a separate step.
      closed_at: closed ? new Date().toISOString().slice(0, 10) : null,
      outcome: stage.is_won ? 'won' : stage.is_lost ? 'lost' : null,
    })
    .eq('id', dealId)

  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/deals`)
  return { notice: `Moved to ${stage.name}.` }
}
