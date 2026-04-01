import React from 'react'
import { mockCandidates, mockDeals, mockJobListings, formatGBP, getDaysInStage } from '../../data/mockData.js'

function KpiCard({ label, value, sub, deltaValue, deltaLabel }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {deltaValue !== undefined && (
        <div className={deltaValue >= 0 ? 'kpi-delta-pos' : 'kpi-delta-neg'} style={{ marginTop: 6 }}>
          {deltaValue >= 0 ? '+' : ''}{deltaValue} {deltaLabel}
        </div>
      )}
    </div>
  )
}

export default function Overview() {
  const activeMandates = mockJobListings.filter(j => j.status === 'Active' || j.status === 'Shortlisting' || j.status === 'Offer Stage').length
  const candidatesInPipeline = mockCandidates.filter(c => c.stage !== 'Placed' && c.stage !== 'Rejected / Withdrawn').length
  const placementsThisMonth = mockCandidates.filter(c => {
    if (c.stage !== 'Placed') return false
    const d = new Date(c.stage_entered_at)
    return d.getMonth() === 2 && d.getFullYear() === 2026 // March 2026
  }).length
  const openDeals = mockDeals.filter(d => !d.outcome)
  const pipelineValue = openDeals.reduce((s, d) => s + (d.estimated_fee_gbp || 0), 0)
  const revenueMTD = mockDeals
    .filter(d => d.outcome === 'Won' && d.actual_close_date?.startsWith('2026-0'))
    .reduce((s, d) => s + (d.estimated_fee_gbp || 0), 0)

  const placedCandidates = mockCandidates.filter(c => c.stage === 'Placed')
  const avgTimeToFill = placedCandidates.length > 0
    ? Math.round(placedCandidates.reduce((s, c) => {
        const created = new Date(c.created_at)
        const placed = new Date(c.stage_entered_at)
        return s + Math.floor((placed - created) / (1000 * 60 * 60 * 24))
      }, 0) / placedCandidates.length)
    : 0

  const weightedPipeline = openDeals.reduce((s, d) =>
    s + Math.round(((d.estimated_fee_gbp || 0) * (d.probability_pct || 0)) / 100), 0
  )

  const stageBreakdown = {}
  mockCandidates.forEach(c => {
    stageBreakdown[c.stage] = (stageBreakdown[c.stage] || 0) + 1
  })

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-subtitle">Executive summary — Fate Collab Recruitment, London. Week of 31 March 2026.</p>

      <div className="kpi-grid">
        <KpiCard label="Active Mandates" value={activeMandates} sub={`${mockJobListings.length} total listings`} />
        <KpiCard label="Candidates in Pipeline" value={candidatesInPipeline} sub="Excludes placed and withdrawn" />
        <KpiCard label="Placements This Month" value={placementsThisMonth} sub="March 2026" deltaValue={1} deltaLabel="vs Feb" />
        <KpiCard label="Pipeline Value" value={formatGBP(pipelineValue)} sub="Open deals, GBP" />
        <KpiCard label="Revenue Closed MTD" value={formatGBP(revenueMTD)} sub="March 2026, GBP" />
        <KpiCard label="Avg Time-to-Fill" value={`${avgTimeToFill}d`} sub="Days from application to placement" />
        <KpiCard label="Weighted Pipeline" value={formatGBP(weightedPipeline)} sub="Probability-adjusted" />
        <KpiCard label="Win Rate" value="67%" sub="Deals won vs total closed" deltaValue={4} deltaLabel="% vs Q4" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Recruitment Stage Distribution */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Candidate Pipeline by Stage</div>
              <div className="panel-subtitle">All active candidates</div>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th style={{ textAlign: 'right' }}>Candidates</th>
                  <th style={{ textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stageBreakdown).map(([stage, count]) => (
                  <tr key={stage}>
                    <td>{stage}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{count}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {Math.round((count / mockCandidates.length) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deal Pipeline by Stage */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Deal Pipeline by Stage</div>
              <div className="panel-subtitle">GBP values, open deals only</div>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th style={{ textAlign: 'right' }}>Deals</th>
                  <th style={{ textAlign: 'right' }}>Value (GBP)</th>
                </tr>
              </thead>
              <tbody>
                {['Lead Identified', 'Initial Outreach', 'Discovery Call', 'Proposal Sent', 'Negotiation', 'Retained Mandate Signed'].map(stage => {
                  const stageDeals = mockDeals.filter(d => d.stage === stage && !d.outcome)
                  const stageValue = stageDeals.reduce((s, d) => s + (d.estimated_fee_gbp || 0), 0)
                  if (stageDeals.length === 0) return null
                  return (
                    <tr key={stage}>
                      <td>{stage}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{stageDeals.length}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {formatGBP(stageValue)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="panel" style={{ marginTop: 0 }}>
        <div className="panel-header">
          <div className="panel-title">Recent Activity</div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Record</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>01 Apr 2026</td>
                <td><span className="badge badge-accent">Stage Change</span></td>
                <td>Alistair Drummond — Client Interview Round 1</td>
                <td>James Pemberton</td>
              </tr>
              <tr>
                <td className="text-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>31 Mar 2026</td>
                <td><span className="badge badge-success">Offer Extended</span></td>
                <td>Robert Mensah — VP of Sales EMEA</td>
                <td>Charlotte Winters</td>
              </tr>
              <tr>
                <td className="text-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>30 Mar 2026</td>
                <td><span className="badge badge-default">Document Uploaded</span></td>
                <td>Stonehouse_Proposal_MD_APAC.pdf</td>
                <td>Oliver Crane</td>
              </tr>
              <tr>
                <td className="text-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>28 Mar 2026</td>
                <td><span className="badge badge-warning">Mandate Signed</span></td>
                <td>Stonehouse Asset Management — GBP 125,000</td>
                <td>Oliver Crane</td>
              </tr>
              <tr>
                <td className="text-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>28 Jan 2026</td>
                <td><span className="badge badge-gold">Placed</span></td>
                <td>Thomas Berger — General Counsel, Blackwater Energy</td>
                <td>James Pemberton</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
