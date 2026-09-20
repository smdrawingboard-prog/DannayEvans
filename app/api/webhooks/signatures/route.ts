import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSignatureProvider } from '@/lib/signatures'

export const dynamic = 'force-dynamic'

/**
 * Inbound provider webhooks.
 *
 * The body is untrusted until the provider's signature verifies, so nothing
 * is parsed for meaning before that. `parseWebhook` returns null on a
 * verification failure and we reject — a null is never treated as "no events".
 *
 * Responds 200 to anything it has accepted, including a duplicate, because
 * providers retry aggressively on a non-2xx and a retry storm is worse than
 * a no-op.
 */
export async function POST(request: NextRequest) {
  const providerKey = request.nextUrl.searchParams.get('provider') ?? 'pandadoc'
  const raw = await request.text()

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  let parsed
  try {
    parsed = await getSignatureProvider(providerKey).parseWebhook(raw, headers)
  } catch {
    return NextResponse.json({ error: 'unprocessable' }, { status: 400 })
  }

  if (!parsed) {
    return NextResponse.json({ error: 'signature verification failed' }, { status: 401 })
  }

  const db = createAdminClient()

  const { data: envelope } = await db
    .from('envelopes')
    .select('id, org_id, status')
    .eq('provider', providerKey)
    .eq('provider_ref', parsed.envelopeRef)
    .maybeSingle()

  // An event for an envelope we do not hold is acknowledged and dropped:
  // it is almost always a stale subscription, not an error worth retrying.
  if (!envelope) return NextResponse.json({ ok: true, matched: false })

  await db.from('envelope_events').insert({
    envelope_id: envelope.id,
    org_id: envelope.org_id,
    event_type: parsed.eventType,
    actor_label: parsed.recipientEmail ?? providerKey,
    detail: { provider: providerKey },
  })

  // Map the provider's vocabulary onto ours. Anything unrecognised is logged
  // above and left to a human, rather than guessed at.
  const statusMap: Record<string, string> = {
    'document.sent': 'sent',
    'document.viewed': 'in_progress',
    'document.completed': 'completed',
    'document.declined': 'declined',
    'document.voided': 'voided',
  }
  const next = statusMap[parsed.eventType]

  if (next && next !== envelope.status) {
    await db
      .from('envelopes')
      .update({
        status: next,
        ...(next === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', envelope.id)
  }

  if (parsed.recipientEmail && parsed.eventType === 'recipient_completed') {
    await db
      .from('envelope_recipients')
      .update({ status: 'signed', signed_at: new Date().toISOString() })
      .eq('envelope_id', envelope.id)
      .eq('email', parsed.recipientEmail.toLowerCase())
  }

  return NextResponse.json({ ok: true })
}
