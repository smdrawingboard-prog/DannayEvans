'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSignatureProvider, SignatureError } from '@/lib/signatures'
import { checkEntitlement, entitlementMessage } from '@/lib/billing'

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
    const { ctx, envelope } = await authorise(orgSlug, envelopeId)

    // Sending is the billable moment, so the entitlement check belongs here
    // and nowhere else in the UI. The meter itself is a database trigger, so
    // usage is recorded whether the send came from here, an automation or
    // the API — this check only decides whether the send is permitted.
    const entitlement = await checkEntitlement(ctx.orgId)
    if (!entitlement.allowed) {
      return { error: entitlementMessage(entitlement) ?? 'Sending is not available on your plan right now.' }
    }

    await getSignatureProvider(envelope.provider).send(envelopeId)
    revalidatePath(`/${orgSlug}/envelopes/${envelopeId}`)

    // An allowed send can still be worth flagging: the customer should learn
    // they have moved into overage from the app, not from the invoice.
    const warning = entitlementMessage(entitlement)
    return { notice: warning ? `Sent. ${warning}` : 'Sent.' }
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
