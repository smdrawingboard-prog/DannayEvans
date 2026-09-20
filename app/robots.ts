import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/brand'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The signing ceremony and the authenticated app must never be
        // indexed; a signing URL in a search index is a live credential.
        disallow: ['/sign/', '/api/', '/orgs', '/login', '/signup'],
      },
      // Named explicitly so the answer engines are opted in deliberately
      // rather than by omission.
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
