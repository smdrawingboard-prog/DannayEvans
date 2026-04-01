// ============================================================
// Reports Generation
// PDF (print-to-PDF stub) | Excel (xlsx) | Notion | Email
// ============================================================

import * as XLSX from 'xlsx'
import { formatGBP } from '../data/mockData.js'

// ============================================================
// Excel Workbook Generator
// ============================================================

export function generateExcelWorkbook({ candidates, deals, jobListings, staff }) {
  const wb = XLSX.utils.book_new()

  // ---- Sheet 1: Placement Summary ----
  const placed = candidates.filter(c => c.stage === 'Placed')
  const placementRows = placed.map(c => ({
    'Candidate Name': c.full_name,
    'Nationality': c.nationality,
    'Current Role': c.current_title,
    'Current Location': c.current_location,
    'Placed Stage Date': c.stage_entered_at?.split('T')[0] || '',
    'Source': c.source,
    'Recruiter': staff.find(s => s.id === c.recruiter_id)?.full_name || '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(placementRows), 'Placements')

  // ---- Sheet 2: Recruitment Pipeline ----
  const pipelineRows = candidates.filter(c => c.stage !== 'Placed' && c.stage !== 'Rejected / Withdrawn').map(c => ({
    'Candidate': c.full_name,
    'Nationality': c.nationality,
    'Current Role': c.current_title,
    'Current Location': c.current_location,
    'Target Role': c.target_role,
    'Stage': c.stage,
    'Days in Stage': Math.floor((new Date() - new Date(c.stage_entered_at)) / (1000 * 60 * 60 * 24)),
    'Recruiter': staff.find(s => s.id === c.recruiter_id)?.full_name || '',
    'Source': c.source,
    'GDPR Consent': c.gdpr_consent ? 'Yes' : 'No',
    'Right to Work Checked': c.right_to_work_checked ? 'Yes' : 'No',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pipelineRows), 'Recruitment Pipeline')

  // ---- Sheet 3: Deal Pipeline ----
  const dealRows = deals.map(d => ({
    'Company': d.company_name,
    'Contact': d.contact_name,
    'Role': d.role_being_filled,
    'Type': d.mandate_type,
    'Fee (GBP)': d.estimated_fee_gbp || 0,
    'Stage': d.stage,
    'Probability %': d.probability_pct,
    'Expected Close': d.expected_close_date || '',
    'Outcome': d.outcome || 'Open',
    'Source': d.source,
    'Sales Rep': staff.find(s => s.id === d.sales_rep_id)?.full_name || '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dealRows), 'Deal Pipeline')

  // ---- Sheet 4: Recruiter KPIs ----
  const recruiters = staff.filter(s => s.role === 'recruiter')
  const kpiRows = recruiters.map(r => {
    const myCandidates = candidates.filter(c => c.recruiter_id === r.id)
    const placed = myCandidates.filter(c => c.stage === 'Placed')
    const active = myCandidates.filter(c => c.stage !== 'Placed' && c.stage !== 'Rejected / Withdrawn')
    return {
      'Recruiter': r.full_name,
      'Total Candidates': myCandidates.length,
      'Active Candidates': active.length,
      'Placements': placed.length,
      'Conversion Rate %': myCandidates.length > 0 ? Math.round((placed.length / myCandidates.length) * 100) : 0,
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'Recruiter KPIs')

  // ---- Sheet 5: Revenue Forecast ----
  const openDeals = deals.filter(d => !d.outcome)
  const forecastRows = openDeals.map(d => ({
    'Company': d.company_name,
    'Role': d.role_being_filled,
    'Fee (GBP)': d.estimated_fee_gbp || 0,
    'Stage': d.stage,
    'Probability %': d.probability_pct,
    'Weighted Value (GBP)': Math.round(((d.estimated_fee_gbp || 0) * (d.probability_pct || 0)) / 100),
    'Expected Close': d.expected_close_date || '',
    'Sales Rep': staff.find(s => s.id === d.sales_rep_id)?.full_name || '',
  }))
  const totalWeighted = forecastRows.reduce((sum, r) => sum + r['Weighted Value (GBP)'], 0)
  forecastRows.push({ 'Company': 'TOTAL WEIGHTED PIPELINE', 'Weighted Value (GBP)': totalWeighted })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forecastRows), 'Revenue Forecast')

  // ---- Sheet 6: Job Listings ----
  const jobRows = jobListings.map(j => ({
    'Role': j.title,
    'Client': j.client_company,
    'Type': j.mandate_type,
    'Status': j.status,
    'Date Posted': j.date_posted,
    'Date Filled': j.date_filled || '',
    'Recruiter': staff.find(s => s.id === j.recruiter_id)?.full_name || '',
    'Applications': j.applications || 0,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobRows), 'Job Listings')

  return wb
}

export function downloadExcelWorkbook(wb, filename = 'recruitment-crm-report.xlsx') {
  XLSX.writeFile(wb, filename)
}

// ============================================================
// Notion Page Creation Stub
// ============================================================

export async function createNotionWeeklyBrief({ weekEnding, placements, dealsWon, revenueGbp, pipelineGbp, notionToken, notionDatabaseId }) {
  if (!notionToken || !notionDatabaseId) {
    console.warn('[Notion] Not configured. Would create weekly brief page.')
    return null
  }

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: notionDatabaseId },
      properties: {
        Name: { title: [{ text: { content: `Weekly Report — ${weekEnding}` } }] },
        'Week Ending': { date: { start: weekEnding } },
        Placements: { number: placements },
        'Deals Won': { number: dealsWon },
        'Revenue (GBP)': { number: revenueGbp },
        'Pipeline (GBP)': { number: pipelineGbp },
      },
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: 'Executive Summary' } }] },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                text: {
                  content: `Week ending ${weekEnding}: ${placements} placement${placements !== 1 ? 's' : ''}, ${dealsWon} deal${dealsWon !== 1 ? 's' : ''} won, GBP ${revenueGbp.toLocaleString('en-GB')} revenue closed. Total pipeline: GBP ${pipelineGbp.toLocaleString('en-GB')}.`,
                },
              },
            ],
          },
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    console.error('[Notion] Error creating page:', err)
    return null
  }

  const data = await response.json()
  return data.url
}

