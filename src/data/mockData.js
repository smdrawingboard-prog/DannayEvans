// ============================================================
// Mock data for development / demo
// London-based executive recruitment firm, GBP currency
// ============================================================

export const mockStaff = [
  { id: 's1', full_name: 'Eleanor Hartley', email: 'e.hartley@firm.co.uk', role: 'admin', active: true },
  { id: 's2', full_name: 'James Pemberton', email: 'j.pemberton@firm.co.uk', role: 'recruiter', active: true },
  { id: 's3', full_name: 'Amara Osei', email: 'a.osei@firm.co.uk', role: 'recruiter', active: true },
  { id: 's4', full_name: 'Charlotte Winters', email: 'c.winters@firm.co.uk', role: 'recruiter', active: true },
  { id: 's5', full_name: 'Marcus Webb', email: 'm.webb@firm.co.uk', role: 'recruiter', active: true },
  { id: 's6', full_name: 'Sophia Radcliffe', email: 's.radcliffe@firm.co.uk', role: 'recruiter', active: true },
  { id: 's7', full_name: 'Oliver Crane', email: 'o.crane@firm.co.uk', role: 'sales_rep', active: true },
  { id: 's8', full_name: 'Natalie Forsythe', email: 'n.forsythe@firm.co.uk', role: 'sales_rep', active: true },
  { id: 's9', full_name: 'Daniel Ashworth', email: 'd.ashworth@firm.co.uk', role: 'sales_rep', active: true },
]

export const mockJobListings = [
  { id: 'j1', title: 'Chief Financial Officer', client_company: 'Meridian Capital Partners', mandate_type: 'Retained', recruiter_id: 's2', status: 'Active', date_posted: '2026-02-10', applications: 14 },
  { id: 'j2', title: 'Chief Technology Officer', client_company: 'Vantage Logistics Group', mandate_type: 'Retained', recruiter_id: 's3', status: 'Shortlisting', date_posted: '2026-01-22', applications: 21 },
  { id: 'j3', title: 'VP of Sales — EMEA', client_company: 'Aldgate Ventures', mandate_type: 'Contingency', recruiter_id: 's4', status: 'Offer Stage', date_posted: '2025-12-15', applications: 8 },
  { id: 'j4', title: 'Managing Director — APAC', client_company: 'Stonehouse Asset Management', mandate_type: 'Retained', recruiter_id: 's5', status: 'Active', date_posted: '2026-03-01', applications: 6 },
  { id: 'j5', title: 'General Counsel', client_company: 'Blackwater Energy', mandate_type: 'Retained', recruiter_id: 's2', status: 'Filled', date_posted: '2025-11-10', date_filled: '2026-01-28', applications: 19 },
  { id: 'j6', title: 'Chief Marketing Officer', client_company: 'Prestige Brands International', mandate_type: 'Contingency', recruiter_id: 's6', status: 'Active', date_posted: '2026-03-12', applications: 4 },
  { id: 'j7', title: 'Board Non-Executive Director', client_company: 'Harwood Infrastructure', mandate_type: 'Retained', recruiter_id: 's3', status: 'On Hold', date_posted: '2026-02-01', applications: 11 },
]

export const RECRUITMENT_STAGES = [
  'New Application',
  'CV Screening',
  'Recruiter Interview',
  'Longlist Submitted to Client',
  'Client Interview Round 1',
  'Client Interview Round 2 / Final',
  'Reference Check',
  'Offer Extended',
  'Placed',
  'Rejected / Withdrawn',
]

export const SALES_STAGES = [
  'Lead Identified',
  'Initial Outreach',
  'Discovery Call',
  'Proposal Sent',
  'Negotiation',
  'Retained Mandate Signed',
  'Lost / No Decision',
]

export const STAGE_PROBABILITY = {
  'Lead Identified': 10,
  'Initial Outreach': 15,
  'Discovery Call': 25,
  'Proposal Sent': 40,
  'Negotiation': 65,
  'Retained Mandate Signed': 100,
  'Lost / No Decision': 0,
}

