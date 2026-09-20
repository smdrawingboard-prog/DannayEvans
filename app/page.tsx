import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND, siteUrl } from '@/lib/brand'

/*
 * Marketing home. Statically rendered, no client JavaScript, so it loads on a
 * weak mobile connection and scores well on the Core Web Vitals that feed
 * ranking. SEO here is structural, not a meta-tag afterthought:
 *   - one H1 carrying the primary keyword
 *   - FAQ content in plain prose, which is what AI answer engines quote
 *   - SoftwareApplication and FAQPage structured data
 */

const PRIMARY_KEYWORD = 'recruitment software for small business'

export const metadata: Metadata = {
  title: `Recruitment software for small businesses | ${BRAND.platform}`,
  description:
    'Applicant tracking, offer letters and legally binding e-signatures in one place. Built for teams of 2 to 200. POPIA and GDPR ready. Free 14-day trial.',
  alternates: { canonical: siteUrl },
  keywords: [
    PRIMARY_KEYWORD,
    'applicant tracking system South Africa',
    'ATS with e-signature',
    'hiring software SMB',
    'offer letter signing software',
  ],
}

const FAQ = [
  {
    q: 'What is the best recruitment software for a small business?',
    a: `The right system for a small team is one that covers the whole hire — advertising the role, tracking applicants, and getting the offer and contract signed — without needing a separate signing tool or an administrator to run it. ${BRAND.platform} does all three in one place and takes about twenty minutes to set up.`,
  },
  {
    q: 'Can I send an offer letter for signature from the same system that tracks candidates?',
    a: `Yes. ${BRAND.platform} is built on the ${BRAND.engine} signature engine, so moving a candidate to the Offer stage generates the offer pack, sends it for signature, and records a full audit trail against the candidate's record. Nothing is re-keyed and nothing is emailed as an attachment.`,
  },
  {
    q: 'Are electronic signatures legally binding in South Africa and the UK?',
    a: 'Yes. In South Africa, section 13 of the Electronic Communications and Transactions Act 2002 gives an electronic signature legal effect for an employment contract. In the UK, the Electronic Communications Act 2000 does the same, and in the EU it is the eIDAS Regulation. What matters in a dispute is the evidence: who signed, when, from which IP address, and how their identity was established. Every envelope carries that record and a completion certificate.',
  },
  {
    q: 'Is it POPIA compliant?',
    a: 'Candidate records carry a recorded lawful basis, a consent timestamp, a retention date and a working erasure path. Cross-border transfers record the safeguard relied on. Consent wording on every candidate-facing form is generated from the region set on your account, so a South African account cites POPIA and a UK account cites UK GDPR.',
  },
  {
    q: 'How much does it cost?',
    a: 'Pricing is per hiring seat with unlimited candidates and unlimited signature envelopes. There is a 14-day trial and no card is required to start. Accounts set to South Africa are billed in rand.',
  },
]

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: BRAND.platform,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Applicant Tracking System',
        operatingSystem: 'Web',
        description: metadata.description,
        url: siteUrl,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'ZAR',
          description: '14-day free trial',
        },
        featureList: [
          'Applicant tracking',
          'Electronic signatures',
          'Offer letter automation',
          'Careers site with job structured data',
          'WhatsApp and email candidate messaging',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b border-line bg-bg-panel">
        <nav className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-display text-lg">{BRAND.platform}</span>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn">Sign in</Link>
            <Link href="/signup" className="btn btn-primary">Start free</Link>
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4">
        <section className="py-16 md:py-24 max-w-2xl">
          <h1 className="font-display text-3xl md:text-5xl leading-tight">
            Recruitment software for small businesses — with signatures built in
          </h1>
          <p className="mt-5 text-lg text-ink-soft">
            Advertise the role, track the applicants, and get the offer signed.
            One system, one record, no attachments going back and forth.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">
              Start a 14-day trial
            </Link>
            <Link href="#how" className="btn">See how it works</Link>
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            No card required · POPIA and GDPR ready · Set up in about 20 minutes
          </p>
        </section>

        <section id="how" className="py-12 border-t border-line">
          <h2 className="text-2xl">One hire, start to signed</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                h: 'Publish the role',
                p: 'Your careers page is generated from the job record, with JobPosting structured data so Google Jobs and AI search can read it. Rewrite a thin spec into a real advert in one click.',
              },
              {
                h: 'Run the pipeline',
                p: 'Configurable stages, weighted scorecards, and a nudge when a candidate has been sitting too long. Message candidates over WhatsApp or email from the record.',
              },
              {
                h: 'Get it signed',
                p: `Move a candidate to Offer and the pack is generated, sent and tracked. ${BRAND.engine} records who signed, when, and from where, and issues a completion certificate.`,
              },
            ].map((c) => (
              <article key={c.h} className="panel p-5">
                <h3 className="text-base">{c.h}</h3>
                <p className="mt-2 text-sm text-ink-soft">{c.p}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-12 border-t border-line">
          <h2 className="text-2xl">Questions people actually ask</h2>
          <dl className="mt-6 divide-y divide-line">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-display text-base">{f.q}</dt>
                <dd className="mt-2 text-sm text-ink-soft max-w-3xl">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-line mt-8">
        <div className="max-w-5xl mx-auto px-4 py-8 text-xs text-ink-muted flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <span>
            {BRAND.platform} — a {BRAND.vendor} product, built on {BRAND.engine}.
          </span>
          <span className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href={`mailto:${BRAND.supportEmail}`}>Contact</a>
          </span>
        </div>
      </footer>
    </>
  )
}
