import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { BRAND } from '@/lib/brand'
import { regionOf } from '@/lib/region'
import { recordView, resolveSigningToken } from '@/lib/signatures/ceremony'
import { SigningForm } from './signing-form'

// A signing URL is a bearer credential. It must never be indexed, cached by a
// shared proxy, or retained in a referrer sent to a third party.
export const metadata: Metadata = {
  title: 'Sign document',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await resolveSigningToken(token)

  if (!ctx) {
    return (
      <Shell>
        <h1 className="text-xl">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-ink-soft">
          It may have expired, been cancelled, or already been used. Ask whoever
          sent it to issue a new one.
        </p>
      </Shell>
    )
  }

  // Recording the view is evidence, not analytics — do it before rendering.
  const h = await headers()
  await recordView(token, {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  })

  const region = regionOf(ctx.envelope.region)

  if (ctx.status === 'signed') {
    return (
      <Shell org={ctx.envelope.orgName}>
        <h1 className="text-xl">Signed</h1>
        <p className="mt-2 text-sm text-ink-soft">
          You have already signed “{ctx.envelope.subject}”. A copy has been sent
          to {ctx.email}.
        </p>
      </Shell>
    )
  }

  if (ctx.waitingOn) {
    return (
      <Shell org={ctx.envelope.orgName}>
        <h1 className="text-xl">Not your turn yet</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This document is signed in order, and {ctx.waitingOn} needs to sign
          before you. You will be emailed when it reaches you — keep this link.
        </p>
      </Shell>
    )
  }

  return (
    <Shell org={ctx.envelope.orgName}>
      <SigningForm
        token={token}
        subject={ctx.envelope.subject}
        message={ctx.envelope.message}
        signerName={ctx.fullName}
        signerEmail={ctx.email}
        orgName={ctx.envelope.orgName}
        documents={ctx.documents}
        fields={ctx.fields}
        needsAccessCode={ctx.authMethod === 'access_code' && !ctx.authorised}
        eSignatureLaw={region.eSignatureLaw}
        regionLabel={region.label}
      />
    </Shell>
  )
}

function Shell({ children, org }: { children: React.ReactNode; org?: string }) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-line bg-bg-panel">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-sm text-ink-soft">{org ?? BRAND.platform}</span>
          <span className="text-xs text-ink-muted">Secured by {BRAND.engine}</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="panel p-6">{children}</div>
      </main>
    </div>
  )
}
