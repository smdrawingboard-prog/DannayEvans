import { createAdminClient } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/brand'
import { evidenceHash, mintToken, sha256 } from './crypto'
import {
  SignatureError,
  type AuditEvent,
  type CreateEnvelopeInput,
  type Envelope,
  type Recipient,
  type SignatureProvider,
  type SignedArtifact,
  type WebhookResult,
} from './types'

const SIGNED_URL_TTL = 3600 // one hour

type Row = Record<string, any>

function toRecipient(r: Row, signingUrl?: string): Recipient {
  return {
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    role: r.role,
    signingOrder: r.signing_order,
    status: r.status,
    authMethod: r.auth_method,
    signingUrl,
    deliveredAt: r.delivered_at,
    viewedAt: r.first_viewed_at,
    signedAt: r.signed_at,
    declinedAt: r.declined_at,
    declineReason: r.decline_reason,
  }
}

function toEnvelope(e: Row, recipients: Recipient[]): Envelope {
  return {
    id: e.id,
    orgId: e.org_id,
    subject: e.subject,
    status: e.status,
    provider: e.provider,
    providerRef: e.provider_ref,
    sequential: e.sequential,
    subjectType: e.subject_type,
    subjectId: e.subject_id,
    recipients,
    sentAt: e.sent_at,
    completedAt: e.completed_at,
    expiresAt: e.expires_at,
    createdAt: e.created_at,
  }
}

/**
 * The built-in engine.
 *
 * It stores envelopes, recipients, fields and the audit trail in Postgres and
 * serves the signing ceremony from this application. That makes the whole
 * platform exercisable end to end today, and it is a genuine implementation
 * rather than a stub: the evidence it produces is the same shape a commercial
 * provider returns.
 *
 * What it deliberately does not do yet is flatten signatures into the PDF
 * itself — `sealDocuments` records hashes and leaves rendering to whichever
 * engine is wired in. See README, "Swapping in your signature app".
 */
export class SealedProvider implements SignatureProvider {
  readonly key = 'sealed'

  private db = createAdminClient()

  async create(input: CreateEnvelopeInput): Promise<Envelope> {
    if (input.documents.length === 0) {
      throw new SignatureError('an envelope needs at least one document', 'validation')
    }
    if (!input.recipients.some((r) => (r.role ?? 'signer') === 'signer')) {
      throw new SignatureError('an envelope needs at least one signer', 'validation')
    }

    const { data: env, error } = await this.db
      .from('envelopes')
      .insert({
        org_id: input.orgId,
        template_id: input.templateId ?? null,
        subject: input.subject,
        message: input.message ?? null,
        provider: this.key,
        sequential: input.sequential ?? false,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        expires_at: input.expiresAt?.toISOString() ?? null,
        reminder_every: input.remindEveryDays
          ? `${input.remindEveryDays} days`
          : null,
        created_by: input.createdBy ?? null,
      })
      .select()
      .single()
    if (error) throw new SignatureError(error.message, 'provider_error')

    // Documents
    const docRows = await Promise.all(
      input.documents.map(async (d, i) => {
        let storagePath = d.storagePath
        if (!storagePath && d.bytes) {
          storagePath = `${input.orgId}/envelopes/${env.id}/${crypto.randomUUID()}-${d.fileName}`
          const up = await this.db.storage
            .from('sealed-documents')
            .upload(storagePath, d.bytes, { contentType: d.mimeType })
          if (up.error) throw new SignatureError(up.error.message, 'provider_error')
        }
        if (!storagePath) {
          throw new SignatureError(
            `document "${d.fileName}" has neither storagePath nor bytes`,
            'validation',
          )
        }
        return {
          envelope_id: env.id,
          org_id: input.orgId,
          file_name: d.fileName,
          mime_type: d.mimeType,
          storage_path: storagePath,
          size_bytes: d.bytes?.byteLength ?? null,
          content_hash: d.bytes ? sha256(d.bytes) : null,
          position: i,
        }
      }),
    )
    const { data: docs, error: docErr } = await this.db
      .from('envelope_documents')
      .insert(docRows)
      .select()
    if (docErr) throw new SignatureError(docErr.message, 'provider_error')

    // Recipients. The raw token exists only in the returned signing URL.
    const tokens = new Map<number, string>()
    const recipientRows = input.recipients.map((r, i) => {
      const token = mintToken()
      tokens.set(i, token)
      return {
        envelope_id: env.id,
        org_id: input.orgId,
        full_name: r.fullName,
        email: r.email.toLowerCase(),
        phone: r.phone ?? null,
        role: r.role ?? 'signer',
        signing_order: r.signingOrder ?? i + 1,
        auth_method: r.authMethod ?? 'email_link',
        access_token_hash: sha256(token),
        access_code_hash: r.accessCode ? sha256(r.accessCode) : null,
      }
    })
    const { data: recips, error: recErr } = await this.db
      .from('envelope_recipients')
      .insert(recipientRows)
      .select()
    if (recErr) throw new SignatureError(recErr.message, 'provider_error')

    // Fields, resolved from the caller's positional indexes to real ids.
    if (input.fields?.length) {
      const fieldRows = input.fields.map((f) => {
        const doc = docs[f.documentIndex]
        const rec = recips[f.recipientIndex]
        if (!doc || !rec) {
          throw new SignatureError(
            `field references document ${f.documentIndex} / recipient ${f.recipientIndex}, which does not exist`,
            'validation',
          )
        }
        return {
          envelope_id: env.id,
          org_id: input.orgId,
          document_id: doc.id,
          recipient_id: rec.id,
          type: f.type,
          label: f.label ?? null,
          required: f.required ?? true,
          page: f.page ?? 1,
          x: f.x,
          y: f.y,
          width: f.width ?? 0.2,
          height: f.height ?? 0.04,
          options: f.options ?? null,
        }
      })
      const { error: fErr } = await this.db.from('envelope_fields').insert(fieldRows)
      if (fErr) throw new SignatureError(fErr.message, 'provider_error')
    }

    await this.logEvent(env.id, input.orgId, 'created', 'system', {
      documents: docs.length,
      recipients: recips.length,
    })

    const recipients = recips.map((r: Row, i: number) =>
      toRecipient(r, `${siteUrl}/sign/${tokens.get(i)}`),
    )
    return toEnvelope(env, recipients)
  }

