import { createAdminClient } from '@/lib/supabase/admin'
import { SealedProvider } from './sealed-provider'
import { safeEqual, sha256 } from './crypto'
import { SignatureError } from './types'

/**
 * The signing ceremony: what a recipient who is not a platform user can do.
 *
 * Authorisation here is the hashed access token in the URL, checked against
 * the database with the service role. RLS does not apply because the signer
 * has no Supabase session, so every function in this file must authorise for
 * itself — there is no second line of defence.
 */

const MAX_AUTH_FAILURES = 5

export interface CeremonyContext {
  recipientId: string
  envelopeId: string
  orgId: string
  fullName: string
  email: string
  status: string
  authMethod: string
  /** True once the recipient has cleared any access code or OTP step. */
  authorised: boolean
  envelope: {
    subject: string
    message: string | null
    status: string
    expiresAt: string | null
    orgName: string
    region: string
  }
  documents: {
    id: string
    fileName: string
    url: string
    pageCount: number | null
  }[]
  fields: {
    id: string
    documentId: string
    type: string
    label: string | null
    required: boolean
    page: number
    x: number
    y: number
    width: number
    height: number
    options: string[] | null
    value: string | null
  }[]
  /** Set when an earlier signer in a sequential envelope has not finished. */
  waitingOn: string | null
}

/**
 * Resolve a signing link. Returns null for an unknown, expired, or already
 * finished token so the caller can render one indistinguishable "this link is
 * no longer valid" page — enumeration must not be possible.
 */
export async function resolveSigningToken(
  token: string,
): Promise<CeremonyContext | null> {
  const db = createAdminClient()
  const hash = sha256(token)

  const { data: recipient } = await db
    .from('envelope_recipients')
    .select('*')
    .eq('access_token_hash', hash)
    .maybeSingle()

  if (!recipient) return null
  if (recipient.failed_auth_count >= MAX_AUTH_FAILURES) return null

  const { data: envelope } = await db
    .from('envelopes')
    .select('*, organisations!inner(name, region)')
    .eq('id', recipient.envelope_id)
    .maybeSingle()

  if (!envelope) return null
  if (['voided', 'declined', 'expired'].includes(envelope.status)) return null
  if (envelope.expires_at && new Date(envelope.expires_at) < new Date()) {
    await db.from('envelopes').update({ status: 'expired' }).eq('id', envelope.id)
    return null
  }

  // Sequential envelopes gate on everyone ahead in the order.
  let waitingOn: string | null = null
  if (envelope.sequential) {
    const { data: ahead } = await db
      .from('envelope_recipients')
      .select('full_name, status')
      .eq('envelope_id', envelope.id)
      .lt('signing_order', recipient.signing_order)
      .neq('role', 'cc')
    const pending = (ahead ?? []).filter((r) => r.status !== 'signed')
    if (pending.length > 0) waitingOn = pending[0].full_name
  }

  const { data: docs } = await db
    .from('envelope_documents')
    .select('*')
    .eq('envelope_id', envelope.id)
    .order('position')

  const documents = []
  for (const d of docs ?? []) {
    const { data: signed } = await db.storage
      .from('sealed-documents')
      .createSignedUrl(d.storage_path, 900) // 15 minutes, the ceremony window
    documents.push({
      id: d.id,
      fileName: d.file_name,
      url: signed?.signedUrl ?? '',
      pageCount: d.page_count,
    })
  }

  const { data: fields } = await db
    .from('envelope_fields')
    .select('*')
    .eq('recipient_id', recipient.id)

  const org = envelope.organisations as unknown as { name: string; region: string }

  return {
    recipientId: recipient.id,
    envelopeId: envelope.id,
    orgId: envelope.org_id,
    fullName: recipient.full_name,
    email: recipient.email,
    status: recipient.status,
    authMethod: recipient.auth_method,
    authorised: recipient.auth_method === 'email_link',
    envelope: {
      subject: envelope.subject,
      message: envelope.message,
      status: envelope.status,
      expiresAt: envelope.expires_at,
      orgName: org.name,
      region: org.region,
    },
    documents,
    fields: (fields ?? []).map((f) => ({
      id: f.id,
      documentId: f.document_id,
      type: f.type,
      label: f.label,
      required: f.required,
      page: f.page,
      x: Number(f.x),
      y: Number(f.y),
      width: Number(f.width),
      height: Number(f.height),
      options: f.options,
      value: f.value,
    })),
    waitingOn,
  }
}

/** Record the first view. Idempotent — only the first one is evidence. */
export async function recordView(
  token: string,
  context: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const db = createAdminClient()
  const ctx = await resolveSigningToken(token)
  if (!ctx) return

  const { data: r } = await db
    .from('envelope_recipients')
    .select('first_viewed_at, status')
    .eq('id', ctx.recipientId)
    .single()

  if (r?.first_viewed_at) return

  await db
    .from('envelope_recipients')
    .update({
      first_viewed_at: new Date().toISOString(),
      status: r?.status === 'signed' ? 'signed' : 'viewed',
    })
    .eq('id', ctx.recipientId)

  await new SealedProvider().logEvent(
    ctx.envelopeId,
    ctx.orgId,
    'viewed',
    `${ctx.fullName} <${ctx.email}>`,
    {},
    { ...context, recipientId: ctx.recipientId },
  )
}