export const mockCandidates = [
  { id: 'c1', full_name: 'Alistair Drummond', nationality: 'British', current_title: 'CFO', current_company: 'Hexagon Capital', current_location: 'London, UK', target_role: 'CFO', stage: 'Client Interview Round 1', recruiter_id: 's2', job_listing_id: 'j1', source: 'LinkedIn Sales Navigator', stage_entered_at: '2026-03-20', created_at: '2026-02-14' },
  { id: 'c2', full_name: 'Priya Mehra', nationality: 'Indian', current_title: 'VP Finance', current_company: 'Tata Consulting', current_location: 'Mumbai, India', target_role: 'CFO', stage: 'Longlist Submitted to Client', recruiter_id: 's2', job_listing_id: 'j1', source: 'Referral', stage_entered_at: '2026-03-18', created_at: '2026-02-14' },
  { id: 'c3', full_name: 'David Nakamura', nationality: 'Japanese', current_title: 'CTO', current_company: 'SoftTech Asia', current_location: 'Tokyo, Japan', target_role: 'CTO', stage: 'Recruiter Interview', recruiter_id: 's3', job_listing_id: 'j2', source: 'LinkedIn Sales Navigator', stage_entered_at: '2026-03-25', created_at: '2026-02-10' },
  { id: 'c4', full_name: 'Fatima Al-Rashidi', nationality: 'Emirati', current_title: 'VP Engineering', current_company: 'Dubai Digital Authority', current_location: 'Dubai, UAE', target_role: 'CTO', stage: 'CV Screening', recruiter_id: 's3', job_listing_id: 'j2', source: 'Inbound', stage_entered_at: '2026-03-28', created_at: '2026-03-01' },
  { id: 'c5', full_name: 'Robert Mensah', nationality: 'Ghanaian', current_title: 'Sales Director', current_company: 'Pan-African Trade Co.', current_location: 'Accra, Ghana', target_role: 'VP Sales EMEA', stage: 'Offer Extended', recruiter_id: 's4', job_listing_id: 'j3', source: 'Referral', stage_entered_at: '2026-03-22', created_at: '2026-01-15' },
  { id: 'c6', full_name: 'Isabella Carvalho', nationality: 'Brazilian', current_title: 'Regional Director', current_company: 'Nexus Global', current_location: 'Sao Paulo, Brazil', target_role: 'MD APAC', stage: 'New Application', recruiter_id: 's5', job_listing_id: 'j4', source: 'Inbound', stage_entered_at: '2026-03-30', created_at: '2026-03-28' },
  { id: 'c7', full_name: 'Thomas Berger', nationality: 'German', current_title: 'General Counsel', current_company: 'Frankfurt Wealth Managers', current_location: 'Frankfurt, Germany', target_role: 'General Counsel', stage: 'Placed', recruiter_id: 's2', job_listing_id: 'j5', source: 'LinkedIn Sales Navigator', stage_entered_at: '2026-01-28', created_at: '2025-11-20' },
  { id: 'c8', full_name: 'Yuki Tanaka', nationality: 'Japanese', current_title: 'CMO', current_company: 'Shiseido Group', current_location: 'Tokyo, Japan', target_role: 'CMO', stage: 'CV Screening', recruiter_id: 's6', job_listing_id: 'j6', source: 'Referral', stage_entered_at: '2026-03-29', created_at: '2026-03-20' },
  { id: 'c9', full_name: 'Kwame Asante', nationality: 'Ghanaian', current_title: 'Non-Executive Director', current_company: 'Barclays Africa', current_location: 'Johannesburg, SA', target_role: 'NED', stage: 'Longlist Submitted to Client', recruiter_id: 's3', job_listing_id: 'j7', source: 'Referral', stage_entered_at: '2026-03-10', created_at: '2026-02-05' },
  { id: 'c10', full_name: 'Claire Moreau', nationality: 'French', current_title: 'CFO', current_company: 'BNP Paribas', current_location: 'Paris, France', target_role: 'CFO', stage: 'Client Interview Round 2 / Final', recruiter_id: 's2', job_listing_id: 'j1', source: 'LinkedIn Sales Navigator', stage_entered_at: '2026-03-15', created_at: '2026-02-14' },
  { id: 'c11', full_name: 'Michael O\'Brien', nationality: 'Irish', current_title: 'CTO', current_company: 'Accenture EMEA', current_location: 'Dublin, Ireland', target_role: 'CTO', stage: 'Reference Check', recruiter_id: 's3', job_listing_id: 'j2', source: 'Referral', stage_entered_at: '2026-03-12', created_at: '2026-02-01' },
  { id: 'c12', full_name: 'Amelia Zhao', nationality: 'Chinese', current_title: 'VP Sales APAC', current_company: 'Alibaba Group', current_location: 'Shanghai, China', target_role: 'VP Sales EMEA', stage: 'Rejected / Withdrawn', recruiter_id: 's4', job_listing_id: 'j3', source: 'Inbound', stage_entered_at: '2026-03-05', created_at: '2026-01-20' },
]