  async send(envelopeId: string): Promise<Envelope> {
    const env = await this.row(envelopeId)
    if (env.status !== 'draft') {
      throw new SignatureError(
        `envelope is ${env.status}; only a draft can be sent`,
        'invalid_state',
      )
    }

    const { data: recips } = await this.db
      .from('envelope_recipients')
      .select('*')
      .eq('envelope_id', envelopeId)
      .order('signing_order')

    // Sequential envelopes deliver only to the lowest outstanding order.
    const firstOrder = recips?.[0]?.signing_order ?? 1
    const due = (recips ?? []).filter(
      (r: Row) =>
        r.role !== 'cc' && (!env.sequential || r.signing_order === firstOrder),
    )

    await this.db
      .from('envelope_recipients')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .in('id', due.map((r: Row) => r.id))

    const { data: updated } = await this.db
      .from('envelopes')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', envelopeId)
      .select()
      .single()

    await this.logEvent(envelopeId, env.org_id, 'sent', 'system', {
      delivered_to: due.map((r: Row) => r.email),
    })

    return toEnvelope(updated, (recips ?? []).map((r: Row) => toRecipient(r)))
  }

  async get(envelopeId: string): Promise<Envelope | null> {
    const { data: env } = await this.db
      .from('envelopes')
      .select('*')
      .eq('id', envelopeId)
      .maybeSingle()
    if (!env) return null

    const { data: recips } = await this.db
      .from('envelope_recipients')
      .select('*')
      .eq('envelope_id', envelopeId)
      .order('signing_order')

    return toEnvelope(env, (recips ?? []).map((r: Row) => toRecipient(r)))
  }

  async void(envelopeId: string, reason: string): Promise<Envelope> {
    const env = await this.row(envelopeId)
    if (env.status === 'completed') {
      throw new SignatureError('a completed envelope cannot be voided', 'invalid_state')
    }
    const { data } = await this.db
      .from('envelopes')
      .update({ status: 'voided' })
      .eq('id', envelopeId)
      .select()
      .single()

    await this.logEvent(envelopeId, env.org_id, 'voided', 'system', { reason })
    return toEnvelope(data, [])
  }

