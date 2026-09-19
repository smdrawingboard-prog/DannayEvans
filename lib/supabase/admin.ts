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