// ============================================================
// PDF Report Stub (print-to-PDF via window.print)
// ============================================================

export function printReport(reportType, dateRange) {
  // In production: use puppeteer server-side or react-to-pdf
  // For the stub, trigger browser print dialog
  const title = document.title
  document.title = `${reportType} — ${dateRange.from} to ${dateRange.to}`
  window.print()
  document.title = title
}

// ============================================================
// Report Summary Calculator
// ============================================================

export function calculateReportSummary(candidates, deals, dateRange) {
  const { from, to } = dateRange
  const fromDate = new Date(from)
  const toDate = new Date(to)

  const inRange = (d) => {
    const date = new Date(d)
    return date >= fromDate && date <= toDate
  }

  const placements = candidates.filter(c =>
    c.stage === 'Placed' && inRange(c.stage_entered_at)
  )

  const dealsWon = deals.filter(d =>
    d.outcome === 'Won' && d.actual_close_date && inRange(d.actual_close_date)
  )

  const revenueGbp = dealsWon.reduce((sum, d) => sum + (d.estimated_fee_gbp || 0), 0)

  const openDeals = deals.filter(d => !d.outcome)
  const pipelineGbp = openDeals.reduce((sum, d) => sum + (d.estimated_fee_gbp || 0), 0)
  const weightedPipelineGbp = openDeals.reduce((sum, d) =>
    sum + Math.round(((d.estimated_fee_gbp || 0) * (d.probability_pct || 0)) / 100), 0
  )

  return {
    placements: placements.length,
    dealsWon: dealsWon.length,
    revenueGbp,
    pipelineGbp,
    weightedPipelineGbp,
    placementList: placements,
    dealWonList: dealsWon,
  }
}
