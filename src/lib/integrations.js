// ============================================================
// Third-Party CRM Integration Stubs
// HubSpot | Salesforce | Pipedrive | Bullhorn
// All integrations are opt-in, configured per deployment
// API keys stored in Supabase secrets, never in frontend
// ============================================================

// ============================================================
// Stage mapping helpers
// ============================================================

function mapStageToHubspot(stage) {
  const map = {
    'Lead Identified': 'appointmentscheduled',
    'Initial Outreach': 'appointmentscheduled',
    'Discovery Call': 'qualifiedtobuy',
    'Proposal Sent': 'presentationscheduled',
    'Negotiation': 'decisionmakerboughtin',
    'Retained Mandate Signed': 'closedwon',
    'Lost / No Decision': 'closedlost',
  }
  return map[stage] || 'appointmentscheduled'
}

function mapStageToSalesforce(stage) {
  const map = {
    'Lead Identified': 'Prospecting',
    'Initial Outreach': 'Prospecting',
    'Discovery Call': 'Qualification',
    'Proposal Sent': 'Proposal/Price Quote',
    'Negotiation': 'Negotiation/Review',
    'Retained Mandate Signed': 'Closed Won',
    'Lost / No Decision': 'Closed Lost',
  }
  return map[stage] || 'Prospecting'
}

function mapStageToPipedrive(stage) {
  // Pipedrive uses numeric stage IDs configured per pipeline
  // These are example IDs — configure to match your Pipedrive setup
  const map = {
    'Lead Identified': 1,
    'Initial Outreach': 2,
    'Discovery Call': 3,
    'Proposal Sent': 4,
    'Negotiation': 5,
    'Retained Mandate Signed': 6,
    'Lost / No Decision': 7,
  }
  return map[stage] || 1
}

function mapStageToBullhorn(stage) {
  const map = {
    'New Application': 'New',
    'CV Screening': 'Internal Interview',
    'Recruiter Interview': 'Internal Interview',
    'Longlist Submitted to Client': 'Submitted',
    'Client Interview Round 1': 'Client Interview',
    'Client Interview Round 2 / Final': 'Client Interview',
    'Reference Check': 'Reference Check',
    'Offer Extended': 'Offer Extended',
    'Placed': 'Placed',
    'Rejected / Withdrawn': 'Rejected',
  }
  return map[stage] || 'New'
}

// ============================================================
// HubSpot
// Uses @hubspot/api-client (server-side only in production)
// ============================================================

export async function syncDealToHubspot(deal) {
  const token = import.meta.env.VITE_HUBSPOT_TOKEN
  if (!token) throw new Error('HubSpot token not configured')

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        dealname: `${deal.company_name} — ${deal.role_being_filled}`,
        amount: String(deal.estimated_fee_gbp || 0),
        pipeline: 'default',
        dealstage: mapStageToHubspot(deal.stage),
        closedate: deal.expected_close_date
          ? new Date(deal.expected_close_date).getTime()
          : undefined,
        description: deal.notes || '',
      },
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`HubSpot sync failed: ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.id // hubspot_deal_id
}

export async function updateHubspotDeal(hubspotDealId, updates) {
  const token = import.meta.env.VITE_HUBSPOT_TOKEN
  if (!token || !hubspotDealId) return

  await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${hubspotDealId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        dealstage: updates.stage ? mapStageToHubspot(updates.stage) : undefined,
        amount: updates.estimated_fee_gbp ? String(updates.estimated_fee_gbp) : undefined,
      },
    }),
  })
}

// ============================================================
// Salesforce
// Uses REST API with OAuth bearer token
// ============================================================

export async function syncDealToSalesforce(deal) {
  const token = import.meta.env.VITE_SF_TOKEN
  const instanceUrl = import.meta.env.VITE_SF_URL
  const recordTypeId = import.meta.env.VITE_SF_RECORD_TYPE_RECRUITMENT
  if (!token || !instanceUrl) throw new Error('Salesforce not configured')

  const response = await fetch(`${instanceUrl}/services/data/v58.0/sobjects/Opportunity`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Name: `${deal.company_name} — ${deal.role_being_filled}`,
      Amount: deal.estimated_fee_gbp,
      StageName: mapStageToSalesforce(deal.stage),
      CloseDate: deal.expected_close_date || new Date().toISOString().split('T')[0],
      CurrencyIsoCode: 'GBP',
      RecordTypeId: recordTypeId,
      Description: deal.notes || '',
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Salesforce sync failed: ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.id // salesforce_opportunity_id
}

// ============================================================
// Pipedrive
// ============================================================

export async function syncDealToPipedrive(deal) {
  const token = import.meta.env.VITE_PIPEDRIVE_TOKEN
  if (!token) throw new Error('Pipedrive token not configured')

  const response = await fetch(`https://api.pipedrive.com/v1/deals?api_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `${deal.company_name} — ${deal.role_being_filled}`,
      value: deal.estimated_fee_gbp,
      currency: 'GBP',
      stage_id: mapStageToPipedrive(deal.stage),
      expected_close_date: deal.expected_close_date,
      note: deal.notes || '',
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Pipedrive sync failed: ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return String(data.data?.id) // pipedrive_deal_id
}

