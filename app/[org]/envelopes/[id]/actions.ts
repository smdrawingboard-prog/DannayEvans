'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSignatureProvider, SignatureError } from '@/lib/signatures'

export interface ActionResult {
  error?: string
  notice?: string
}

/**
 * Confirms the caller is a member of the organisation that owns `envelopeId`
 * before any provider call. The provider runs with the service role, so this
 * check is the only thing standing between a guessed id and another tenant's
 * document — it is never optional.
 */
async function authorise(orgSlug: string, envelopeId: string) {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()
  const { data } = await supabase
    .from('envelopes')
    .select('id, provider, status')
    .eq('id', envelopeId)
    .maybeSingle()
  if (!data) throw new SignatureError('envelope not found', 'not_found')
  return { ctx, envelope: data }
}

export async function sendEnvelope(
  orgSlug: string,
  envelopeId: string,
): Promise<ActionResult> {
  try {
    const { envelope } = await authorise(orgSlug, envelopeId)
    await getSignatureProvider(envelope.provider).send(envelopeId)
    revalidatePath(`/${orgSlug}/envelopes/${envelopeId}`)
    return { notice: 'Sent.' }
  } catch (e) {
    return { error: e instanceof SignatureError ? e.message : 'Could not send this document.' }
  }
}

export async function remindEnvelope(
  orgSlug: string,
  envelopeId: string,
): Promise<ActionResult> {
  try {
    const { envelope } = await authorise(orgSlug, envelopeId)
    const { remindedCount } = await getSignatureProvider(envelope.provider).remind(envelopeId)
    revalidatePath(`/${orgSlug}/envelopes/${envelopeId}`)
    return {
      notice: remindedCount
        ? `Reminded ${remindedCount} recipient${remindedCount === 1 ? '' : 's'}.`
        : 'Nobody outstanding to remind.',
    }
  } catch (e) {
    return { error: e instanceof SignatureError ? e.message : 'Could not send reminders.' }
  }
}

export async function voidEnvelope(
  orgSlug: string,
  envelopeId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    if (!reason.trim()) return { error: 'Give a reason — it goes in the audit trail.' }
    const { envelope } = await authorise(orgSlug, envelopeId)
    await getSignatureProvider(envelope.provider).void(envelopeId, reason.trim())
    revalidatePath(`/${orgSlug}/envelopes/${envelopeId}`)
    return { notice: 'Voided.' }
  } catch (e) {
    return { error: e instanceof SignatureError ? e.message : 'Could not void this document.' }
  }
}

export async function downloadEnvelope(orgSlug: string, envelopeId: string) {
  const { envelope } = await authorise(orgSlug, envelopeId)
  return getSignatureProvider(envelope.provider).download(envelopeId)
}