/** Check an access code before the documents are shown. */
export async function verifyAccessCode(
  token: string,
  code: string,
): Promise<boolean> {
  const db = createAdminClient()
  const { data: recipient } = await db
    .from('envelope_recipients')
    .select('id, envelope_id, org_id, full_name, email, access_code_hash, failed_auth_count')
    .eq('access_token_hash', sha256(token))
    .maybeSingle()

  if (!recipient?.access_code_hash) return false
  if (recipient.failed_auth_count >= MAX_AUTH_FAILURES) return false

  const ok = safeEqual(sha256(code), recipient.access_code_hash)
  if (!ok) {
    await db
      .from('envelope_recipients')
      .update({ failed_auth_count: recipient.failed_auth_count + 1 })
      .eq('id', recipient.id)
    await new SealedProvider().logEvent(
      recipient.envelope_id,
      recipient.org_id,
      'auth_failed',
      `${recipient.full_name} <${recipient.email}>`,
      { attempt: recipient.failed_auth_count + 1 },
      { recipientId: recipient.id },
    )
  }
  return ok
}

export interface SignSubmission {
  token: string
  /** field id -> value. Signature fields carry the drawn or typed mark. */
  values: Record<string, string>
  consent: boolean
  ip?: string | null
  userAgent?: string | null
}

/**
 * Complete this recipient's part. Validates every required field, records
 * consent to sign electronically, writes the evidence, and advances the
 * envelope — including delivering to the next signer in a sequential flow.
 */
export async function submitSignature(input: SignSubmission): Promise<{
  envelopeStatus: string
}> {
  const db = createAdminClient()
  const provider = new SealedProvider()
  const ctx = await resolveSigningToken(input.token)

  if (!ctx) throw new SignatureError('this signing link is no longer valid', 'unauthorised')
  if (ctx.waitingOn) {
    throw new SignatureError(`waiting on ${ctx.waitingOn} to sign first`, 'invalid_state')
  }
  if (ctx.status === 'signed') {
    throw new SignatureError('you have already signed this document', 'invalid_state')
  }
  // Consent to transact electronically is a precondition in every regime we
  // support, and its absence is exactly what gets a signature challenged.
  if (!input.consent) {
    throw new SignatureError(
      'consent to sign electronically is required',
      'validation',
    )
  }

  const missing = ctx.fields
    .filter((f) => f.required && !String(input.values[f.id] ?? '').trim())
    .map((f) => f.label ?? f.type)
  if (missing.length > 0) {
    throw new SignatureError(`please complete: ${missing.join(', ')}`, 'validation')
  }

  const now = new Date().toISOString()

  for (const field of ctx.fields) {
    const value = input.values[field.id]
    if (value === undefined) continue
    await db
      .from('envelope_fields')
      .update({ value, filled_at: now })
      .eq('id', field.id)
  }

  await db
    .from('envelope_recipients')
    .update({
      status: 'signed',
      signed_at: now,
      signed_ip: input.ip ?? null,
      signed_user_agent: input.userAgent ?? null,
      consent_to_electronic_signature: true,
    })
    .eq('id', ctx.recipientId)

  await provider.logEvent(
    ctx.envelopeId,
    ctx.orgId,
    'signed',
    `${ctx.fullName} <${ctx.email}>`,
    { fields_completed: ctx.fields.length, auth_method: ctx.authMethod },
    { ip: input.ip, userAgent: input.userAgent, recipientId: ctx.recipientId },
  )

  // The database trigger has already moved the envelope on; read it back.
  const { data: envelope } = await db
    .from('envelopes')
    .select('status, sequential, org_id')
    .eq('id', ctx.envelopeId)
    .single()

  if (envelope?.status === 'completed') {
    await provider.issueCertificate(ctx.envelopeId)
    await provider.logEvent(ctx.envelopeId, ctx.orgId, 'completed', 'system')
  } else if (envelope?.sequential) {
    await deliverNextInSequence(ctx.envelopeId, ctx.orgId)
  }

  return { envelopeStatus: envelope?.status ?? 'in_progress' }
}

export async function declineToSign(
  token: string,
  reason: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const db = createAdminClient()
  const ctx = await resolveSigningToken(token)
  if (!ctx) throw new SignatureError('this signing link is no longer valid', 'unauthorised')

  await db
    .from('envelope_recipients')
    .update({
      status: 'declined',
      declined_at: new Date().toISOString(),
      decline_reason: reason,
    })
    .eq('id', ctx.recipientId)

  await new SealedProvider().logEvent(
    ctx.envelopeId,
    ctx.orgId,
    'declined',
    `${ctx.fullName} <${ctx.email}>`,
    { reason },
    { ...context, recipientId: ctx.recipientId },
  )
}

/** Deliver to the next signing order once the current one is complete. */
async function deliverNextInSequence(envelopeId: string, orgId: string): Promise<void> {
  const db = createAdminClient()

  const { data: recips } = await db
    .from('envelope_recipients')
    .select('id, email, signing_order, status, role')
    .eq('envelope_id', envelopeId)
    .neq('role', 'cc')
    .order('signing_order')

  const outstanding = (recips ?? []).filter((r) => r.status !== 'signed')
  if (outstanding.length === 0) return

  const nextOrder = outstanding[0].signing_order
  const toDeliver = outstanding.filter(
    (r) => r.signing_order === nextOrder && r.status === 'pending',
  )
  if (toDeliver.length === 0) return

  await db
    .from('envelope_recipients')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .in('id', toDeliver.map((r) => r.id))

  await new SealedProvider().logEvent(envelopeId, orgId, 'delivered', 'system', {
    signing_order: nextOrder,
    recipients: toDeliver.map((r) => r.email),
  })
}
