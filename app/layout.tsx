import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Lato, Courier_Prime } from 'next/font/google'
import { BRAND, siteUrl } from '@/lib/brand'
import './globals.css'

// Self-hosted at build time by next/font, so there is no render-blocking
// request to Google on a slow connection.
const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})
const body = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-body',
  display: 'swap',
})
const mono = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRAND.platform} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.platform}`,
  },
  description: BRAND.description,
  applicationName: BRAND.platform,
  openGraph: {
    type: 'website',
    siteName: BRAND.platform,
    title: `${BRAND.platform} — ${BRAND.tagline}`,
    description: BRAND.description,
    url: siteUrl,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F8F7F4',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
