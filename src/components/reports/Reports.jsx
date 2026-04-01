import React, { useState } from 'react'
import { mockCandidates, mockDeals, mockJobListings, mockStaff, mockWeeklyReports, formatGBP } from '../../data/mockData.js'
import { generateExcelWorkbook, downloadExcelWorkbook, calculateReportSummary, printReport, createNotionWeeklyBrief } from '../../lib/reports.js'

const REPORT_TYPES = [
  { id: 'placement-summary', label: 'Placement Summary' },
  { id: 'pipeline-report', label: 'Pipeline Report' },
  { id: 'recruiter-kpis', label: 'Recruiter KPIs' },
  { id: 'revenue-forecast', label: 'Revenue Forecast' },
]

export default function Reports() {
  const [reportType, setReportType] = useState('placement-summary')
  const [dateFrom, setDateFrom] = useState('2026-01-01')
  const [dateTo, setDateTo] = useState('2026-03-31')
  const [generating, setGenerating] = useState(false)
  const [lastReport, setLastReport] = useState(null)
  const [notionUrl, setNotionUrl] = useState(null)
  const [weeklyReports, setWeeklyReports] = useState(mockWeeklyReports)

  const summary = calculateReportSummary(mockCandidates, mockDeals, { from: dateFrom, to: dateTo })

  function handleGenerateExcel() {
    const wb = generateExcelWorkbook({
      candidates: mockCandidates,
      deals: mockDeals,
      jobListings: mockJobListings,
      staff: mockStaff,
    })
    downloadExcelWorkbook(wb, `recruitment-crm-${dateFrom}-to-${dateTo}.xlsx`)
  }

  async function handleGenerateReport() {
    setGenerating(true)
    await new Promise(r => setTimeout(r, 600))

    const newReport = {
      id: `r${Date.now()}`,
      week_ending: dateTo,
      generated_by: 's1',
      placements_count: summary.placements,
      deals_closed_count: summary.dealsWon,
      revenue_closed_gbp: summary.revenueGbp,
      pipeline_value_gbp: summary.pipelineGbp,
      email_sent: false,
      created_at: new Date().toISOString().split('T')[0],
    }

    setWeeklyReports(prev => [newReport, ...prev])
    setLastReport(newReport)
    setGenerating(false)
  }

  async function handleCreateNotionPage() {
    const url = await createNotionWeeklyBrief({
      weekEnding: dateTo,
      placements: summary.placements,
      dealsWon: summary.dealsWon,
      revenueGbp: summary.revenueGbp,
      pipelineGbp: summary.pipelineGbp,
      notionToken: null,
      notionDatabaseId: null,
    })
    if (!url) {
      alert('Notion not configured. Set NOTION_TOKEN and NOTION_DATABASE_ID in environment variables.')
    } else {
      setNotionUrl(url)
    }
  }

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Generate placement summaries, pipeline reports, KPI exports, and revenue forecasts.</p>

      {/* Report Builder */}
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 20 }}>Report Builder</div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <div className="form-group">
            <label>Report Type</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)}>
              {REPORT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Date To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* Summary preview */}
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 16 }}>
            Summary for {dateFrom} to {dateTo}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Placements</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700 }}>{summary.placements}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Deals Won</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700 }}>{summary.dealsWon}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Revenue Closed (GBP)</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700 }}>{formatGBP(summary.revenueGbp)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Weighted Pipeline (GBP)</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700 }}>{formatGBP(summary.weightedPipelineGbp)}</div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleGenerateReport} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Report'}
          </button>
          <button className="btn btn-secondary" onClick={() => printReport(
            REPORT_TYPES.find(t => t.id === reportType)?.label,
            { from: dateFrom, to: dateTo }
          )}>
            Export PDF
          </button>
          <button className="btn btn-secondary" onClick={handleGenerateExcel}>
            Export Excel (.xlsx)
          </button>
          <button className="btn btn-secondary" onClick={handleCreateNotionPage}>
            Create Notion Page
          </button>
        </div>

        {lastReport && (
          <div className="alert alert-success" style={{ marginTop: 16 }}>
            Report generated for {lastReport.week_ending} —
            {lastReport.placements_count} placement{lastReport.placements_count !== 1 ? 's' : ''},
            {formatGBP(lastReport.revenue_closed_gbp)} closed,
            {formatGBP(lastReport.pipeline_value_gbp)} pipeline.
          </div>
        )}

        {notionUrl && (
          <div className="alert alert-info" style={{ marginTop: 16 }}>
            Notion page created: <a href={notionUrl} target="_blank" rel="noreferrer">{notionUrl}</a>
          </div>
        )}
      </div>

      {/* Report History */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Report History</div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date Generated</th>
                <th>Period Ending</th>
                <th style={{ textAlign: 'right' }}>Placements</th>
                <th style={{ textAlign: 'right' }}>Deals Won</th>
                <th style={{ textAlign: 'right' }}>Revenue (GBP)</th>
                <th style={{ textAlign: 'right' }}>Pipeline (GBP)</th>
                <th>Email Sent</th>
                <th>Notion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {weeklyReports.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {new Date(r.week_ending).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.placements_count}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.deals_closed_count}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {formatGBP(r.revenue_closed_gbp)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatGBP(r.pipeline_value_gbp)}
                  </td>
                  <td>
                    {r.email_sent
                      ? <span className="badge badge-success">Sent</span>
                      : <span className="badge badge-muted">Not sent</span>
                    }
                  </td>
                  <td>
                    {r.notion_page_url
                      ? <a href={r.notion_page_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View</a>
                      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>-</span>
                    }
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-secondary btn-xs">Download</button>
                      {!r.email_sent && <button className="btn btn-secondary btn-xs">Email</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
