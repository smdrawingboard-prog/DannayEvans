/** Page content for the static showcase. Run: node showcase/pages.mjs [outdir] */
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { layout, appPage, stat, table, panel, e, BRAND, SITE, OUT } from './build.mjs'

const PRICES = [
  {
    code: 'starter', name: 'Starter',
    tagline: 'For a small team that hires a few times a year.',
    zar: 499, gbp: 29, envelopes: 25, seats: 3, overageZar: 25, overageGbp: 1.4,
    features: [
      '25 signature envelopes a month', '3 users',
      'Careers site with job structured data', 'Applicant tracking and pipelines',
      'Full audit trail and completion certificates', 'Email support',
    ],
  },
  {
    code: 'growth', name: 'Growth',
    tagline: 'For a business hiring every month, across more than one role.',
    zar: 1799, gbp: 99, envelopes: 150, seats: 10, overageZar: 14, overageGbp: 0.8,
    features: [
      '150 signature envelopes a month', '10 users', 'Everything in Starter',
      'WhatsApp and email sequences', 'Weighted scorecards and shortlist reports',
      'Automations and weekly digests', 'Priority support',
    ],
  },
  {
    code: 'enterprise', name: 'Enterprise',
    tagline: 'High volume, bulk rates, and terms negotiated with you.',
    zar: 5999, gbp: 349, envelopes: 750, seats: 25, bands: true,
    features: [
      '750 signature envelopes a month, then bulk rates', '25 users',
      'Everything in Growth', 'Bulk volume pricing on every extra envelope',
      'Custom signing workflows and templates', 'SSO and named account manager',
      'Annual contract and invoicing',
    ],
  },
]

const BANDS = [
  ['1 – 1 750', 'R8.50', '£0.48'],
  ['1 751 – 9 250', 'R5.50', '£0.31'],
  ['9 251 and above', 'R3.50', '£0.20'],
]

// ---------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------
const home = layout({
  path: 'index.html',
  title: `${BRAND.platform} — ${BRAND.tagline}`,
  description:
    'Applicant tracking with an e-signature engine built in. Send an offer, get it signed, and keep the audit trail — without leaving the page. POPIA and UK GDPR handled at the database.',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: BRAND.platform,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: BRAND.tagline,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'ZAR',
      lowPrice: 499,
      highPrice: 5999,
      offerCount: 3,
    },
  },
  body: `
<div class="wrap hero">
  <h1>Hiring software with signatures built in.</h1>
  <p class="lede">Track candidates, send the offer, and get the contract signed in the
  same place. The compliance obligations that come with holding people's data are
  enforced by the database, not left to whoever is in a hurry.</p>
  <div class="cta">
    <a class="btn primary" href="demo/index.html">See every screen</a>
    <a class="btn" href="pricing.html">Pricing</a>
  </div>
</div>

<div class="wrap" style="margin-top:44px">
  <div class="grid g3">
    ${panel('Two products, one system', `
      <p class="soft"><strong>Sealed</strong> is the document and signature engine —
      envelopes, recipients, fields, an append-only audit trail and completion
      certificates. It knows nothing about recruitment, which is what keeps it a
      separable product.</p>
      <p class="soft" style="margin-bottom:0"><strong>Hireframe</strong> is the
      recruitment vertical built on it, and the first way to sell it.</p>`)}
    ${panel('The rules are in the database', `
      <p class="soft">A hidden button is not a control. Every obligation that
      matters is a constraint or a trigger, so the same rule holds whether the
      request comes from the interface or straight through the API.</p>
      <p class="soft" style="margin-bottom:0">197 assertions run against a scratch
      database before any release.</p>`)}
    ${panel('Built for two markets', `
      <p class="soft">South Africa and the United Kingdom, configurable per
      workspace: currency, spelling, privacy regime, e-signature law and the
      channel people actually reply on.</p>
      <p class="soft" style="margin-bottom:0">POPIA and UK GDPR are not the same
      rule, and the platform does not pretend they are.</p>`)}
  </div>
</div>

<div class="wrap" style="margin-top:36px">
  <h2>What it actually stops happening</h2>
  <div class="grid g2" style="margin-top:14px">
    ${panel('Two agencies, one candidate, one fee', `
      <p class="soft" style="margin-bottom:0">A second live right to represent the
      same candidate to the same employer is refused by a unique index. Not a
      warning someone clicks past — the row does not go in.</p>`)}
    ${panel('A criminal check with no lawful basis', `
      <p class="soft" style="margin-bottom:0">POPIA section 26 prohibits processing
      it. Consent alone does not lift that. The upload is refused until the
      section 27 justification is recorded, and the file never reaches storage.</p>`)}
    ${panel('Banking details taken too early', `
      <p class="soft" style="margin-bottom:0">Post-offer documents cannot be attached
      to a candidate nobody has offered anything to. You need someone's account
      number to pay them, not to consider them.</p>`)}
    ${panel('A shortlist score somebody typed', `
      <p class="soft" style="margin-bottom:0">The weighted total is derived from the
      scores on every write. A scorecard whose weights do not sum to 100 cannot be
      scored against at all.</p>`)}
  </div>
</div>

<div class="wrap" style="margin-top:36px">
  ${panel('Where this preview ends', `
    <p class="soft">GitHub Pages serves static files. The application uses server
    components, server actions, a service-role database key and a signature
    webhook, so it needs somewhere that runs Node — this preview cannot be the
    running product, and pretending otherwise would waste your time.</p>
    <p class="soft" style="margin-bottom:0">What you can do here is walk every
    screen with sample data.
    <a href="demo/index.html">Start with the overview</a>.</p>`)}
</div>`,
})