export const mockDeals = [
  { id: 'd1', company_name: 'Meridian Capital Partners', contact_name: 'Jonathan Clarke', contact_email: 'j.clarke@meridian.co.uk', contact_linkedin_url: 'https://linkedin.com/in/jonathanclarke', sales_rep_id: 's7', mandate_type: 'Retained', role_being_filled: 'Chief Financial Officer', estimated_fee_gbp: 95000, stage: 'Retained Mandate Signed', probability_pct: 100, expected_close_date: '2026-01-15', actual_close_date: '2026-01-15', outcome: 'Won', source: 'Referral' },
  { id: 'd2', company_name: 'Vantage Logistics Group', contact_name: 'Sarah Lennox', contact_email: 's.lennox@vantage.com', contact_linkedin_url: 'https://linkedin.com/in/sarahlennox', sales_rep_id: 's8', mandate_type: 'Retained', role_being_filled: 'Chief Technology Officer', estimated_fee_gbp: 88000, stage: 'Retained Mandate Signed', probability_pct: 100, expected_close_date: '2026-01-22', actual_close_date: '2026-01-22', outcome: 'Won', source: 'LinkedIn Sales Navigator' },
  { id: 'd3', company_name: 'Stonehouse Asset Management', contact_name: 'Richard Hargreaves', contact_email: 'r.hargreaves@stonehouse.co.uk', contact_linkedin_url: '', sales_rep_id: 's7', mandate_type: 'Retained', role_being_filled: 'Managing Director APAC', estimated_fee_gbp: 125000, stage: 'Negotiation', probability_pct: 65, expected_close_date: '2026-04-30', source: 'Event' },
  { id: 'd4', company_name: 'Prestige Brands International', contact_name: 'Caroline Walsh', contact_email: 'c.walsh@prestige.com', contact_linkedin_url: 'https://linkedin.com/in/carolinewalsh', sales_rep_id: 's9', mandate_type: 'Contingency', role_being_filled: 'Chief Marketing Officer', estimated_fee_gbp: 62000, stage: 'Proposal Sent', probability_pct: 40, expected_close_date: '2026-05-15', source: 'Cold Email' },
  { id: 'd5', company_name: 'Harwood Infrastructure', contact_name: 'Peter Fairfax', contact_email: 'p.fairfax@harwood.co.uk', contact_linkedin_url: '', sales_rep_id: 's8', mandate_type: 'Retained', role_being_filled: 'Board NED x2', estimated_fee_gbp: 48000, stage: 'Discovery Call', probability_pct: 25, expected_close_date: '2026-04-20', source: 'Referral' },
  { id: 'd6', company_name: 'Quantum Fintech Ltd', contact_name: 'Anya Kapoor', contact_email: 'a.kapoor@quantum.io', contact_linkedin_url: 'https://linkedin.com/in/anyakapoor', sales_rep_id: 's9', mandate_type: 'Retained', role_being_filled: 'Chief Revenue Officer', estimated_fee_gbp: 78000, stage: 'Initial Outreach', probability_pct: 15, expected_close_date: '2026-06-01', source: 'LinkedIn Sales Navigator' },
  { id: 'd7', company_name: 'Halcyon Private Equity', contact_name: 'Marcus Drummond', contact_email: 'm.drummond@halcyon.co.uk', contact_linkedin_url: '', sales_rep_id: 's7', mandate_type: 'Retained', role_being_filled: 'Portfolio CFO', estimated_fee_gbp: 110000, stage: 'Lead Identified', probability_pct: 10, expected_close_date: '2026-07-01', source: 'Event' },
  { id: 'd8', company_name: 'Aldgate Ventures', contact_name: 'Helen Bright', contact_email: 'h.bright@aldgate.vc', contact_linkedin_url: 'https://linkedin.com/in/helenbright', sales_rep_id: 's8', mandate_type: 'Contingency', role_being_filled: 'VP of Sales EMEA', estimated_fee_gbp: 55000, stage: 'Retained Mandate Signed', probability_pct: 100, expected_close_date: '2025-12-20', actual_close_date: '2025-12-18', outcome: 'Won', source: 'Inbound' },
  { id: 'd9', company_name: 'Titan Resources', contact_name: 'Bernard Okafor', contact_email: 'b.okafor@titan.com', contact_linkedin_url: '', sales_rep_id: 's9', mandate_type: 'Retained', role_being_filled: 'SVP Operations', estimated_fee_gbp: 92000, stage: 'Lost / No Decision', probability_pct: 0, expected_close_date: '2026-02-28', outcome: 'Lost', source: 'Cold Email' },
]

