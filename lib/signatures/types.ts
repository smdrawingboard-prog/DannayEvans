/**
 * The contract every signature backend implements.
 *
 * The recruitment vertical only ever talks to this interface. Swapping the
 * built-in engine for your existing signature application means writing one
 * more implementation of `SignatureProvider` and changing SIGNATURE_PROVIDER
 * in the environment — no caller changes.
 */

export type EnvelopeStatus =
  | 'draft' | 'sent' | 'in_progress' | 'completed'
  | 'declined' | 'voided' | 'expired'

export type RecipientRole = 'signer' | 'approver' | 'cc' | 'filler'
export type RecipientStatus =
  | 'pending' | 'delivered' | 'viewed' | 'signed' | 'declined' | 'bounced'
export type AuthMethod =
  | 'email_link' | 'sms_otp' | 'access_code' | 'id_document' | 'platform_sso'
export type FieldType =
  | 'signature' | 'initials' | 'full_name' | 'date_signed'
  | 'text' | 'number' | 'checkbox' | 'dropdown' | 'attachment'

export interface RecipientInput {
  fullName: string
  email: string
  phone?: string
  role?: RecipientRole
  /** 1-based. Recipients sharing an order sign in parallel. */
  signingOrder?: number
  authMethod?: AuthMethod
  /** Required when authMethod is 'access_code'. Stored hashed. */
  accessCode?: string
}

export interface FieldInput {
  documentIndex: number
  recipientIndex: number
  type: FieldType
  label?: string
  required?: boolean
  page?: number
  /** Fractions of page width and height, 0–1, so layout survives re-rendering. */
  x: number
  y: number
  width?: number
  height?: number
  options?: string[]
}

export interface DocumentInput {
  fileName: string
  mimeType: string
  /** Path in the `sealed-documents` bucket, or raw bytes to be uploaded. */
  storagePath?: string
  bytes?: Uint8Array
}

export interface CreateEnvelopeInput {
  orgId: string
  subject: string
  message?: string
  documents: DocumentInput[]
  recipients: RecipientInput[]
  fields?: FieldInput[]
  /** Enforce the signing order rather than sending to everyone at once. */
  sequential?: boolean
  expiresAt?: Date
  remindEveryDays?: number
  /** What in the vertical caused this envelope, for the back-link. */
  subjectType?: string
  subjectId?: string
  templateId?: string
  createdBy?: string
}

export interface Recipient {
  id: string
  fullName: string
  email: string
  role: RecipientRole
  signingOrder: number
  status: RecipientStatus
  authMethod: AuthMethod
  /** Only returned at creation time by providers that mint their own links. */
  signingUrl?: string
  deliveredAt?: string | null
  viewedAt?: string | null
  signedAt?: string | null
  declinedAt?: string | null
  declineReason?: string | null
}

export interface Envelope {
  id: string
  orgId: string
  subject: string
  status: EnvelopeStatus
  provider: string
  providerRef?: string | null
  sequential: boolean
  subjectType?: string | null
  subjectId?: string | null
  recipients: Recipient[]
  sentAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null
  createdAt: string
}

export interface AuditEvent {
  eventType: string
  actorLabel: string
  detail: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
  occurredAt: string
}

export interface SignedArtifact {
  fileName: string
  /** Short-lived signed URL. Raw storage URLs are never exposed. */
  url: string
  sha256?: string | null
  expiresInSeconds: number
}

export interface WebhookResult {
  envelopeRef: string
  eventType: string
  recipientEmail?: string
  raw: unknown
}

export interface SignatureProvider {
  readonly key: string

  /** Build an envelope in draft. Nothing is delivered yet. */
  create(input: CreateEnvelopeInput): Promise<Envelope>

  /** Deliver to the first recipient (or all, when not sequential). */
  send(envelopeId: string): Promise<Envelope>

  get(envelopeId: string): Promise<Envelope | null>

  /** Cancel an envelope that has not completed. */
  void(envelopeId: string, reason: string): Promise<Envelope>

  /** Re-notify outstanding recipients. */
  remind(envelopeId: string): Promise<{ remindedCount: number }>

  /** The full append-only trail. This is the evidence in a dispute. */
  auditTrail(envelopeId: string): Promise<AuditEvent[]>

  /** Signed output plus the completion certificate, as signed URLs. */
  download(envelopeId: string): Promise<SignedArtifact[]>

  /**
   * Verify an inbound webhook signature and normalise the payload.
   * Returns null when the signature does not verify — callers must treat a
   * null as a rejected request, never as an empty event.
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookResult | null>
}

export class SignatureError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_found' | 'invalid_state' | 'unauthorised'
      | 'provider_error' | 'validation',
  ) {
    super(message)
    this.name = 'SignatureError'
  }
}
