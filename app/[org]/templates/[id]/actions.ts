'use server'

import { redirect } from 'next/navigation'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { checkEntitlement, entitlementMessage } from '@/lib/billing'
import { getSignatureProvider, SignatureError } from '@/lib/signatures'
import type { FieldInput, RecipientInput } from '@/lib/signatures/types'
import { buildMergeValues, renderTemplate, templateFields } from '@/lib/templates'

export interface SendTemplateResult {
  error?: string
}

/** Field types the signer fills in, in the order they appear on the page. */
const SIGNER_TYPES = new Set([
  'signature', 'initials', 'date_signed', 'full_name', 'text', 'checkbox',
])

/**
 * Send one of the standard agreements for signature.
 *
 * The body is rendered from the records at the moment of sending, not stored
 * pre-rendered: a client whose registration number is corrected before the
 * agreement goes out should get the corrected one.
 */
export async function sendFromTemplate(
  orgSlug: string,
  templateId: string,
  _prev: SendTemplateResult,
  form: FormData,
): Promise<SendTemplateResult> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  const { data: template } = await supabase
    .from('document_templates')
    .select('id, name, status, signed_by, field_schema, body_html')
    .eq('org_id', ctx.orgId)
    .eq('id', templateId)
    .maybeSingle()

  if (!template) return { error: 'That agreement is no longer in your library.' }

  // The one hard rule of this library: a template that is clause headings
  // cannot be sent, whatever the form says.
  if (template.status === 'needs_legal_drafting') {
    return { error: 'This agreement has not been drafted yet and cannot be sent.' }
  }

  const clientId = String(form.get('clientId') ?? '').trim() || null
  const candidateId = String(form.get('candidateId') ?? '').trim() || null
  const signedBy: string[] = template.signed_by ?? []

  const recipients: RecipientInput[] = []

  if (signedBy.includes('client')) {
    if (!clientId) return { error: 'Choose which client this is for.' }
    const { data: client } = await supabase
      .from('clients')
      .select('name, contact_name, contact_email')
      .eq('id', clientId)
      .maybeSingle()
    if (!client) return { error: 'That client is no longer on your list.' }
    if (!client.contact_email) {
      return { error: `${client.name} has no contact email address to send to.` }
    }
    recipients.push({
      fullName: client.contact_name?.trim() || client.name,
      email: client.contact_email,
      role: 'signer',
      signingOrder: recipients.length + 1,
    })
  }

  if (signedBy.includes('candidate')) {
    if (!candidateId) return { error: 'Choose which candidate this is for.' }
    const { data: candidate } = await supabase
      .from('candidates')
      .select('full_name, email')
      .eq('id', candidateId)
      .maybeSingle()
    if (!candidate) return { error: 'That candidate is no longer on your list.' }
    if (!candidate.email) {
      return { error: `${candidate.full_name} has no email address to send to.` }
    }
    recipients.push({
      fullName: candidate.full_name,
      email: candidate.email,
      role: 'signer',
      signingOrder: recipients.length + 1,
    })
  }

  // An agreement the agency itself signs goes to whoever is sending it.
  if (signedBy.includes('agency')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', ctx.userId)
      .maybeSingle()
    if (!profile?.email) {
      return { error: 'Your own profile has no email address to counter-sign with.' }
    }
    recipients.push({
      fullName: profile.full_name?.trim() || profile.email,
      email: profile.email,
      role: 'signer',
      signingOrder: recipients.length + 1,
    })
  }

  if (recipients.length === 0) {
    return { error: 'This agreement does not say who signs it.' }
  }

  const entitlement = await checkEntitlement(ctx.orgId)
  if (!entitlement.allowed) {
    return {
      error: entitlementMessage(entitlement) ?? 'Sending is not available on your plan right now.',
    }
  }

  const values = await buildMergeValues({
    orgId: ctx.orgId,
    clientId,
    candidateId,
    jobId: String(form.get('jobId') ?? '').trim() || null,
  })
  const rendered = renderTemplate(template.body_html ?? '', values)

  // Map each declared field onto the recipient whose role it names, so a
  // candidate is never handed the agency's signature block.
  const declared = templateFields(template.field_schema).filter((f) =>
    SIGNER_TYPES.has(f.type),
  )

  const fields: FieldInput[] = []
  let row = 0
  for (const field of declared) {
    const index = field.recipient
      ? signedBy.indexOf(field.recipient)
      : 0
    if (index < 0 || index >= recipients.length) continue

    fields.push({
      documentIndex: 0,
      recipientIndex: index,
      type: field.type as FieldInput['type'],
      label: field.label,
      required: field.required !== false,
      page: 1,
      x: 0.1,
      y: 0.08 + row * 0.05,
      width: field.type === 'signature' ? 0.35 : 0.25,
      height: 0.04,
    })
    row++
  }

  const bytes = new TextEncoder().encode(rendered.body)

  const provider = getSignatureProvider()
  let envelopeId: string

  try {
    const envelope = await provider.create({
      orgId: ctx.orgId,
      subject: template.name,
      message: String(form.get('message') ?? '').trim() || undefined,
      documents: [
        {
          fileName: `${template.name}.txt`,
          mimeType: 'text/plain',
          bytes,
        },
      ],
      recipients,
      fields,
      // Client first, then candidate, then the agency counter-signs.
      sequential: recipients.length > 1,
      subjectType: candidateId ? 'candidate' : clientId ? 'client' : undefined,
      subjectId: candidateId ?? clientId ?? undefined,
      createdBy: ctx.userId,
    })
    envelopeId = envelope.id
    await provider.send(envelopeId)
  } catch (e) {
    return {
      error: e instanceof SignatureError ? e.message : 'Could not send this agreement.',
    }
  }

  // A signed terms of business is what unlocks working with a client, so the
  // link is recorded rather than left to be matched up later by hand.
  if (clientId && template.status !== 'needs_legal_drafting') {
    const { data: category } = await supabase
      .from('document_templates')
      .select('category')
      .eq('id', templateId)
      .maybeSingle()
    if (category?.category === 'terms_of_business') {
      await supabase
        .from('clients')
        .update({ terms_envelope_id: envelopeId })
        .eq('id', clientId)
        .eq('org_id', ctx.orgId)
    }
  }

  redirect(`/${orgSlug}/envelopes/${envelopeId}`)
}