export const mockDocuments = [
  { id: 'doc1', file_name: 'Alistair_Drummond_CV_2026.pdf', file_type: 'application/pdf', document_type: 'CV', linked_entity_type: 'candidate', linked_entity_id: 'c1', uploaded_by: 's2', file_size_bytes: 245760, created_at: '2026-02-15' },
  { id: 'doc2', file_name: 'Drummond_Reference_Hexagon.pdf', file_type: 'application/pdf', document_type: 'Reference', linked_entity_type: 'candidate', linked_entity_id: 'c1', uploaded_by: 's2', file_size_bytes: 98304, created_at: '2026-03-22' },
  { id: 'doc3', file_name: 'Priya_Mehra_CV_Jan2026.pdf', file_type: 'application/pdf', document_type: 'CV', linked_entity_type: 'candidate', linked_entity_id: 'c2', uploaded_by: 's2', file_size_bytes: 187392, created_at: '2026-02-16' },
  { id: 'doc4', file_name: 'Meridian_Retained_Proposal.pdf', file_type: 'application/pdf', document_type: 'Proposal', linked_entity_type: 'deal', linked_entity_id: 'd1', uploaded_by: 's7', file_size_bytes: 524288, created_at: '2025-12-20' },
  { id: 'doc5', file_name: 'Stonehouse_Proposal_MD_APAC.pdf', file_type: 'application/pdf', document_type: 'Proposal', linked_entity_type: 'deal', linked_entity_id: 'd3', uploaded_by: 's7', file_size_bytes: 614400, created_at: '2026-03-15' },
  { id: 'doc6', file_name: 'Thomas_Berger_Contract_Signed.pdf', file_type: 'application/pdf', document_type: 'Contract', linked_entity_type: 'candidate', linked_entity_id: 'c7', uploaded_by: 's2', file_size_bytes: 356352, created_at: '2026-01-27' },
]

export const mockWeeklyReports = [
  { id: 'r1', week_ending: '2026-03-28', generated_by: 's1', placements_count: 1, deals_closed_count: 0, revenue_closed_gbp: 0, pipeline_value_gbp: 636000, email_sent: true, created_at: '2026-03-23' },
  { id: 'r2', week_ending: '2026-03-21', generated_by: 's1', placements_count: 0, deals_closed_count: 1, revenue_closed_gbp: 88000, pipeline_value_gbp: 598000, email_sent: true, created_at: '2026-03-16' },
  { id: 'r3', week_ending: '2026-03-14', generated_by: 's1', placements_count: 0, deals_closed_count: 0, revenue_closed_gbp: 0, pipeline_value_gbp: 598000, email_sent: true, created_at: '2026-03-09' },
]

export function getDaysInStage(stageEnteredAt) {
  const entered = new Date(stageEnteredAt)
  const now = new Date('2026-04-01')
  return Math.floor((now - entered) / (1000 * 60 * 60 * 24))
}

export function formatGBP(amount) {
  if (amount == null) return '-'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)
}

export function getStaffName(staffId, staffList) {
  const s = staffList.find(x => x.id === staffId)
  return s ? s.full_name : '-'
}

export function getJobTitle(jobId, jobs) {
  const j = jobs.find(x => x.id === jobId)
  return j ? j.title : '-'
}

export function getJobClient(jobId, jobs) {
  const j = jobs.find(x => x.id === jobId)
  return j ? j.client_company : '-'
}
