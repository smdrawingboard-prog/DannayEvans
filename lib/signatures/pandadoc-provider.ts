import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SignatureError,
  type AuditEvent,
  type CreateEnvelopeInput,
  type Envelope,
  type SignatureProvider,
  type SignedArtifact,
  type WebhookResult,
} from './types'

const API = 'https://api.pandadoc.com/public/v1'

/**
 * PandaDoc backend.
 *
 * Kept as a second implementation so the abstraction stays honest: anything
 * the recruitment side needs has to be expressible against a provider that
 * was not designed for it. Local envelope rows are still written, because the
 * audit trail and the vertical's foreign keys live here regardless of who
 * renders the document.
 *
 * Status: the create/send/status/download paths below are written against the
 * documented API but have not been exercised against a live account.
 */
export class PandaDocProvider implements SignatureProvider {
  readonly key = 'pandadoc'

  private db = createAdminClient()

  private get token(): string {
    const t = process.env.PANDADOC_API_KEY
    if (!t) throw new SignatureError('PANDADOC_API_KEY is not set', 'provider_error')
    return t
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `API-Key ${this.token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      throw new SignatureError(
        `PandaDoc ${res.status}: ${await res.text()}`,
        'provider_error',
      )
    }
    return res.json() as Promise<T>
  }

  async create(input: CreateEnvelopeInput): Promise<Envelope> {
    const { data: local, error } = await this.db
      .from('envelopes')
      .insert({
        org_id: input.orgId,
        subject: input.subject,
        message: input.message ?? null,
        provider: this.key,
        sequential: input.sequential ?? false,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        created_by: input.createdBy ?? null,
      })
      .select()
      .single()
    if (error) throw new SignatureError(error.message, 'provider_error')

    const remote = await this.call<{ id: string }>('/documents', {
      method: 'POST',
      body: JSON.stringify({
        name: input.subject,
        recipients: input.recipients.map((r, i) => ({
          email: r.email,
          first_name: r.fullName.split(' ')[0],
          last_name: r.fullName.split(' ').slice(1).join(' ') || '-',
          role: r.role ?? 'signer',
          signing_order: r.signingOrder ?? i + 1,
        })),
        // Document content is uploaded separately; see the PandaDoc docs on
        // creating from an uploaded file rather than a template.
        parse_form_fields: true,
      }),
    })

    await this.db
      .from('envelopes')
      .update({ provider_ref: remote.id })
      .eq('id', local.id)

    await this.db.from('envelope_events').insert({
      envelope_id: local.id,
      org_id: input.orgId,
      event_type: 'created',
      actor_label: 'system',
      detail: { provider: this.key, provider_ref: remote.id },
    })

    return {
      id: local.id,
      orgId: input.orgId,
      subject: input.subject,
      status: 'draft',
      provider: this.key,
      providerRef: remote.id,
      sequential: input.sequential ?? false,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      recipients: [],
      createdAt: local.created_at,
    }
  }

  async send(envelopeId: string): Promise<Envelope> {
    const ref = await this.ref(envelopeId)
    await this.call(`/documents/${ref}/send`, {
      method: 'POST',
      body: JSON.stringify({ silent: false }),
    })
    const { data } = await this.db
      .from('envelopes')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', envelopeId)
      .select()
      .single()
    return this.hydrate(data)
  }

  async get(envelopeId: string): Promise<Envelope | null> {
    const { data } = await this.db
      .from('envelopes')
      .select('*')
      .eq('id', envelopeId)
      .maybeSingle()
    return data ? this.hydrate(data) : null
  }

  async void(envelopeId: string, reason: string): Promise<Envelope> {
    const ref = await this.ref(envelopeId)
    await this.call(`/documents/${ref}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'document.voided', reason }),
    })
    const { data } = await this.db
      .from('envelopes')
      .update({ status: 'voided' })
      .eq('id', envelopeId)
      .select()
      .single()
    return this.hydrate(data)
  }

  async remind(envelopeId: string): Promise<{ remindedCount: number }> {
    const ref = await this.ref(envelopeId)
    await this.call(`/documents/${ref}/send`, {
      method: 'POST',
      body: JSON.stringify({ silent: false }),
    })
    return { remindedCount: 1 }
  }

  async auditTrail(envelopeId: string): Promise<AuditEvent[]> {
    const { data } = await this.db
      .from('envelope_events')
      .select('*')
      .eq('envelope_id', envelopeId)
      .order('occurred_at')
    return (data ?? []).map((e) => ({
      eventType: e.event_type,
      actorLabel: e.actor_label,
      detail: e.detail ?? {},
      ipAddress: e.ip_address,
      userAgent: e.user_agent,
      occurredAt: e.occurred_at,
    }))
  }

  async download(envelopeId: string): Promise<SignedArtifact[]> {
    const ref = await this.ref(envelopeId)
    // PandaDoc streams the PDF; the caller proxies it rather than handing the
    // browser a URL carrying our API key.
    return [
      {
        fileName: `${ref}.pdf`,
        url: `/api/envelopes/${envelopeId}/download`,
        sha256: null,
        expiresInSeconds: 300,
      },
    ]
  }

  async parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookResult | null> {
    const secret = process.env.PANDADOC_WEBHOOK_SECRET
    const provided = headers['x-pandadoc-signature'] ?? headers['signature']
    if (!secret || !provided) return null

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(provided)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    const parsed = JSON.parse(rawBody)
    const first = Array.isArray(parsed) ? parsed[0] : parsed
    return {
      envelopeRef: first?.data?.id,
      eventType: first?.event,
      recipientEmail: first?.data?.recipient?.email,
      raw: parsed,
    }
  }

  private async ref(envelopeId: string): Promise<string> {
    const { data } = await this.db
      .from('envelopes')
      .select('provider_ref')
      .eq('id', envelopeId)
      .maybeSingle()
    if (!data?.provider_ref) {
      throw new SignatureError('envelope has no PandaDoc reference', 'not_found')
    }
    return data.provider_ref
  }

  private hydrate(row: Record<string, any>): Envelope {
    return {
      id: row.id,
      orgId: row.org_id,
      subject: row.subject,
      status: row.status,
      provider: row.provider,
      providerRef: row.provider_ref,
      sequential: row.sequential,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      recipients: [],
      sentAt: row.sent_at,
      completedAt: row.completed_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }
  }
}
