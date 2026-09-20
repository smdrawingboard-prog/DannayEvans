import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/brand'
import { Panel, Pill } from '@/components/ui'
import { updateCareersSite } from './actions'
import { CareersForm } from './careers-form'

export const metadata = { title: 'Careers site' }

export default async function CareersSettingsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const [{ data: site }, { data: published }] = await Promise.all([
    supabase.from('careers_sites').select('*').eq('org_id', ctx.orgId).maybeSingle(),
    supabase
      .from('jobs')
      .select('id, title, slug, meta_title, meta_description, summary, salary_public, salary_min')
      .eq('org_id', ctx.orgId)
      .eq('status', 'open')
      .not('published_at', 'is', null),
  ])

  const publicUrl = `${siteUrl}/careers/${slug}`

  // A quick on-page check against the things that actually cost rankings,
  // rather than a generic score out of a hundred.
  const issues: { role: string; problem: string }[] = []
  for (const j of published ?? []) {
    if (!j.meta_description && !j.summary) {
      issues.push({ role: j.title, problem: 'no meta description or summary' })
    }
    if ((j.meta_title?.length ?? 0) > 60) {
      issues.push({ role: j.title, problem: 'meta title over 60 characters' })
    }
    if (!j.salary_public && j.salary_min) {
      issues.push({ role: j.title, problem: 'salary recorded but hidden — showing it lifts applications' })
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl">Careers site</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Your public page. Every published role carries schema.org JobPosting
          data, which is what Google Jobs and AI search read.
        </p>
      </header>

      <Panel title="Your public page">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <a
              href={`/careers/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent underline break-all"
            >
              {publicUrl}
            </a>
            <p className="mt-1 text-xs text-ink-muted">
              {(published ?? []).length} role{(published ?? []).length === 1 ? '' : 's'} live
            </p>
          </div>
          <Pill tone={site?.enabled ? 'success' : 'neutral'}>
            {site?.enabled ? 'live' : 'off'}
          </Pill>
        </div>
      </Panel>

      {issues.length > 0 && (
        <Panel title="Worth fixing">
          <ul className="space-y-1.5 text-sm">
            {issues.map((i, n) => (
              <li key={n}>
                <span className="text-ink">{i.role}</span>
                <span className="text-ink-soft"> — {i.problem}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">
            Fix these on each role under{' '}
            <Link href={`/${slug}/jobs`} className="text-accent underline">Roles</Link>.
          </p>
        </Panel>
      )}

      <CareersForm
        action={updateCareersSite.bind(null, slug)}
        defaults={{
          enabled: site?.enabled ?? true,
          headline: site?.headline ?? '',
          introMd: site?.intro_md ?? '',
          metaTitle: site?.meta_title ?? '',
          metaDescription: site?.meta_description ?? '',
          primaryKeyword: site?.primary_keyword ?? '',
          googleSiteVerification: site?.google_site_verification ?? '',
          faq: (site?.faq as { q: string; a: string }[] | null) ?? [],
        }}
      />
    </div>
  )
}
