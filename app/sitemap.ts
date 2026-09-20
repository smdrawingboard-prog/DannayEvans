import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/brand'
import { tryAdminClient } from '@/lib/supabase/admin'

export const revalidate = 3600

/**
 * Marketing pages plus every published role across every tenant careers site.
 * Job pages are the pages that actually earn search traffic, so they belong
 * in the sitemap the moment they are published.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  try {
    const db = tryAdminClient()
    if (!db) return base
    const { data: jobs } = await db
      .from('jobs')
      .select('slug, updated_at, organisations!inner(slug), careers_sites:org_id(enabled)')
      .eq('status', 'open')
      .not('published_at', 'is', null)
      .limit(5000)

    for (const job of jobs ?? []) {
      const org = job.organisations as unknown as { slug: string }
      base.push({
        url: `${siteUrl}/careers/${org.slug}/${job.slug}`,
        lastModified: job.updated_at,
        changeFrequency: 'daily',
        priority: 0.7,
      })
    }
  } catch {
    // A sitemap that 500s is worse than a short one; fall back to the
    // marketing pages if the database is unreachable at build time.
  }

  return base
}
