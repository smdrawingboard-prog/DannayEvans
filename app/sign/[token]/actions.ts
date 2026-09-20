'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  declineToSign,
  submitSignature,
  verifyAccessCode,
} from '@/lib/signatures/ceremony'
import { SignatureError } from '@/lib/signatures/types'

export interface SignResult {
  error?: string
  done?: boolean
}

/**
 * The client IP as the edge saw it. Trusting x-forwarded-for blindly is wrong
 * — anyone can set it — so take only the first hop, which the platform proxy
 * appends, and accept that behind an unknown proxy this is best effort. It is
 * corroborating evidence, never the basis for authorisation.
 */
async function requestContext() {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  return {
    ip: forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
    userAgent: h.get('user-agent'),
  }
}

export async function unlockWithCode(
  token: string,
  _prev: SignResult,
  form: FormData,
): Promise<SignResult> {
  const code = String(form.get('code') ?? '')
  if (!code.trim()) return { error: 'Enter the access code.' }

  const ok = await verifyAccessCode(token, code.trim())
  if (!ok) return { error: 'That code did not match. Check with the sender.' }

  revalidatePath(`/sign/${token}`)
  return {}
}

export async function sign(
  token: string,
  _prev: SignResult,
  form: FormData,
): Promise<SignResult> {
  const values: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    if (key.startsWith('field:')) values[key.slice(6)] = String(value)
  }

  try {
    const ctx = await requestContext()
    await submitSignature({
      token,
      values,
      consent: form.get('consent') === 'on',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })
    revalidatePath(`/sign/${token}`)
    return { done: true }
  } catch (e) {
    return {
      error: e instanceof SignatureError ? e.message : 'Something went wrong. Try again.',
    }
  }
}

export async function decline(
  token: string,
  _prev: SignResult,
  form: FormData,
): Promise<SignResult> {
  const reason = String(form.get('reason') ?? '').trim()
  if (!reason) return { error: 'Please say why, so the sender knows.' }

  try {
    await declineToSign(token, reason, await requestContext())
    revalidatePath(`/sign/${token}`)
    return { done: true }
  } catch (e) {
    return {
      error: e instanceof SignatureError ? e.message : 'Could not record that.',
    }
  }
}
