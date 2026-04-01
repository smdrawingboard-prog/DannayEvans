// ============================================================
// Notification Hooks
// Channels: Email (SendGrid) | WhatsApp (Meta Cloud API)
// All notifications are logged to the notifications table
// ============================================================

const SENDGRID_KEY = import.meta.env.VITE_SENDGRID_API_KEY
const WA_TOKEN = import.meta.env.VITE_WHATSAPP_API_TOKEN
const WA_PHONE_NUMBER_ID = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID

const FROM_EMAIL = 'crm@firm.co.uk'
const FROM_NAME = 'Recruitment CRM'

// ============================================================
// Email via SendGrid
// ============================================================

export async function sendEmail({ to, subject, body }) {
  if (!SENDGRID_KEY) {
    console.warn('[Email] SendGrid not configured. Would have sent:', { to, subject })
    return { success: false, reason: 'not_configured' }
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[Email] SendGrid error:', error)
    return { success: false, reason: error }
  }

  return { success: true }
}

// ============================================================
// WhatsApp via Meta Cloud API
// ============================================================

export async function sendWhatsApp({ to, message }) {
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
    console.warn('[WhatsApp] Not configured. Would have sent:', { to, message })
    return { success: false, reason: 'not_configured' }
  }

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${WA_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    console.error('[WhatsApp] Error:', error)
    return { success: false, reason: JSON.stringify(error) }
  }

  return { success: true }
}

// ============================================================
// Notification Events
// ============================================================

/**
 * Candidate reaches Offer Extended stage.
 * Notifies: Admin + Recruiter
 */
export async function notifyOfferExtended({ candidateName, role, company, adminEmail, recruiterEmail }) {
  const subject = `Offer Extended — ${candidateName}`
  const body = `Offer extended to ${candidateName} for ${role} at ${company}.`

  await Promise.allSettled([
    sendEmail({ to: adminEmail, subject, body }),
    sendEmail({ to: recruiterEmail, subject, body }),
  ])
}

/**
 * Deal moves to Retained Mandate Signed.
 * Notifies: Admin + Sales Rep
 */
export async function notifyMandateSigned({ company, feeGbp, repName, adminEmail, repEmail }) {
  const subject = `Mandate Signed — ${company}`
  const body = `Mandate signed: ${company} — GBP ${feeGbp.toLocaleString('en-GB')} — ${repName}.`

  await Promise.allSettled([
    sendEmail({ to: adminEmail, subject, body }),
    sendEmail({ to: repEmail, subject, body }),
  ])
}

/**
 * Deal marked Won.
 * Notifies: Admin
 */
export async function notifyDealWon({ company, feeGbp, adminEmail }) {
  await sendEmail({
    to: adminEmail,
    subject: `Deal Closed — ${company}`,
    body: `Deal closed: ${company} GBP ${feeGbp.toLocaleString('en-GB')}.`,
  })
}

/**
 * Candidate stuck > 14 days in a stage.
 * Notifies: Recruiter
 */
export async function notifyCandidateStuck({ candidateName, stage, daysInStage, recruiterEmail }) {
  await sendEmail({
    to: recruiterEmail,
    subject: `Action Required — ${candidateName} stalled in pipeline`,
    body: `${candidateName} has been in "${stage}" for ${daysInStage} days. Please review and take next action.`,
  })
}

/**
 * Weekly report generated.
 * Notifies: Admin
 */
export async function notifyWeeklyReport({ placements, revenueGbp, adminEmail }) {
  await sendEmail({
    to: adminEmail,
    subject: 'Weekly Report Ready',
    body: `Weekly report ready — ${placements} placement${placements !== 1 ? 's' : ''}, GBP ${revenueGbp.toLocaleString('en-GB')} revenue.`,
  })
}

/**
 * Document uploaded.
 * Notifies: Record owner (candidate recruiter or deal rep)
 */
export async function notifyDocumentUploaded({ filename, entityLabel, ownerEmail }) {
  await sendEmail({
    to: ownerEmail,
    subject: `Document Uploaded — ${entityLabel}`,
    body: `A document has been uploaded to ${entityLabel}: ${filename}.`,
  })
}

/**
 * LinkedIn leads imported.
 * Notifies: Sales Rep
 */
export async function notifyLinkedInImport({ count, repEmail }) {
  await sendEmail({
    to: repEmail,
    subject: 'LinkedIn Leads Imported',
    body: `${count} lead${count !== 1 ? 's' : ''} imported from LinkedIn Sales Navigator. Please review in the Deal Pipeline.`,
  })
}

// ============================================================
// Stale Candidate Check (run on schedule)
// ============================================================

/**
 * Check for candidates who have been in the same stage for > 14 days.
 * Call from a scheduled function or the dashboard's background worker.
 */
export async function checkStaleCandidates(candidates, staff) {
  const ALERT_DAYS = 14
  const now = new Date()
  const stale = candidates.filter(c => {
    if (c.stage === 'Placed' || c.stage === 'Rejected / Withdrawn') return false
    const entered = new Date(c.stage_entered_at)
    const days = Math.floor((now - entered) / (1000 * 60 * 60 * 24))
    return days >= ALERT_DAYS
  })

  for (const candidate of stale) {
    const recruiter = staff.find(s => s.id === candidate.recruiter_id)
    if (recruiter) {
      const days = Math.floor((now - new Date(candidate.stage_entered_at)) / (1000 * 60 * 60 * 24))
      await notifyCandidateStuck({
        candidateName: candidate.full_name,
        stage: candidate.stage,
        daysInStage: days,
        recruiterEmail: recruiter.email,
      })
    }
  }

  return stale.length
}
