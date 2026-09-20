import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { checkEntitlement, entitlementMessage } from '@/lib/billing'
import { createEnvelope } from './actions'
import { EnvelopeForm } from './envelope-form'

export const metadata = { title: 'Send a document' }

export default async function NewEnvelopePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ subjectType?: string; subjectId?: string }>
}) {
  const { org: slug } = await params
  const { subjectType, subjectId } = await searchParams
  const ctx = await requireOrg(slug)

  // When arriving from a candidate record, prefill them as the first signer.
  let prefill: { name: string; email: string } | null = null
  if (subjectType === 'candidate' && subjectId) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('candidates')
      .select('full_name, email')
      .eq('id', subjectId)
      .maybeSingle()
    if (data?.email) prefill = { name: data.full_name, email: data.email }
  }

  const entitlement = await checkEntitlement(ctx.orgId)
  const warning = entitlementMessage(entitlement)

  const action = createEnvelope.bind(null, slug)

  return (
    <div className="max-w-2xl space-y-5">
      <nav className="text-sm">
        <Link href={`/${slug}/envelopes`} className="text-accent hover:underline">
          ← Signatures
        </Link>
      </nav>

      <header>
        <h1 className="text-2xl">Send a document</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Every view, signature and decline is recorded against this document.
          {' '}{ctx.region.eSignatureLaw} governs its legal effect in {ctx.region.label}.
        </p>
      </header>

      {warning && (
        <div
          role="status"
          className={`panel p-4 text-sm ${
            entitlement.allowed ? 'border-state-warning' : 'border-state-danger'
          }`}
        >
          {warning}
          {!entitlement.allowed && (
            <>
              {' '}
              <Link href={`/${slug}/settings/billing`} className="text-accent underline">
                Plan and usage
              </Link>
            </>
          )}
        </div>
      )}

      <EnvelopeForm
        action={action}
        subjectType={subjectType}
        subjectId={subjectId}
        prefill={prefill}
      />
    </div>
  )
}
