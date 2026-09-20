import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only three callers are allowed to use it, and each authorises by itself:
 *   1. The public careers site  — filters to published jobs of one org.
 *   2. The signing ceremony     — authorises on a hashed access token.
 *   3. Inbound provider webhooks — authorises on a signature over the body.
 *
 * Never import this into a component, and never pass a user-supplied org id
 * to it without checking membership first.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Same client, but returns null instead of throwing when the service role
 * key is absent or malformed.
 *
 * Public pages use this. A missing key is a deployment mistake, and the
 * right response to it on a page a stranger can reach is "not found" or a
 * degraded view — never a 500 with a stack trace.
 */
export function tryAdminClient(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}
