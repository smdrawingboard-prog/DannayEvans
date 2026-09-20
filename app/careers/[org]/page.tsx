import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { tryAdminClient } from '@/lib/supabase/admin'
import { formatMoney, regionOf } from '@/lib/region'
import { siteUrl } from '@/lib/brand'

/*
 * A tenant's public careers site.
 *
 * Served with the service role and an explicit published-only filter, because
 * the visitor has no session for RLS to act on. Every query in this file must
 * therefore carry its own org and status constraints.
 *
 * Revalidated rather than rendered per request: careers pages are read far
 * more often than they change, and a cached page survives a flaky connection.
 */
export const revalidate = 300

async function loadSite(slug: string) {
  // Null rather than a throw: an unreachable backend on a public page
  // should read as "not found", not as a server error.
  const db = tryAdminClient()
  if (!db) return null

  const { data: org } = await db
    .from('organisations')
    .select('id, name, slug, region, currency, logo_url, website_url, whatsapp_number')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()
  if (!org) return null

  const { data: site } = await db
    .from('careers_sites')
    .select('*')
    .eq('org_id', org.id)
    .eq('enabled', true)
    .maybeSingle()
  if (!site) return null

  const { data: jobs } = await db
    .from('jobs')
    .select('id, slug, title, city, country, work_model, employment_type, salary_min, salary_max, salary_currency, salary_public, summary, published_at')
    .eq('org_id', org.id)
    .eq('status', 'open')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  return { org, site, jobs: jobs ?? [] }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string }>
}): Promise<Metadata> {
  const { org: slug } = await params
  const data = await loadSite(slug)
  if (!data) return { title: 'Careers' }

  const url = `${siteUrl}/careers/${slug}`
  return {
    title: data.site.meta_title ?? `Careers at ${data.org.name}`,
    description:
      data.site.meta_description ??
      `${data.jobs.length} open role${data.jobs.length === 1 ? '' : 's'} at ${data.org.name}. Apply in minutes.`,
    alternates: { canonical: url },
    openGraph: {
      title: data.site.meta_title ?? `Careers at ${data.org.name}`,
      url,
      images: data.site.og_image_url ? [data.site.og_image_url] : undefined,
    },
    other: data.site.google_site_verification
      ? { 'google-site-verification': data.site.google_site_verification }
      : undefined,
  }
}

export default async function CareersPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const data = await loadSite(slug)
  if (!data) notFound()

  const { org, site, jobs } = data
  const region = regionOf(org.region)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: org.name,
        url: org.website_url ?? `${siteUrl}/careers/${slug}`,
        logo: org.logo_url ?? undefined,
      },
      ...(Array.isArray(site.faq) && site.faq.length > 0
        ? [{
            '@type': 'FAQPage',
            mainEntity: (site.faq as { q: string; a: string }[]).map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }]
        : []),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="font-display text-3xl">
          {site.headline ?? `Careers at ${org.name}`}
        </h1>
        {site.intro_md && (
          <p className="mt-3 text-ink-soft whitespace-pre-line">{site.intro_md}</p>
        )}

        <section className="mt-10">
          <h2 className="text-xl">
            {jobs.length} open role{jobs.length === 1 ? '' : 's'}
          </h2>

          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Nothing open right now. Check back, or send a speculative
              application — we keep good people on file.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/careers/${slug}/${j.slug}`}
                    className="panel p-4 block hover:bg-bg-secondary transition-colors"
                  >
                    <span className="font-display text-base block">{j.title}</span>
                    <span className="block mt-1 text-sm text-ink-soft">
                      {[j.city, j.country].filter(Boolean).join(', ')}
                      {' · '}{j.work_model}{' · '}{j.employment_type.replace('_', ' ')}
                      {j.salary_public && j.salary_min
                        ? ` · from ${formatMoney(Number(j.salary_min), j.salary_currency ?? org.currency, region.locale)}`
                        : ''}
                    </span>
                    {j.summary && (
                      <span className="block mt-2 text-sm text-ink-soft line-clamp-2">{j.summary}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {Array.isArray(site.faq) && site.faq.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl">Questions</h2>
            <dl className="mt-4 divide-y divide-line">
              {(site.faq as { q: string; a: string }[]).map((f) => (
                <div key={f.q} className="py-4">
                  <dt className="font-display">{f.q}</dt>
                  <dd className="mt-1.5 text-sm text-ink-soft">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <footer className="mt-12 pt-6 border-t border-line text-xs text-ink-muted">
          <p>
            {org.name} processes applicant data in line with {region.privacyRegime}.
            You can ask for your data to be deleted at any time.
          </p>
        </footer>
      </main>
    </>
  )
}
