import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** URL-safe opaque token. Only the hash is ever persisted. */
export function mintToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Constant-time compare, safe against inputs of differing length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** Six-digit numeric OTP, uniform over 000000–999999. */
export function mintOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

/**
 * Hash over the ordered event log and every sealed document hash. Printed on
 * the completion certificate; recomputing it detects any later tampering.
 */
export function evidenceHash(
  events: { eventType: string; actorLabel: string; occurredAt: string }[],
  documentHashes: string[],
): string {
  const canonical = [
    ...events.map((e) => `${e.occurredAt}|${e.eventType}|${e.actorLabel}`),
    ...documentHashes.map((h) => `doc|${h}`),
  ].join('\n')
  return sha256(canonical)
}