const pricing = layout({
  path: 'pricing.html',
  title: `Pricing — ${BRAND.platform}`,
  description:
    'Base fee, an included allowance of signature envelopes, and a per-envelope rate after that. Priced in ZAR and GBP. Enterprise moves to bulk volume bands.',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: BRAND.platform,
    description: BRAND.tagline,
    offers: PRICES.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      price: p.zar,
      priceCurrency: 'ZAR',
      description: p.tagline,
    })),
  },
  body: `
<div class="wrap" style="padding-top:40px">
  <h1>Pricing</h1>
  <p class="lede narrow">A base fee, an allowance of signature envelopes included in
  it, and a per-envelope rate once that runs out. The billable unit is an envelope
  sent, counted by the database at the moment it is sent — so the invoice and the
  audit trail cannot disagree.</p>

  <div class="grid g3" style="margin-top:28px">
    ${PRICES.map(
      (p) => `
    <section class="panel">
      <div class="body">
        <h3>${e(p.name)}</h3>
        <p class="small muted">${e(p.tagline)}</p>
        <div class="price"><span class="amt">R${p.zar.toLocaleString('en-ZA')}</span><span class="muted small">/month</span></div>
        <p class="small muted" style="margin:0">£${p.gbp} in the United Kingdom</p>
        <p class="small soft" style="margin-top:10px;margin-bottom:0">
          ${p.envelopes} envelopes and ${p.seats} users included.<br>
          ${p.bands
            ? 'Extra envelopes at bulk band rates.'
            : `Then R${p.overageZar} / £${p.overageGbp} an envelope.`}
        </p>
        <ul class="feat">${p.features.map((f) => `<li>${e(f)}</li>`).join('')}</ul>
      </div>
    </section>`,
    ).join('')}
  </div>

  <div style="margin-top:28px">
    ${panel(
      'Enterprise volume bands',
      `<p class="soft small">Graduated, not a cliff: each band prices only the
      envelopes that fall inside it, so crossing a threshold never makes the next
      envelope cost more than the last.</p>
      ${table(['Chargeable envelopes in a month', 'ZAR each', 'GBP each'], BANDS.map((b) => [
        e(b[0]),
        `<span class="num">${e(b[1])}</span>`,
        `<span class="num">${e(b[2])}</span>`,
      ]))}
      <p class="small muted" style="margin:12px 0 0">Every band boundary — the first
      unit, the last unit, and the unit either side of each threshold — is asserted
      in the test suite, because band arithmetic is exactly the kind of code that is
      quietly wrong.</p>`,
    )}
  </div>

  <div style="margin-top:20px" class="note">
    <p><strong>Fourteen-day trial on every plan.</strong> No envelope is metered twice:
    the meter is a database trigger keyed on the envelope, so a retried request
    cannot bill you again.</p>
  </div>
</div>`,
})

const compliance = layout({
  path: 'compliance.html',
  title: `Compliance — ${BRAND.platform}`,
  description:
    'How POPIA and UK GDPR obligations are enforced: consent before reference calls, the s69 direct marketing rule, retention for unsuccessful candidates, and an append-only audit trail.',
  body: `
<div class="wrap narrow" style="padding-top:40px">
  <h1>Compliance</h1>
  <p class="lede">Recruitment software holds some of the most sensitive data a small
  business will ever touch. These are the obligations the platform enforces rather
  than documents.</p>

  <div class="stack" style="margin-top:24px">
    ${panel('POPIA section 69 — direct marketing', `
      <p class="soft">This is the one most often got wrong, because the UK rule is
      different and better known. Under POPIA, electronic direct marketing needs
      the recipient's consent, or an existing customer relationship for similar
      services. Where neither holds, you may approach them <strong>once</strong> to
      ask for consent, and not at all if they have already refused.</p>
      <p class="soft" style="margin-bottom:0">A juristic person is a data subject
      under POPIA, so "it is business to business" does not carry the exemption
      across the way it does under UK GDPR. The platform counts the single
      permitted approach per address and refuses the second.</p>`)}

    ${panel('Section 26 and 27 — special personal information', `
      <p class="soft" style="margin-bottom:0">Criminal record checks and medical
      disclosures are prohibited processing unless section 27 supplies a
      justification. Consent on its own does not lift it. The platform will not
      store a criminal check until the justification being relied on is written
      down.</p>`)}

    ${panel('Retention', `
      <p class="soft" style="margin-bottom:0">Rejecting a candidate's last live
      application starts a retention clock the agency sets, defaulting to twelve
      months. A rejection while they are still in play elsewhere does not — one
      "no" is not the end of the relationship.</p>`)}

    ${panel('Reference checks', `
      <p class="soft" style="margin-bottom:0">A reference call tells someone's
      employer they are job-hunting. A referee can be captured at any point, but
      recording a completed call for a candidate who has not consented is
      refused.</p>`)}

    ${panel('The audit trail', `
      <p class="soft" style="margin-bottom:0">Every view, signature and decline is
      an append-only event. UPDATE and DELETE are revoked on the table and a trigger
      rejects them, so the history cannot be tidied up after the fact — which is the
      only thing that makes it worth anything in a dispute.</p>`)}

    ${panel('Tenant isolation', `
      <p class="soft" style="margin-bottom:0">Row level security on all fifty
      tables, with no exceptions. Every function that takes an organisation or
      record id and runs with elevated rights checks membership first — a lesson
      learned the hard way twice in this codebase, and now asserted in tests.</p>`)}
  </div>

  <p class="small muted" style="margin-top:24px">This page describes how the software
  behaves. It is not legal advice, and the agreement templates that ship with the
  platform are marked as needing review by a practitioner before they are used.</p>
</div>`,
})

export { home, pricing, compliance, PRICES, BANDS }