export async function updatePipedriveDeal(pipedriveDealId, updates) {
  const token = import.meta.env.VITE_PIPEDRIVE_TOKEN
  if (!token || !pipedriveDealId) return

  await fetch(`https://api.pipedrive.com/v1/deals/${pipedriveDealId}?api_token=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stage_id: updates.stage ? mapStageToPipedrive(updates.stage) : undefined,
      value: updates.estimated_fee_gbp,
    }),
  })
}

// ============================================================
// Bullhorn (specialist recruitment CRM)
// ============================================================

async function getBullhornToken() {
  const clientId = import.meta.env.VITE_BULLHORN_CLIENT_ID
  const clientSecret = import.meta.env.VITE_BULLHORN_CLIENT_SECRET
  const username = import.meta.env.VITE_BULLHORN_USERNAME
  const password = import.meta.env.VITE_BULLHORN_PASSWORD

  if (!clientId || !clientSecret) throw new Error('Bullhorn credentials not configured')

  // Step 1: Get OAuth code
  const authResp = await fetch(
    `https://auth.bullhornstaffing.com/oauth/authorize?client_id=${clientId}&response_type=code&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=Login`
  )
  const authUrl = new URL(authResp.url)
  const code = authUrl.searchParams.get('code')

  // Step 2: Exchange for access token
  const tokenResp = await fetch('https://auth.bullhornstaffing.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const tokenData = await tokenResp.json()

  // Step 3: Get REST session
  const bullhornUrl = import.meta.env.VITE_BULLHORN_URL
  const sessionResp = await fetch(
    `https://rest.bullhornstaffing.com/rest-services/login?version=*&access_token=${tokenData.access_token}`
  )
  const sessionData = await sessionResp.json()

  return sessionData.BhRestToken
}

export async function syncCandidateToBullhorn(candidate) {
  const bullhornUrl = import.meta.env.VITE_BULLHORN_URL
  if (!bullhornUrl) throw new Error('Bullhorn URL not configured')

  const token = await getBullhornToken()

  const response = await fetch(`${bullhornUrl}/entity/Candidate`, {
    method: 'PUT',
    headers: {
      BhRestToken: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      firstName: candidate.full_name?.split(' ')[0] || '',
      lastName: candidate.full_name?.split(' ').slice(1).join(' ') || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      status: mapStageToBullhorn(candidate.stage),
      source: candidate.source || 'CRM Import',
      address: { countryName: candidate.current_location || '' },
      occupation: candidate.current_title || '',
      companyName: candidate.current_company || '',
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Bullhorn sync failed: ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return String(data.changedEntityId) // bullhorn_id
}

// ============================================================
// Integration Sync Runner
// Called from Integration Settings panel
// ============================================================

export async function runSync(integrationName, settings, { deals = [], candidates = [] }) {
  const results = { synced: 0, errors: 0, errorMessages: [] }

  for (const deal of deals) {
    try {
      if (integrationName === 'HubSpot' && settings.sync_direction !== 'pull') {
        await syncDealToHubspot(deal)
        results.synced++
      }
      if (integrationName === 'Salesforce' && settings.sync_direction !== 'pull') {
        await syncDealToSalesforce(deal)
        results.synced++
      }
      if (integrationName === 'Pipedrive' && settings.sync_direction !== 'pull') {
        await syncDealToPipedrive(deal)
        results.synced++
      }
    } catch (e) {
      results.errors++
      results.errorMessages.push(e.message)
    }
  }

  for (const candidate of candidates) {
    try {
      if (integrationName === 'Bullhorn' && settings.sync_direction !== 'pull') {
        await syncCandidateToBullhorn(candidate)
        results.synced++
      }
    } catch (e) {
      results.errors++
      results.errorMessages.push(e.message)
    }
  }

  return results
}
