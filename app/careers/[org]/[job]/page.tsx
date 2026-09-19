import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { consentCopy, formatMoney, regionOf } from '@/lib/region'
import { siteUrl } from '@/lib/brand'
import { ApplyForm } from './apply-form'

export const revalidate = 300

async function loadJob(orgSlug: string, jobSlug: string) {
  const db = createAdminClient()

  const { data: org } = await db
    .from('organisations')
    .select('id, name, slug, region, currency, logo_url, website_url, whatsapp_number')
    .eq('slug', orgSlug)
    .is('deleted_at', null)
    .maybeSingle()
  if (!org) return null

  const { data: job } = await db
    .from('jobs')
    .select('*')
    .eq('org_id', org.id)
    .eq('slug', jobSlug)
    .eq('status', 'open')
    .not('published_at', 'is', null)
    .maybeSingle()
  if (!job) return null

  return { org, job }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; job: string }>
}): Promise<Metadata> {
  const { org: orgSlug, job: jobSlug } = await params
  const data = await loadJob(orgSlug, jobSlug)
  if (!data) return { title: 'Role not found' }

  const { org, job } = data
  const place = [job.city, job.country].filter(Boolean).join(', ')

  return {
    // Falls back to the pattern that actually matches how people search:
    // "<role> jobs in <city>".
    title: job.meta_title ?? `${job.title} — ${place || 'Remote'} | ${org.name}`,
    description:
      job.meta_description ??
      (job.summary?.slice(0, 157) ??
        `${job.title} at ${org.name}${place ? ` in ${place}` : ''}. Apply now.`),
    alternates: { canonical: `${siteUrl}/careers/${orgSlug}/${jobSlug}` },
    openGraph: {
      type: 'article',
      title: `${job.title} at ${org.name}`,
      description: job.summary ?? undefined,
      url: `${siteUrl}/careers/${orgSlug}/${jobSlug}`,
      publishedTime: job.published_at ?? undefined,
    },
  }
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ org: string; job: string }>
}) {
  const { org: orgSlug, job: jobSlug } = await params
  const data = await loadJob(orgSlug, jobSlug)
  if (!data) notFound()

  const { org, job } = data
  const region = regionOf(org.region)
  const currency = job.salary_currency ?? org.currency

  /*
   * schema.org JobPosting. This is what puts the role into Google Jobs and
   * what an AI answer engine reads when someone asks who is hiring. Google
   * requires title, description, datePosted and hiringOrganization; omitting
   * validThrough means the listing is treated as stale after 30 days, so it
   * is always set.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description_md ?? job.summary ?? job.title,
    datePosted: job.published_at,
    validThrough:
      job.closes_at ??
      new Date(new Date(job.published_at ?? Date.now()).getTime() + 60 * 86_400_000).toISOString(),
    employmentType: {
      permanent: 'FULL_TIME',
      contract: 'CONTRACTOR',
      temporary: 'TEMPORARY',
      fixed_term: 'FULL_TIME',
      internship: 'INTERN',
      part_time: 'PART_TIME',
    }[job.employment_type as string] ?? 'FULL_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: org.name,
      sameAs: org.website_url ?? undefined,
      logo: org.logo_url ?? undefined,
    },
    jobLocation: job.city
      ? {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: job.city,
            addressCountry: job.country,
          },
        }
      : undefined,
    // Google requires this exact shape for a role that can be done remotely.
    jobLocationType: job.work_model === 'remote' ? 'TELECOMMUTE' : undefined,
    applicantLocationRequirements:
      job.work_model === 'remote' && job.country
        ? { '@type': 'Country', name: job.country }
        : undefined,
    baseSalary:
      job.salary_public && job.salary_min
        ? {
            '@type': 'MonetaryAmount',
            currency,
            value: {
              '@type': 'QuantitativeValue',
              minValue: Number(job.salary_min),
              maxValue: job.salary_max ? Number(job.salary_max) : undefined,
              unitText: (job.salary_period ?? 'year').toUpperCase(),
            },
          }
        : undefined,
    directApply: true,
    identifier: {
      '@type': 'PropertyValue',
      name: org.name,
      value: job.reference ?? job.id,
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <nav className="text-sm">
          <Link href={`/careers/${orgSlug}`} className="text-accent hover:underline">
            ← All roles at {org.name}
          </Link>
        </nav>

        <header className="mt-6">
          <h1 className="font-display text-3xl">{job.title}</h1>
          <p className="mt-2 text-ink-soft">
            {[job.city, job.country].filter(Boolean).join(', ') || 'Remote'}
            {' · '}{job.work_model}
            {' · '}{(job.employment_type as string).replace('_', ' ')}
            {job.salary_public && job.salary_min && (
              <>
                {' · '}
                {formatMoney(Number(job.salary_min), currency, region.locale)}
                {job.salary_max
                  ? `–${formatMoney(Number(job.salary_max), currency, region.locale)}`
                  : ''}
                {' per '}{job.salary_period ?? 'year'}
              </>
            )}
          </p>
        </header>

        {job.evp_statement && (
          <p className="mt-6 text-lg text-ink-soft border-l-2 border-accent pl-4">
            {job.evp_statement}
          </p>
        )}

        {job.description_md && (
          <section className="mt-8 whitespace-pre-line text-ink-soft">
            {job.description_md}
          </section>
        )}

        {job.requirements?.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl">What we need</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-soft list-disc pl-5">
              {(job.requirements as string[]).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </section>
        )}

        {job.benefits?.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl">What you get</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-soft list-disc pl-5">
              {(job.benefits as string[]).map((b) => <li key={b}>{b}</li>)}
            </ul>
          </section>
        )}

        <section id="apply" className="mt-12 scroll-mt-4">
          <h2 className="text-xl">Apply</h2>
          <ApplyForm
            jobId={job.id}
            orgSlug={orgSlug}
            consentText={consentCopy(region, org.name)}
            whatsappNumber={region.primaryChannel === 'whatsapp' ? org.whatsapp_number : null}
            jobTitle={job.title}
          />
        </section>
      </main>
    </>
  )
}
