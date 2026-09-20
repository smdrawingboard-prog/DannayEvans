/**
 * Product naming lives in one place so it can be renamed without a sweep.
 *
 *   Sealed    — the document and signature engine. The actual product.
 *   Hireframe — the recruitment vertical built on top of it, and the first
 *               go-to-market surface.
 */
export const BRAND = {
  platform: 'Hireframe',
  engine: 'Sealed',
  vendor: 'Fate Collab',
  tagline: 'Hiring software for small teams, with signatures built in.',
  description:
    'Track candidates, send offers and get contracts signed without leaving the page. Built for small and medium businesses.',
  domain: 'hireframe.app',
  supportEmail: 'hello@fatecollab.co.za',
} as const

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? `https://${BRAND.domain}`
