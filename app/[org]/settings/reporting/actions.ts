'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface TokenResult {
  error?: string
  /** Shown once. Never recoverable, because only a hash is stored. */
  token?: string
  name?: string
}

const SCOPES = [
  'shortlist', 'pipeline', 'placements', 'candidates', 'clients', 'billing',
] as const

export async function mintReportToken(
  orgSlug: string,
  _prev: TokenResult,
  form: FormData,
): Promise<TokenResult> {
  const ctx = await requireOrg(orgSlug)

  const name = String(form.get('name') ?? '').trim()
  if (name.length < 2) return { error: 'Give the token a name you will recognise.' }

  const scopes = form.getAll('scopes').map(String).filter((s) =>
    (SCOPES as readonly string[]).includes(s),
  )
  if (scopes.length === 0) return { error: 'Choose at least one report.' }

  const days = Number(form.get('days') ?? 90)
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return { error: 'A token lasts between 1 and 365 days.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_report_token', {
    p_org: ctx.orgId,
    p_name: name,
    p_scopes: scopes,
    p_days: days,
  })

  if (error) return { error: error.message.replace(/^.*?:\s*/, '') }

  revalidatePath(`/${orgSlug}/settings/reporting`)
  return { token: data as string, name }
}

export async function revokeReportToken(orgSlug: string, form: FormData): Promise<void> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  await supabase
    .from('report_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('org_id', ctx.orgId)
    .eq('id', String(form.get('id') ?? ''))
    .is('revoked_at', null)

  revalidatePath(`/${orgSlug}/settings/reporting`)
}
