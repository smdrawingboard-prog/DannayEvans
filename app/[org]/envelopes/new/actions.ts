'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrg } from '@/lib/auth'
import { checkEntitlement, entitlementMessage } from '@/lib/billing'
import { getSignatureProvider, SignatureError } from '@/lib/signatures'
import type { FieldInput, RecipientInput } from '@/lib/signatures/types'

export interface NewEnvelopeResult {
  error?: string
}

const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
])

const recipientSchema = z.object({
  fullName: z.string().min(2, 'Every recipient needs a name').max(120),
  email: z.string().email('Check the recipient email addresses'),
})

/**
 * Create an envelope and, unless saved as a draft, send it.
 *
 * Entitlement is checked before the provider call: sending is the billable
 * moment, and a blocked account should not have an envelope built for it
 * that it cannot dispatch.
 */
export async function createEnvelope(
  orgSlug: string,
  _prev: NewEnvelopeResult,
  form: FormData,
): Promise<NewEnvelopeResult> {
  const ctx = await requireOrg(orgSlug)

  const subject = String(form.get('subject') ?? '').trim()
  if (subject.length < 2) return { error: 'Give the document a subject.' }

  const sendNow = form.get('sendNow') === 'on'
  const sequential = form.get('sequential') === 'on'

  // Recipients arrive as parallel arrays from the repeated form rows.
  const names = form.getAll('recipientName').map(String)
  const emails = form.getAll('recipientEmail').map(String)

  const recipients: RecipientInput[] = []
  const seen = new Set<string>()

  for (let i = 0; i < names.length; i++) {
    if (!names[i]?.trim() && !emails[i]?.trim()) continue // skipped blank row

    const parsed = recipientSchema.safeParse({
      fullName: names[i]?.trim(),
      email: emails[i]?.trim(),
    })
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const key = parsed.data.email.toLowerCase()
    // The schema's unique (envelope_id, email, signing_order) would allow the
    // same person twice at different orders, which is almost always a typo.
    if (seen.has(key)) {
      return { error: `${parsed.data.email} is listed twice.` }
    }
    seen.add(key)

    recipients.push({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      role: 'signer',
      signingOrder: i + 1,
    })
  }

  if (recipients.length === 0) return { error: 'Add at least one recipient.' }

  const files = form.getAll('documents').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { error: 'Attach at least one document.' }

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return { error: `"${file.name}" is larger than 25 MB.` }
    }
    if (!ALLOWED.has(file.type)) {
      return { error: `"${file.name}" is not a PDF, Word document or image.` }
    }
  }

  if (sendNow) {
    const entitlement = await checkEntitlement(ctx.orgId)
    if (!entitlement.allowed) {
      return {
        error: entitlementMessage(entitlement) ?? 'Sending is not available on your plan right now.',
      }
    }
  }

  const documents = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  )

  // One signature block per recipient on the first document. Precise field
  // placement needs a document viewer, which is a separate piece of work;
  // until then every signer gets a signature and a date on page one.
  const fields: FieldInput[] = recipients.flatMap((_, index) => [
    {
      documentIndex: 0, recipientIndex: index, type: 'signature' as const,
      label: 'Signature', required: true, page: 1,
      x: 0.1, y: 0.8 + index * 0.05, width: 0.35, height: 0.04,
    },
    {
      documentIndex: 0, recipientIndex: index, type: 'date_signed' as const,
      label: 'Date', required: true, page: 1,
      x: 0.55, y: 0.8 + index * 0.05, width: 0.2, height: 0.04,
    },
  ])

  const subjectType = String(form.get('subjectType') ?? '') || undefined
  const subjectId = String(form.get('subjectId') ?? '') || undefined

  const provider = getSignatureProvider()
  let envelopeId: string

  try {
    const envelope = await provider.create({
      orgId: ctx.orgId,
      subject,
      message: String(form.get('message') ?? '').trim() || undefined,
      documents,
      recipients,
      fields,
      sequential,
      subjectType,
      subjectId,
      createdBy: ctx.userId,
    })
    envelopeId = envelope.id

    if (sendNow) await provider.send(envelopeId)
  } catch (e) {
    return {
      error: e instanceof SignatureError ? e.message : 'Could not create this document.',
    }
  }

  redirect(`/${orgSlug}/envelopes/${envelopeId}`)
}
