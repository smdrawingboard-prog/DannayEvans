/**
 * Regional configuration. One organisation column (`region`) drives currency,
 * the privacy regime we cite in candidate-facing copy, the default outbound
 * channel, and the spelling of the UI.
 *
 * This is deliberately data rather than branching logic: adding a market is a
 * new entry here, not a hunt through components.
 */
export type RegionCode = 'ZA' | 'UK' | 'EU' | 'AE' | 'US' | 'AU' | 'GLOBAL'

export interface RegionConfig {
  code: RegionCode
  label: string
  currency: string
  currencySymbol: string
  locale: string
  timezone: string
  /** The data-protection regime named in consent copy and privacy notices. */
  privacyRegime: string
  privacyAuthority: string
  /** How long candidate data may be kept after last activity, in months. */
  defaultRetentionMonths: number
  /** Channel a sequence uses unless a step overrides it. */
  primaryChannel: 'whatsapp' | 'email'
  /** en-ZA and en-GB both take -ise endings; en-US does not. */
  spelling: 'british' | 'american'
  /** Statute that gives an electronic signature legal effect. */
  eSignatureLaw: string
  paymentGateways: string[]
}

export const REGIONS: Record<RegionCode, RegionConfig> = {
  ZA: {
    code: 'ZA',
    label: 'South Africa',
    currency: 'ZAR',
    currencySymbol: 'R',
    locale: 'en-ZA',
    timezone: 'Africa/Johannesburg',
    privacyRegime: 'POPIA',
    privacyAuthority: 'Information Regulator (South Africa)',
    defaultRetentionMonths: 24,
    primaryChannel: 'whatsapp',
    spelling: 'british',
    eSignatureLaw: 'ECTA 2002, section 13',
    paymentGateways: ['PayFast', 'Peach Payments', 'Ozow', 'Yoco'],
  },
  UK: {
    code: 'UK',
    label: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    locale: 'en-GB',
    timezone: 'Europe/London',
    privacyRegime: 'UK GDPR',
    privacyAuthority: "Information Commissioner's Office",
    defaultRetentionMonths: 24,
    primaryChannel: 'email',
    spelling: 'british',
    eSignatureLaw: 'Electronic Communications Act 2000',
    paymentGateways: ['Stripe', 'GoCardless'],
  },
  EU: {
    code: 'EU',
    label: 'European Union',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'en-IE',
    timezone: 'Europe/Brussels',
    privacyRegime: 'GDPR',
    privacyAuthority: 'the lead supervisory authority',
    defaultRetentionMonths: 24,
    primaryChannel: 'email',
    spelling: 'british',
    eSignatureLaw: 'eIDAS Regulation (EU) 910/2014',
    paymentGateways: ['Stripe', 'Mollie'],
  },
  AE: {
    code: 'AE',
    label: 'United Arab Emirates',
    currency: 'AED',
    currencySymbol: 'AED',
    locale: 'en-AE',
    timezone: 'Asia/Dubai',
    privacyRegime: 'UAE PDPL',
    privacyAuthority: 'UAE Data Office',
    defaultRetentionMonths: 24,
    primaryChannel: 'whatsapp',
    spelling: 'british',
    eSignatureLaw: 'Federal Decree-Law No. 46 of 2021',
    paymentGateways: ['Stripe', 'Telr'],
  },
  US: {
    code: 'US',
    label: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    locale: 'en-US',
    timezone: 'America/New_York',
    privacyRegime: 'state privacy law (CCPA and equivalents)',
    privacyAuthority: 'the relevant state attorney general',
    defaultRetentionMonths: 36,
    primaryChannel: 'email',
    spelling: 'american',
    eSignatureLaw: 'ESIGN Act and UETA',
    paymentGateways: ['Stripe'],
  },
  AU: {
    code: 'AU',
    label: 'Australia',
    currency: 'AUD',
    currencySymbol: 'A$',
    locale: 'en-AU',
    timezone: 'Australia/Sydney',
    privacyRegime: 'Privacy Act 1988',
    privacyAuthority: 'OAIC',
    defaultRetentionMonths: 24,
    primaryChannel: 'email',
    spelling: 'british',
    eSignatureLaw: 'Electronic Transactions Act 1999',
    paymentGateways: ['Stripe'],
  },
  GLOBAL: {
    code: 'GLOBAL',
    label: 'Global',
    currency: 'USD',
    currencySymbol: '$',
    locale: 'en',
    timezone: 'UTC',
    privacyRegime: 'applicable data protection law',
    privacyAuthority: 'the relevant supervisory authority',
    defaultRetentionMonths: 24,
    primaryChannel: 'email',
    spelling: 'british',
    eSignatureLaw: 'applicable electronic signature law',
    paymentGateways: ['Stripe'],
  },
}

export function regionOf(code: string | null | undefined): RegionConfig {
  return REGIONS[(code as RegionCode) ?? 'ZA'] ?? REGIONS.GLOBAL
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string,
  locale = 'en-ZA',
): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Consent wording shown on any form that captures candidate personal data. */
export function consentCopy(region: RegionConfig, orgName: string): string {
  return (
    `I agree that ${orgName} may store and process my personal information for ` +
    `recruitment purposes in line with ${region.privacyRegime}. I understand I can ` +
    `withdraw consent or ask for my data to be deleted at any time, and that my ` +
    `data is kept for no longer than ${region.defaultRetentionMonths} months after ` +
    `our last contact.`
  )
}