  async remind(envelopeId: string): Promise<{ remindedCount: number }> {
    const env = await this.row(envelopeId)
    if (!['sent', 'in_progress'].includes(env.status)) {
      throw new SignatureError(
        `envelope is ${env.status}; nothing outstanding to remind`,
        'invalid_state',
      )
    }
    const { data: outstanding } = await this.db
      .from('envelope_recipients')
      .select('id, email')
      .eq('envelope_id', envelopeId)
      .in('status', ['pending', 'delivered', 'viewed'])
      .neq('role', 'cc')

    const count = outstanding?.length ?? 0
    if (count > 0) {
      await this.db
        .from('envelopes')
        .update({ last_reminder_at: new Date().toISOString() })
        .eq('id', envelopeId)
      await this.logEvent(envelopeId, env.org_id, 'reminded', 'system', {
        recipients: outstanding!.map((r: Row) => r.email),
      })
    }
    return { remindedCount: count }
  }

  async auditTrail(envelopeId: string): Promise<AuditEvent[]> {
    const { data } = await this.db
      .from('envelope_events')
      .select('*')
      .eq('envelope_id', envelopeId)
      .order('occurred_at', { ascending: true })

    return (data ?? []).map((e: Row) => ({
      eventType: e.event_type,
      actorLabel: e.actor_label,
      detail: e.detail ?? {},
      ipAddress: e.ip_address,
      userAgent: e.user_agent,
      occurredAt: e.occurred_at,
    }))
  }

  async download(envelopeId: string): Promise<SignedArtifact[]> {
    const { data: docs } = await this.db
      .from('envelope_documents')
      .select('*')
      .eq('envelope_id', envelopeId)
      .order('position')

    const out: SignedArtifact[] = []
    for (const d of docs ?? []) {
      const path = d.sealed_path ?? d.storage_path
      const { data: signed, error } = await this.db.storage
        .from('sealed-documents')
        .createSignedUrl(path, SIGNED_URL_TTL)
      if (error || !signed) continue
      out.push({
        fileName: d.file_name,
        url: signed.signedUrl,
        sha256: d.sealed_hash ?? d.content_hash,
        expiresInSeconds: SIGNED_URL_TTL,
      })
    }

    const { data: cert } = await this.db
      .from('signature_certificates')
      .select('*')
      .eq('envelope_id', envelopeId)
      .maybeSingle()
    if (cert) {
      const { data: signed } = await this.db.storage
        .from('sealed-documents')
        .createSignedUrl(cert.storage_path, SIGNED_URL_TTL)
      if (signed) {
        out.push({
          fileName: 'completion-certificate.pdf',
          url: signed.signedUrl,
          sha256: cert.evidence_hash,
          expiresInSeconds: SIGNED_URL_TTL,
        })
      }
    }
    return out
  }

  /**
   * The built-in engine raises its own events in-process, so there is no
   * inbound webhook to verify. Returning null keeps the route handler's
   * "null means reject" contract intact.
   */
  async parseWebhook(): Promise<WebhookResult | null> {
    return null
  }

  /**
   * Issue the completion certificate once the last signer is done. Called by
   * the signing ceremony, not by external callers.
   */
  async issueCertificate(envelopeId: string): Promise<string> {
    const env = await this.row(envelopeId)
    const events = await this.auditTrail(envelopeId)
    const { data: docs } = await this.db
      .from('envelope_documents')
      .select('content_hash, sealed_hash')
      .eq('envelope_id', envelopeId)

    const hashes = (docs ?? [])
      .map((d: Row) => d.sealed_hash ?? d.content_hash)
      .filter(Boolean) as string[]
    const hash = evidenceHash(events, hashes)

    await this.db.from('signature_certificates').upsert(
      {
        envelope_id: envelopeId,
        org_id: env.org_id,
        storage_path: `${env.org_id}/envelopes/${envelopeId}/certificate.json`,
        evidence_hash: hash,
      },
      { onConflict: 'envelope_id' },
    )
    return hash
  }

  async logEvent(
    envelopeId: string,
    orgId: string,
    eventType: string,
    actorLabel: string,
    detail: Record<string, unknown> = {},
    context: { ip?: string | null; userAgent?: string | null; recipientId?: string } = {},
  ): Promise<void> {
    await this.db.from('envelope_events').insert({
      envelope_id: envelopeId,
      org_id: orgId,
      recipient_id: context.recipientId ?? null,
      event_type: eventType,
      actor_label: actorLabel,
      detail,
      ip_address: context.ip ?? null,
      user_agent: context.userAgent ?? null,
    })
  }

  private async row(envelopeId: string): Promise<Row> {
    const { data } = await this.db
      .from('envelopes')
      .select('*')
      .eq('id', envelopeId)
      .maybeSingle()
    if (!data) throw new SignatureError('envelope not found', 'not_found')
    return data
  }
}
