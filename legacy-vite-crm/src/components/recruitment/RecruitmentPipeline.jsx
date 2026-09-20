import React, { useState, useMemo } from 'react'
import {
  mockCandidates, mockStaff, mockJobListings,
  RECRUITMENT_STAGES, getDaysInStage, formatGBP,
  getStaffName, getJobTitle, getJobClient
} from '../../data/mockData.js'

function StageBadge({ stage }) {
  const map = {
    'Placed': 'badge-gold',
    'Offer Extended': 'badge-success',
    'Rejected / Withdrawn': 'badge-danger',
    'Reference Check': 'badge-warning',
    'Client Interview Round 2 / Final': 'badge-accent',
    'Client Interview Round 1': 'badge-accent',
  }
  return <span className={`badge ${map[stage] || 'badge-default'}`}>{stage}</span>
}

function TableView({ candidates, onStageChange }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Nationality</th>
            <th>Role</th>
            <th>Client</th>
            <th>Stage</th>
            <th>Recruiter</th>
            <th style={{ textAlign: 'right' }}>Days in Stage</th>
            <th>Next Action</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map(c => {
            const days = getDaysInStage(c.stage_entered_at)
            const rowClass = days >= 20 ? 'row-danger' : days >= 10 ? 'row-warning' : ''
            return (
              <tr key={c.id} className={rowClass}>
                <td>
                  <div style={{ fontWeight: 700 }}>{c.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.current_title}, {c.current_company}</div>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.nationality}</td>
                <td style={{ fontSize: 12 }}>{c.target_role}</td>
                <td style={{ fontSize: 12 }}>{getJobClient(c.job_listing_id, mockJobListings)}</td>
                <td><StageBadge stage={c.stage} /></td>
                <td style={{ fontSize: 12 }}>{getStaffName(c.recruiter_id, mockStaff)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  <span style={{ color: days >= 20 ? 'var(--danger)' : days >= 10 ? 'var(--warning)' : 'var(--text-primary)' }}>
                    {days}d
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {nextAction(c.stage)}
                </td>
                <td>
                  <div className="flex gap-8">
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => onStageChange(c)}
                    >
                      Move
                    </button>
                    <button className="btn btn-secondary btn-xs">View</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KanbanView({ candidates }) {
  const byStage = RECRUITMENT_STAGES.reduce((acc, stage) => {
    acc[stage] = candidates.filter(c => c.stage === stage)
    return acc
  }, {})

  return (
    <div className="kanban-board">
      {RECRUITMENT_STAGES.map(stage => (
        <div key={stage} className="kanban-column">
          <div className="kanban-col-header">
            {stage}
            <span className="kanban-col-count">{byStage[stage].length}</span>
          </div>
          {byStage[stage].map(c => {
            const days = getDaysInStage(c.stage_entered_at)
            return (
              <div key={c.id} className="kanban-card">
                <div className="kanban-card-name">{c.full_name}</div>
                <div className="kanban-card-role">{c.target_role}</div>
                <div className="kanban-card-days" style={{
                  color: days >= 20 ? 'var(--danger)' : days >= 10 ? 'var(--warning)' : 'var(--text-muted)'
                }}>
                  {days}d in stage
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function nextAction(stage) {
  const map = {
    'New Application': 'Screen CV',
    'CV Screening': 'Arrange recruiter call',
    'Recruiter Interview': 'Add to longlist',
    'Longlist Submitted to Client': 'Await client feedback',
    'Client Interview Round 1': 'Arrange Round 2',
    'Client Interview Round 2 / Final': 'Obtain references',
    'Reference Check': 'Prepare offer',
    'Offer Extended': 'Confirm acceptance',
    'Placed': 'Post-placement check-in',
    'Rejected / Withdrawn': '-',
  }
  return map[stage] || '-'
}

function StageMoveModal({ candidate, onClose, onConfirm }) {
  const [newStage, setNewStage] = useState(candidate.stage)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Move Stage — {candidate.full_name}</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Current Stage</label>
            <input type="text" value={candidate.stage} disabled style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }} />
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Move To</label>
            <select value={newStage} onChange={e => setNewStage(e.target.value)}>
              {RECRUITMENT_STAGES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => onConfirm(candidate.id, newStage)}>Confirm Move</button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RecruitmentPipeline() {
  const [view, setView] = useState('table')
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterRecruiter, setFilterRecruiter] = useState('')
  const [stagingModal, setStagingModal] = useState(null)
  const [candidates, setCandidates] = useState(mockCandidates)

  const filtered = useMemo(() => {
    return candidates.filter(c => {
      if (filterStage && c.stage !== filterStage) return false
      if (filterRecruiter && c.recruiter_id !== filterRecruiter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          c.full_name.toLowerCase().includes(q) ||
          c.current_title?.toLowerCase().includes(q) ||
          c.current_company?.toLowerCase().includes(q) ||
          c.current_location?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [candidates, filterStage, filterRecruiter, search])

  function handleStageConfirm(candidateId, newStage) {
    setCandidates(prev => prev.map(c =>
      c.id === candidateId
        ? { ...c, stage: newStage, stage_entered_at: new Date().toISOString() }
        : c
    ))
    setStagingModal(null)
  }

  const urgentCount = candidates.filter(c => getDaysInStage(c.stage_entered_at) >= 14 && c.stage !== 'Placed' && c.stage !== 'Rejected / Withdrawn').length

  return (
    <div>
      <h1 className="page-title">Candidate Pipeline</h1>
      <p className="page-subtitle">Track candidates from application through to placement.</p>

      {urgentCount > 0 && (
        <div className="alert alert-warning">
          {urgentCount} candidate{urgentCount !== 1 ? 's' : ''} have been in the same stage for 14 or more days and require attention.
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Pipeline</div>
            <div className="panel-subtitle">{filtered.length} of {candidates.length} candidates</div>
          </div>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${view === 'table' ? 'active' : ''}`}
              onClick={() => setView('table')}
            >
              Table
            </button>
            <button
              className={`view-toggle-btn ${view === 'kanban' ? 'active' : ''}`}
              onClick={() => setView('kanban')}
            >
              Kanban
            </button>
          </div>
        </div>

        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, role, company, location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">All Stages</option>
            {RECRUITMENT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterRecruiter} onChange={e => setFilterRecruiter(e.target.value)}>
            <option value="">All Recruiters</option>
            {mockStaff.filter(s => s.role === 'recruiter').map(s => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>

        {view === 'table'
          ? <TableView candidates={filtered} onStageChange={c => setStagingModal(c)} />
          : <KanbanView candidates={filtered} />
        }
      </div>

      {/* Legend */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 20 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#FFF8EE', border: '1px solid var(--border)' }}></span>
          10 - 19 days in stage
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#FFF2F2', border: '1px solid var(--border)' }}></span>
          20+ days in stage — urgent
        </span>
      </div>

      {stagingModal && (
        <StageMoveModal
          candidate={stagingModal}
          onClose={() => setStagingModal(null)}
          onConfirm={handleStageConfirm}
        />
      )}
    </div>
  )
}
