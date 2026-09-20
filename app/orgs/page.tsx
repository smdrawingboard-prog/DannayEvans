import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { BRAND } from '@/lib/brand'
import { regionOf } from '@/lib/region'
import { NewOrgForm } from './new-org-form'
import { signOut } from '../login/actions'

export const metadata = { title: 'Your workspaces' }

export default async function OrgsPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: memberships } = await supabase
    .from('memberships')
    .select('role, organisations!inner(slug, name, region, plan, trial_ends_at)')
    .eq('active', true)

  const orgs = (memberships ?? []).map((m) => ({
    role: m.role,
    ...(m.organisations as unknown as {
      slug: string; name: string; region: string; plan: string; trial_ends_at: string | null
    }),
  }))

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg">{BRAND.platform}</span>
        <form action={signOut}><button className="btn text-sm">Sign out</button></form>
      </div>

      <h1 className="text-2xl mt-8">Your workspaces</h1>

      {orgs.length > 0 && (
        <ul className="mt-5 space-y-2">
          {orgs.map((o) => (
            <li key={o.slug}>
              <Link
                href={`/${o.slug}`}
                className="panel px-4 py-3 flex items-center justify-between hover:bg-bg-secondary transition-colors"
              >
                <span>
                  <span className="block">{o.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {regionOf(o.region).label} · {o.role}
                    {o.plan === 'trial' && o.trial_ends_at
                      ? ` · trial ends ${new Date(o.trial_ends_at).toLocaleDateString('en-GB')}`
                      : ''}
                  </span>
                </span>
                <span aria-hidden className="text-ink-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10">
        <h2 className="text-lg">
          {orgs.length > 0 ? 'Add another workspace' : 'Create your workspace'}
        </h2>
        <NewOrgForm />
      </div>
    </main>
  )
}
