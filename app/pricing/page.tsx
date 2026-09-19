import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND, siteUrl } from '@/lib/brand'
import { REGIONS, formatMoney, type RegionCode } from '@/lib/region'
import { getPlans } from '@/lib/billing'

export const revalidate = 3600

// Currency is chosen by query string rather than IP, so the page stays
// cacheable and a South African reading it from London still sees rand.
const CURRENCIES = [
  { code: 'ZAR', label: 'South Africa (R)', region: 'ZA' as RegionCode },
  { code: 'GBP', label: 'United Kingdom (£)', region: 'UK' as RegionCode },
  { code: 'EUR', label: 'Europe (€)', region: 'EU' as RegionCode },
  { code: 'USD', label: 'Rest of world ($)', region: 'US' as RegionCode },
]

const FAQ = [
  {
    q: 'What counts as one use?',
    a: 'One envelope sent. An envelope is a pack of documents going out for signature, and it costs the same whether it has one signer or five, one page or forty. An offer letter that needs the candidate and the hiring manager to sign is one charge, not two.',
  },
  {
    q: 'When am I charged — on sending or on signing?',
    a: 'On sending. That is the point at which the work happens: the documents are stored, the links are minted, the audit trail opens and delivery is attempted. A document that is never signed still cost us to send, and pricing on completion would mean a customer with a low signing rate is subsidised by one with a high rate.',
  },
  {
    q: 'What happens if I go over my included envelopes?',
    a: 'Nothing stops. You carry on sending and the extra envelopes are charged at your plan’s overage rate, shown on your usage screen in real time. If you are consistently over, moving up a tier will be cheaper — the app tells you when that is the case. You can also set a hard cap if you would rather be stopped than billed.',
  },
  {
    q: 'How does bulk pricing work on Enterprise?',
    a: 'Graduated bands. Once the included 750 envelopes are used, the next 1,750 are at the entry rate, the next 7,500 are cheaper again, and everything beyond that is at the lowest rate. Crossing a threshold only reprices the new envelopes, never the ones already used, so your bill can never jump backwards.',
  },
  {
    q: 'Do you charge per user as well?',
    a: 'Each plan includes a number of users, and extra users are a small monthly amount on top. Most small businesses never pay for an extra seat.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Fourteen days, no card. You get the Starter allowance during the trial, which is enough to run a full hire end to end and see a contract signed.',
  },
]

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>
}): Promise<Metadata> {
  const { currency = 'ZAR' } = await searchParams
  return {
    title: `Pricing — pay per signature envelope | ${BRAND.platform}`,
    description:
      'Simple per-use pricing for e-signatures and hiring. A monthly base fee, envelopes included, and a clear rate above it. Bulk rates for high volume. Free 14-day trial.',
    alternates: {
      canonical: `${siteUrl}/pricing`,
      languages: Object.fromEntries(
        CURRENCIES.map((c) => [c.code, `${siteUrl}/pricing?currency=${c.code}`]),
      ),
    },
    keywords: [
      'e-signature pricing',
      'pay per signature',
      'recruitment software pricing South Africa',
      'digital signature cost ZAR',
      'bulk e-signature pricing',
    ],
    other: { 'x-currency': currency },
  }
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>
}) {
  const { currency: requested } = await searchParams
  const currency =
    CURRENCIES.find((c) => c.code === requested)?.code ?? 'ZAR'
  const region = REGIONS[CURRENCIES.find((c) => c.code === currency)!.region]
  const plans = await getPlans(currency)

  const money = (n: number) => formatMoney(n, currency, region.locale)
  // Per-envelope rates are small, so they need decimals where a base fee
  // does not. Rounding R8.50 to R9 would misstate the price.
  const unit = (n: number) =>
    new Intl.NumberFormat(region.locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: `${BRAND.platform} — ${BRAND.engine} signature platform`,
        description:
          'Recruitment software with legally binding electronic signatures, priced per envelope sent.',
        brand: { '@type': 'Brand', name: BRAND.vendor },
        offers: plans
          .filter((p) => p.price)
          .map((p) => ({
            '@type': 'Offer',
            name: p.name,
            price: p.price!.baseMonthly,
            priceCurrency: currency,
            url: `${siteUrl}/pricing?currency=${currency}`,
            availability: 'https://schema.org/InStock',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: p.price!.baseMonthly,
              priceCurrency: currency,
              billingIncrement: 1,
              unitText: 'MONTH',
            },
          })),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="border-b border-line bg-bg-panel">
        <nav className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-display text-lg">{BRAND.platform}</Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn">Sign in</Link>
            <Link href="/signup" className="btn btn-primary">Start free</Link>
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="font-display text-3xl md:text-4xl max-w-2xl">
          Pay for the documents you send, not the seats you might fill
        </h1>
        <p className="mt-4 text-lg text-ink-soft max-w-2xl">
          A monthly fee with envelopes included, then a clear per-envelope rate
          above it. One envelope is one charge, however many people sign it.
        </p>

        <nav aria-label="Currency" className="mt-6 flex flex-wrap gap-1">
          {CURRENCIES.map((c) => (
            <Link
              key={c.code}
              href={`/pricing?currency=${c.code}`}
              aria-current={c.code === currency ? 'page' : undefined}
              className={`pill ${
                c.code === currency
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-line text-ink-soft hover:bg-bg-secondary'
              }`}
            >
              {c.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 grid gap-4 lg:grid-cols-3 items-start">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={`panel p-6 ${plan.code === 'growth' ? 'border-accent' : ''}`}
            >
              {plan.code === 'growth' && (
                <span className="pill border-accent bg-accent-light text-accent mb-3">
                  Most businesses start here
                </span>
              )}

              <h2 className="font-display text-xl">{plan.name}</h2>
              <p className="mt-1 text-sm text-ink-soft min-h-[2.75rem]">{plan.tagline}</p>

              {plan.price ? (
                <>
                  <p className="mt-4">
                    <span className="font-display text-3xl">{money(plan.price.baseMonthly)}</span>
                    <span className="text-sm text-ink-soft"> / month</span>
                  </p>
                  {plan.price.baseAnnual && (
                    <p className="text-xs text-ink-muted">
                      or {money(plan.price.baseAnnual)} a year — two months free
                    </p>
                  )}

                  <dl className="mt-5 pt-4 border-t border-line space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-soft">Envelopes included</dt>
                      <dd>{plan.includedEnvelopes.toLocaleString()} / month</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-soft">Users included</dt>
                      <dd>{plan.includedSeats}</dd>
                    </div>
                    {plan.price.extraSeatMonthly > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-soft">Extra user</dt>
                        <dd>{money(plan.price.extraSeatMonthly)} / month</dd>
                      </div>
                    )}
                    {!plan.usesVolumeBands && plan.price.overagePerEnvelope !== null && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-soft">Each extra envelope</dt>
                        <dd>{unit(plan.price.overagePerEnvelope)}</dd>
                      </div>
                    )}
                  </dl>

                  {plan.usesVolumeBands && plan.bands.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-line">
                      <p className="text-xs uppercase tracking-wider text-ink-soft">
                        Bulk rate above the included 750
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                        {plan.bands.map((b) => (
                          <li key={b.fromQty} className="font-mono text-xs">
                            {b.fromQty.toLocaleString()}
                            {b.toQty === null ? ' and above' : `–${b.toQty.toLocaleString()}`}
                            {' — '}{unit(b.unitPrice)} each
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-ink-muted">
                        Graduated: crossing a band only reprices the new
                        envelopes, never the ones already sent.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-ink-soft">
                  Not published in this currency — talk to us.
                </p>
              )}

              <ul className="mt-5 pt-4 border-t border-line space-y-1.5 text-sm text-ink-soft">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-state-success">·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.segment === 'enterprise' ? `mailto:${BRAND.supportEmail}?subject=Enterprise%20pricing` : '/signup'}
                className={`btn w-full mt-6 ${plan.code === 'growth' ? 'btn-primary' : ''}`}
              >
                {plan.segment === 'enterprise' ? 'Talk to us' : 'Start free'}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-6 text-sm text-ink-muted">
          Prices exclude {currency === 'ZAR' ? 'VAT' : 'local sales tax'}. Set in
          each market rather than converted, so what you see is what that market
          pays.
        </p>

        <section className="mt-16 border-t border-line pt-10">
          <h2 className="text-2xl">Pricing questions</h2>
          <dl className="mt-6 divide-y divide-line max-w-3xl">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-display text-base">{f.q}</dt>
                <dd className="mt-2 text-sm text-ink-soft">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-line mt-8">
        <div className="max-w-5xl mx-auto px-4 py-8 text-xs text-ink-muted">
          {BRAND.platform} — a {BRAND.vendor} product, built on {BRAND.engine}.
        </div>
      </footer>
    </>
  )
}
