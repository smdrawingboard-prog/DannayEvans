import { createClient } from '@/lib/supabase/server'

/**
 * Turning a template into a document to sign.
 *
 * A merge key resolves from a record the agency already keeps — the
 * organisation, the client, the candidate, the role. Anything the signer
 * types (their ID number, their signature, the date) is a field, not a merge
 * key, and never appears here.
 *
 * A key with no value is left visible as a blank rather than silently
 * dropped. A contract that quietly renders "Registration Number: " reads as a
 * mistake; one that renders "Registration Number: [ registration number ]"
 * tells whoever is about to send it exactly what is missing.
 */

export interface MergeContext {
  orgId: string
  clientId?: string | null
  candidateId?: string | null
  jobId?: string | null
}

export interface ResolvedTemplate {
  body: string
  /** Keys the template declares and we filled. */
  resolved: Record<string, string>
  /** Keys the template declares that no record could supply. */
  missing: string[]
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g

/** What a blank looks like in the rendered document. */
function blank(key: string): string {
  return `[ ${key.replace(/_/g, ' ')} ]`
}

/**
 * Collect the values available for this context.
 *
 * Reads go through the request-scoped client, so row level security applies:
 * a client or candidate belonging to another tenant simply is not found, and
 * its keys come back missing rather than wrong.
 */
export async function buildMergeValues(
  ctx: MergeContext,
): Promise<Record<string, string>> {
  const supabase = await createClient()
  const values: Record<string, string> = {}

  const { data: org } = await supabase
    .from('organisations')
    .select(
      'name, legal_name, registration_number, vat_number, information_officer_name, information_officer_email, unsuccessful_retention_months',
    )
    .eq('id', ctx.orgId)
    .maybeSingle()

  if (org) {
    put(values, 'agency_legal_name', org.legal_name ?? org.name)
    put(values, 'agency_registration_number', org.registration_number)
    put(values, 'agency_vat_number', org.vat_number)
    put(values, 'information_officer_name', org.information_officer_name)
    put(values, 'information_officer_email', org.information_officer_email)
    put(values, 'retention_months', org.unsuccessful_retention_months)
  }

  if (ctx.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select(
        'name, registration_number, vat_number, fee_percent, payment_terms_days, guarantee_days, replacement_window_days, introduction_validity_months',
      )
      .eq('id', ctx.clientId)
      .maybeSingle()

    if (client) {
      put(values, 'client_legal_name', client.name)
      put(values, 'client_name', client.name)
      put(values, 'client_registration_number', client.registration_number)
      put(values, 'client_vat_number', client.vat_number)
      put(values, 'fee_percent', client.fee_percent)
      put(values, 'payment_terms_days', client.payment_terms_days)
      put(values, 'guarantee_days', client.guarantee_days)
      put(values, 'replacement_window_days', client.replacement_window_days)
      put(values, 'introduction_validity_months', client.introduction_validity_months)
    }
  }

  if (ctx.candidateId) {
    const { data: candidate } = await supabase
      .from('candidates')
      .select('full_name')
      .eq('id', ctx.candidateId)
      .maybeSingle()
    if (candidate) put(values, 'candidate_full_name', candidate.full_name)
  }

  if (ctx.jobId) {
    const { data: job } = await supabase
      .from('jobs')
      .select('title, reference, clients(name)')
      .eq('id', ctx.jobId)
      .maybeSingle()
    if (job) {
      put(values, 'role_title', job.title)
      put(values, 'job_reference', job.reference)
      // A role carries its client, so an RTR sent from a job does not need
      // the client picked again.
      const client = job.clients as unknown as { name?: string } | null
      if (client?.name && !values.client_name) {
        put(values, 'client_name', client.name)
        put(values, 'client_legal_name', client.name)
      }
    }
  }

  // Terms the business sets rather than stores per record. These are the
  // bracketed durations the supplied templates left for the agency to fill.
  put(values, 'rtr_validity_months', values.introduction_validity_months ?? 6)
  put(values, 'prior_submission_months', 6)
  put(values, 'nda_duration_years', 3)

  return values
}

function put(target: Record<string, string>, key: string, value: unknown) {
  if (value === null || value === undefined) return
  const text = String(value).trim()
  if (text === '') return
  target[key] = text
}

/**
 * Render a template body, reporting what could not be filled.
 *
 * `missing` drives the warning on the send screen. It is deliberately
 * returned rather than thrown: an agency sending an NDA before it has
 * captured the client's registration number should see which blank it is
 * about to send, and decide.
 */
export function renderTemplate(
  body: string,
  values: Record<string, string>,
): ResolvedTemplate {
  const resolved: Record<string, string> = {}
  const missing = new Set<string>()

  const rendered = body.replace(PLACEHOLDER, (_match, key: string) => {
    const value = values[key]
    if (value === undefined) {
      missing.add(key)
      return blank(key)
    }
    resolved[key] = value
    return value
  })

  return { body: rendered, resolved, missing: [...missing].sort() }
}

/** The signing fields a template declares, as the ceremony understands them. */
export interface TemplateField {
  type: string
  label: string
  recipient?: string
  required?: boolean
  document_kind?: string
}

export function templateFields(schema: unknown): TemplateField[] {
  if (!Array.isArray(schema)) return []
  return schema.filter(
    (f): f is TemplateField =>
      typeof f === 'object' && f !== null && typeof (f as TemplateField).type === 'string',
  )
}

/** Human wording for a template's readiness, used in more than one place. */
export function statusLabel(status: string): { label: string; tone: 'success' | 'warning' | 'danger' } {
  switch (status) {
    case 'ready':
      return { label: 'Reviewed and ready', tone: 'success' }
    case 'needs_legal_review':
      return { label: 'Needs legal review', tone: 'warning' }
    default:
      return { label: 'Not drafted', tone: 'danger' }
  }
}
