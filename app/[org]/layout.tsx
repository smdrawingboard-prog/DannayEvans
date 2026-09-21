import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { BRAND } from '@/lib/brand'
import { signOut } from '../login/actions'

const NAV = [
  { href: '', label: 'Overview' },
  { href: '/jobs', label: 'Roles' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/scorecards', label: 'Scorecards' },
  { href: '/right-to-represent', label: 'Right to represent' },
  { href: '/placements', label: 'Placements' },
  { href: '/templates', label: 'Agreements' },
  { href: '/envelopes', label: 'Signatures' },
  { href: '/deals', label: 'Business development' },
  { href: '/careers', label: 'Careers site' },
  { href: '/automations', label: 'Automations' },
  { href: '/settings/outreach', label: 'Outreach and consent' },
  { href: '/settings/billing', label: 'Plan and usage' },
  { href: '/settings', label: 'Settings' },
]

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)

  const trialDaysLeft = ctx.trialEndsAt
    ? Math.ceil((new Date(ctx.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="min-h-screen md:flex">
      {/* On mobile this becomes a horizontally scrolling strip rather than a
          drawer — fewer taps, and it works without JavaScript. */}
      <nav
        aria-label="Sections"
        className="md:w-[220px] md:shrink-0 md:min-h-screen bg-bg-secondary border-b md:border-b-0 md:border-r border-line"
      >
        <div className="px-4 py-4 hidden md:block">
          <Link href="/orgs" className="font-display text-base block">{BRAND.platform}</Link>
          <span className="block mt-0.5 text-xs text-ink-muted truncate">{ctx.name}</span>
        </div>

        <ul className="flex md:block overflow-x-auto md:overflow-visible">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={`/${slug}${item.href}`}
                className="block px-4 py-2.5 text-sm whitespace-nowrap text-ink-soft hover:bg-bg-panel hover:text-ink transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:block px-4 py-4 mt-4 border-t border-line">
          {ctx.plan === 'trial' && trialDaysLeft !== null && (
            <p className="text-xs text-ink-muted mb-3">
              Trial: {trialDaysLeft > 0 ? `${trialDaysLeft} days left` : 'expired'}
            </p>
          )}
          <p className="text-xs text-ink-muted mb-2">
            {ctx.region.label} · {ctx.currency} · {ctx.region.privacyRegime}
          </p>
          <form action={signOut}>
            <button className="text-xs text-ink-soft underline">Sign out</button>
          </form>
        </div>
      </nav>

      <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
    </div>
  )
}
