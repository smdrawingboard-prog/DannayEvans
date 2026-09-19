import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { regionOf, type RegionConfig } from '@/lib/region'

export interface OrgContext {
  userId: string
  orgId: string
  slug: string
  name: string
  role: 'owner' | 'admin' | 'recruiter' | 'sales' | 'viewer' | 'client'
  region: RegionConfig
  currency: string
  plan: string
  trialEndsAt: string | null
}

/**
 * Resolves the signed-in user's membership of `slug`, or redirects.
 *
 * Every authenticated page calls this. It is the single place that turns a URL
 * segment into an authorised org id — components never read the slug directly.
 * Cached per request so a page with ten server components makes one query.
 */
export const requireOrg = cache(async (slug: string): Promise<OrgContext> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/${slug}`)

  const { data, error } = await supabase
    .from('memberships')
    .select(
      'role, organisations!inner(id, slug, name, region, currency, plan, trial_ends_at)',
    )
    .eq('user_id', user.id)
    .eq('active', true)
    .eq('organisations.slug', slug)
    .maybeSingle()

  // A non-member sees the same outcome as a non-existent organisation, so the
  // URL space cannot be probed for which tenants exist.
  if (error || !data) redirect('/orgs')

  const org = data.organisations as unknown as {
    id: string
    slug: string
    name: string
    region: string
    currency: string
    plan: string
    trial_ends_at: string | null
  }

  return {
    userId: user.id,
    orgId: org.id,
    slug: org.slug,
    name: org.name,
    role: data.role,
    region: regionOf(org.region),
    currency: org.currency,
    plan: org.plan,
    trialEndsAt: org.trial_ends_at,
  }
})

export const requireUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user
})

export function canManage(role: OrgContext['role']): boolean {
  return role === 'owner' || role === 'admin'
}
