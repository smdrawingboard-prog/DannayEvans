'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface OutreachResult {
  error?: string
  ok?: string
}

/** Sender identity. All three regimes want it at the foot of every email. */
export async function saveSenderIdentity(
  orgSlug: string,
  _prev: OutreachResult,
  form: FormData,
): Promise<OutreachResult> {
  const ctx = await requireOrg(orgSlug)
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { error: 'Only an owner or admin can change this.' }
  }

  const legalName = String(form.get('legalName') ?? '').trim()
  const postal = String(form.get('postalAddress') ?? '').trim()
  const unsubscribe = String(form.get('unsubscribeUrl') ?? '').trim()

  if (legalName.length < 2) return { error: 'Enter your registered legal name.' }
  if (postal.length < 10) return { error: 'Enter a full postal address.' }
  if (unsubscribe && !/^https:\/\//i.test(unsubscribe)) {
    return { error: 'The unsubscribe link must be an https address.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organisations')
    .update({
      legal_name: legalName,
      registration_number: String(form.get('registrationNumber') ?? '').trim() || null,
      vat_number: String(form.get('vatNumber') ?? '').trim() || null,
      information_officer_name: String(form.get('officerName') ?? '').trim() || null,
      information_officer_email: String(form.get('officerEmail') ?? '').trim() || null,
      postal_address: postal,
      sender_name: String(form.get('senderName') ?? '').trim() || null,
      unsubscribe_url: unsubscribe || null,
    })
    .eq('id', ctx.orgId)

  if (error) return { error: 'Could not save those details.' }

  revalidatePath(`/${orgSlug}/settings/outreach`)
  return { ok: 'Saved.' }
}

/** Add an address to the suppression list by hand. */
export async function suppressAddress(
  orgSlug: string,
  _prev: OutreachResult,
  form: FormData,
): Promise<OutreachResult> {
  const ctx = await requireOrg(orgSlug)
  const address = String(form.get('address') ?? '').trim().toLowerCase()
  if (address.length < 3) return { error: 'Enter the address to suppress.' }

  const supabase = await createClient()
  const { error } = await supabase.from('suppressions').insert({
    org_id: ctx.orgId,
    address,
    reason: String(form.get('reason') ?? 'do_not_contact'),
    source: 'added by hand',
  })

  // Already suppressed is the outcome the user wanted, not a failure.
  if (error && error.code !== '23505') {
    return { error: 'Could not suppress that address.' }
  }

  revalidatePath(`/${orgSlug}/settings/outreach`)
  return { ok: `${address} will not be contacted again.` }
}
