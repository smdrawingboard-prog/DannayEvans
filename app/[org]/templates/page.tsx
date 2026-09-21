import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Panel, Pill, EmptyState } from '@/components/ui'
import { statusLabel } from '@/lib/templates'

export const metadata = { title: 'Agreements' }

const CATEGORY_ORDER = [
  'terms_of_business',
  'nda',
  'dpa',
  'rtr',
  'candidate_consent',
  'background_check_consent',
  'temp_employment_contract',
]

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('document_templates')
    .select('id, name, description, category, status, signed_by, is_system, system_code, jurisdiction')
    .eq('org_id', ctx.orgId)
    .order('name')

  const sorted = [...(templates ?? [])].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category ?? '')
    const bi = CATEGORY_ORDER.indexOf(b.category ?? '')
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const undrafted = sorted.filter((t) => t.status === 'needs_legal_drafting').length
  const unreviewed = sorted.filter((t) => t.status === 'needs_legal_review').length

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Agreements</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Your standard pack. Every workspace starts with these; edit one and it
          becomes yours, and we stop updating it.
        </p>
      </header>

      {(undrafted > 0 || unreviewed > 0) && (
        <div role="status" className="panel p-4 text-sm border-state-warning">
          <p className="text-ink">
            Nothing in this pack has been signed off by a practitioner.
          </p>
          <p className="mt-1 text-ink-soft">
            {unreviewed > 0 && (
              <>
                {unreviewed} {unreviewed === 1 ? 'agreement carries' : 'agreements carry'} real
                text that has not been reviewed.{' '}
              </>
            )}
            {undrafted > 0 && (
              <>
                {undrafted} {undrafted === 1 ? 'is' : 'are'} clause headings only and cannot be
                sent.
              </>
            )}
          </p>
        </div>
      )}

      <Panel>
        {sorted.length === 0 ? (
          <EmptyState
            title="No agreements yet"
            body="The standard pack installs with a new workspace. If this is empty, something went wrong at signup."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Agreement</th><th>Signed by</th><th>Jurisdiction</th>
                  <th>Status</th><th>Ours or yours</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => {
                  const status = statusLabel(t.status)
                  return (
                    <tr key={t.id} className="hover:bg-bg-secondary">
                      <td>
                        <Link href={`/${slug}/templates/${t.id}`} className="hover:underline">
                          {t.name}
                        </Link>
                        {t.description && (
                          <span className="block text-xs text-ink-muted max-w-lg">
                            {t.description}
                          </span>
                        )}
                      </td>
                      <td className="text-ink-soft text-xs">
                        {(t.signed_by ?? []).join(' and ') || '—'}
                      </td>
                      <td className="text-ink-soft text-xs">{t.jurisdiction ?? '—'}</td>
                      <td><Pill tone={status.tone}>{status.label}</Pill></td>
                      <td className="text-xs text-ink-muted">
                        {t.is_system ? 'Standard' : 'Edited by you'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-ink-muted max-w-2xl">
        {ctx.region.privacyRegime} applies to how you handle what these documents
        collect. The templates are a starting point, not legal advice — have them
        reviewed before you rely on them.
      </p>
    </div>
  )
}
