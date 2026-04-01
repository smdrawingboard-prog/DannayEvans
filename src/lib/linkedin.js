// ============================================================
// LinkedIn Sales Navigator Integration
// Requires Sales Navigator Enterprise/Advanced plan with API access
// Fallback: Apify actor for firms without direct API access
// ============================================================

const LINKEDIN_ACCESS_TOKEN = import.meta.env.VITE_LINKEDIN_ACCESS_TOKEN

/**
 * Fetch saved leads from LinkedIn Sales Navigator API.
 * Requires OAuth 2.0 access token with r_sales_nav_profile scope.
 */
export async function fetchSalesNavLeads() {
  if (!LINKEDIN_ACCESS_TOKEN) {
    console.warn('[LinkedIn] No access token configured. Using Apify fallback.')
    return apifyFallbackFetch()
  }

  const response = await fetch('https://api.linkedin.com/v2/salesNavigatorLeads', {
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LinkedIn API error ${response.status}: ${error}`)
  }

  return response.json()
}

/**
 * Map a Sales Navigator lead object to the CRM deal format.
 */
export function mapLeadToDeal(lead) {
  return {
    company_name: lead.company?.name || '',
    contact_name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
    contact_email: lead.emailAddress || '',
    contact_linkedin_url: lead.profileUrl || '',
    source: 'LinkedIn Sales Navigator',
    stage: 'Lead Identified',
    probability_pct: 10,
    notes: lead.notes || '',
    linkedin_lead_id: lead.id || '',
    mandate_type: 'Retained',
  }
}

/**
 * Apify fallback — uses apify/linkedin-sales-navigator-scraper actor.
 * Returns leads in the same format as the LinkedIn API response.
 */
async function apifyFallbackFetch() {
  const APIFY_TOKEN = import.meta.env.VITE_APIFY_API_TOKEN
  if (!APIFY_TOKEN) {
    throw new Error('Neither LinkedIn API token nor Apify token is configured.')
  }

  const actorId = 'apify~linkedin-sales-navigator-scraper'
  const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchUrl: 'https://www.linkedin.com/sales/search/people',
      maxResults: 50,
    }),
  })

  if (!runResponse.ok) throw new Error('Apify run failed to start')
  const { data: run } = await runResponse.json()

  // Poll for completion (simplified — production should use webhooks)
  let attempts = 0
  while (attempts < 20) {
    await new Promise(r => setTimeout(r, 3000))
    const statusResp = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs/${run.id}?token=${APIFY_TOKEN}`)
    const { data: status } = await statusResp.json()
    if (status.status === 'SUCCEEDED') break
    if (status.status === 'FAILED') throw new Error('Apify actor run failed')
    attempts++
  }

  const dataResp = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs/${run.id}/dataset/items?token=${APIFY_TOKEN}`)
  const items = await dataResp.json()

  return {
    elements: items.map(item => ({
      id: item.id,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      emailAddress: item.email || '',
      profileUrl: item.linkedInUrl || '',
      company: { name: item.companyName || '' },
      notes: item.summary || '',
    })),
  }
}

/**
 * Deduplication check: returns true if lead already exists in CRM.
 * Checks by email and LinkedIn URL.
 */
export function isLeadDuplicate(lead, existingDeals) {
  const email = lead.contact_email?.toLowerCase()
  const url = lead.contact_linkedin_url?.toLowerCase()
  return existingDeals.some(deal => {
    if (email && deal.contact_email?.toLowerCase() === email) return true
    if (url && deal.contact_linkedin_url?.toLowerCase() === url) return true
    return false
  })
}

// ============================================================
// Apify Actors for Job Listings and Candidate Sourcing
// ============================================================

/**
 * Scrape job listings from LinkedIn for a given search query.
 */
export async function scrapeLinkedInJobs(searchQuery, location = 'United Kingdom') {
  const APIFY_TOKEN = import.meta.env.VITE_APIFY_API_TOKEN
  if (!APIFY_TOKEN) throw new Error('Apify token not configured')

  const response = await fetch(`https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper/runs?token=${APIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchQuery, location, maxJobs: 25 }),
  })

  if (!response.ok) throw new Error('Failed to start Apify job listings actor')
  return response.json()
}

/**
 * Enrich a contact's email and phone from their LinkedIn profile.
 */
export async function enrichContact(linkedInUrl) {
  const APIFY_TOKEN = import.meta.env.VITE_APIFY_API_TOKEN
  if (!APIFY_TOKEN) throw new Error('Apify token not configured')

  const response = await fetch(`https://api.apify.com/v2/acts/curious_coder~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileUrls: [linkedInUrl] }),
  })

  if (!response.ok) throw new Error('Failed to start enrichment actor')
  return response.json()
}
