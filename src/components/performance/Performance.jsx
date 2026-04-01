import React, { useState } from 'react'
import { mockStaff, mockCandidates, mockDeals, formatGBP } from '../../data/mockData.js'

function RecruiterKPIs() {
  const recruiters = mockStaff.filter(s => s.role === 'recruiter')

  const rows = recruiters.map(r => {
    const mine = mockCandidates.filter(c => c.recruiter_id === r.id)
    const placed = mine.filter(c => c.stage === 'Placed')
    const active = mine.filter(c => c.stage !== 'Placed' && c.stage !== 'Rejected / Withdrawn')
    const interviews = mine.filter(c =>
      ['Client Interview Round 1', 'Client Interview Round 2 / Final', 'Recruiter Interview'].includes(c.stage)
    )
    const convRate = mine.length > 0 ? Math.round((placed.length / mine.length) * 100) : 0

    const placedThisMonth = placed.filter(c => {
      const d = new Date(c.stage_entered_at)
      return d.getMonth() === 2 && d.getFullYear() === 2026
    })
    const placedThisQtr = placed.filter(c => {
      const d = new Date(c.stage_entered_at)
      return d.getFullYear() === 2026 && d.getMonth() >= 0 && d.getMonth() <= 2
    })

    const avgTTF = placed.length > 0
      ? Math.round(placed.reduce((s, c) => {
          const created = new Date(c.created_at)
          const pl = new Date(c.stage_entered_at)
          return s + Math.floor((pl - created) / (1000 * 60 * 60 * 24))
        }, 0) / placed.length)
      : '-'

    return {
      ...r,
      totalCandidates: mine.length,
      activeCandidates: active.length,
      placedMTD: placedThisMonth.length,
      placedQTD: placedThisQtr.length,
      placedYTD: placed.length,
      avgTTF,
      interviews: interviews.length,
      convRate,
    }
  })

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Recruiter Performance</div>
          <div className="panel-subtitle">KPIs per recruiter — YTD 2026</div>
        </div>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Recruiter</th>
              <th style={{ textAlign: 'right' }}>Active Candidates</th>
              <th style={{ textAlign: 'right' }}>Interviews Arranged</th>
              <th style={{ textAlign: 'right' }}>Placed MTD</th>
              <th style={{ textAlign: 'right' }}>Placed QTD</th>
              <th style={{ textAlign: 'right' }}>Placed YTD</th>
              <th style={{ textAlign: 'right' }}>Avg Time-to-Fill</th>
              <th style={{ textAlign: 'right' }}>Conversion Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.email}</div>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.activeCandidates}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.interviews}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: r.placedMTD > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {r.placedMTD}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.placedQTD}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.placedYTD}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {r.avgTTF !== '-' ? `${r.avgTTF}d` : '-'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    color: r.convRate >= 30 ? 'var(--success)' : r.convRate >= 15 ? 'var(--warning)' : 'var(--text-primary)'
                  }}>
                    {r.convRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SalesPerformance() {
  const reps = mockStaff.filter(s => s.role === 'sales_rep')

  const rows = reps.map(r => {
    const myDeals = mockDeals.filter(d => d.sales_rep_id === r.id)
    const won = myDeals.filter(d => d.outcome === 'Won')
    const lost = myDeals.filter(d => d.outcome === 'Lost')
    const open = myDeals.filter(d => !d.outcome)

    const closedCount = won.length + lost.length
    const winRate = closedCount > 0 ? Math.round((won.length / closedCount) * 100) : 0
    const closedGbp = won.reduce((s, d) => s + (d.estimated_fee_gbp || 0), 0)
    const pipelineGbp = open.reduce((s, d) => s + (d.estimated_fee_gbp || 0), 0)
    const avgDeal = won.length > 0 ? Math.round(closedGbp / won.length) : 0
    const retained = myDeals.filter(d => d.mandate_type === 'Retained').length
    const contingency = myDeals.filter(d => d.mandate_type !== 'Retained').length

    return {
      ...r,
      wonCount: won.length,
      lostCount: lost.length,
      openCount: open.length,
      winRate,
      closedGbp,
      pipelineGbp,
      avgDeal,
      retained,
      contingency,
    }
  })

  const teamClosedGbp = rows.reduce((s, r) => s + r.closedGbp, 0)
  const teamPipelineGbp = rows.reduce((s, r) => s + r.pipelineGbp, 0)

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Sales Performance</div>
          <div className="panel-subtitle">
            Team: {formatGBP(teamClosedGbp)} closed — {formatGBP(teamPipelineGbp)} pipeline
          </div>
        </div>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Sales Rep</th>
              <th style={{ textAlign: 'right' }}>Deals Won</th>
              <th style={{ textAlign: 'right' }}>Revenue Closed (GBP)</th>
              <th style={{ textAlign: 'right' }}>Pipeline (GBP)</th>
              <th style={{ textAlign: 'right' }}>Win Rate</th>
              <th style={{ textAlign: 'right' }}>Avg Deal (GBP)</th>
              <th style={{ textAlign: 'right' }}>Retained</th>
              <th style={{ textAlign: 'right' }}>Contingency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.email}</div>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--success)' }}>
                  {r.wonCount}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {formatGBP(r.closedGbp)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {formatGBP(r.pipelineGbp)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: r.winRate >= 60 ? 'var(--success)' : r.winRate >= 40 ? 'var(--warning)' : 'var(--danger)'
                  }}>
                    {r.winRate}%
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {formatGBP(r.avgDeal)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.retained}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.contingency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Revenue by Rep Bar */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
          Closed Revenue by Rep
        </div>
        {rows.map(r => {
          const pct = teamClosedGbp > 0 ? (r.closedGbp / teamClosedGbp) * 100 : 0
          return (
            <div key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span>{r.full_name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatGBP(r.closedGbp)}</span>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 2, height: 8, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Performance() {
  const [tab, setTab] = useState('recruiters')

  return (
    <div>
      <h1 className="page-title">Performance</h1>
      <p className="page-subtitle">KPIs and revenue metrics for recruiters and sales representatives.</p>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'recruiters' ? 'active' : ''}`} onClick={() => setTab('recruiters')}>
          Recruiter KPIs
        </button>
        <button className={`tab-btn ${tab === 'sales' ? 'active' : ''}`} onClick={() => setTab('sales')}>
          Sales Performance
        </button>
      </div>

      {tab === 'recruiters' && <RecruiterKPIs />}
      {tab === 'sales' && <SalesPerformance />}
    </div>
  )
}
