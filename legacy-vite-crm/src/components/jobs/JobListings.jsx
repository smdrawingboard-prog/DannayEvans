import React, { useState, useMemo } from 'react'
import { mockJobListings, mockStaff, mockCandidates, getStaffName } from '../../data/mockData.js'

const STATUS_OPTIONS = ['Active', 'Shortlisting', 'Offer Stage', 'Filled', 'On Hold', 'Cancelled']
const MANDATE_TYPES = ['Retained', 'Contingency', 'RPO']

const EMPTY_LISTING = {
  title: '',
  client_company: '',
  mandate_type: 'Retained',
  recruiter_id: '',
  status: 'Active',
  date_posted: new Date().toISOString().split('T')[0],
  notes: '',
}

function StatusBadge({ status }) {
  const map = {
    Active: 'badge-success',
    Shortlisting: 'badge-accent',
    'Offer Stage': 'badge-warning',
    Filled: 'badge-gold',
    'On Hold': 'badge-default',
    Cancelled: 'badge-danger',
  }
  return <span className={`badge ${map[status] || 'badge-default'}`}>{status}</span>
}

function JobForm({ job, onSave, onCancel }) {
  const [form, setForm] = useState(job || EMPTY_LISTING)
  const recruiters = mockStaff.filter(s => s.role === 'recruiter' || s.role === 'admin')

  return (
    <div>
      <div className="form-grid">
        <div className="form-group">
          <label>Role Title *</label>
          <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Chief Financial Officer" />
        </div>
        <div className="form-group">
          <label>Client Company *</label>
          <input type="text" value={form.client_company} onChange={e => setForm(p => ({ ...p, client_company: e.target.value }))} placeholder="Meridian Capital Partners" />
        </div>
        <div className="form-group">
          <label>Mandate Type</label>
          <select value={form.mandate_type} onChange={e => setForm(p => ({ ...p, mandate_type: e.target.value }))}>
            {MANDATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Assigned Recruiter</label>
          <select value={form.recruiter_id} onChange={e => setForm(p => ({ ...p, recruiter_id: e.target.value }))}>
            <option value="">Unassigned</option>
            {recruiters.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Date Posted</label>
          <input type="date" value={form.date_posted} onChange={e => setForm(p => ({ ...p, date_posted: e.target.value }))} />
        </div>
        {form.status === 'Filled' && (
          <div className="form-group">
            <label>Date Filled</label>
            <input type="date" value={form.date_filled || ''} onChange={e => setForm(p => ({ ...p, date_filled: e.target.value }))} />
          </div>
        )}
        <div className="form-group full-width">
          <label>Notes</label>
          <textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Role brief, client context, requirements..." rows={3} />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={!form.title || !form.client_company} onClick={() => onSave(form)}>
          {job ? 'Save Changes' : 'Create Mandate'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function JobListings() {
  const [listings, setListings] = useState(mockJobListings)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMandateType, setFilterMandateType] = useState('')
  const [filterRecruiter, setFilterRecruiter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState(null)

  const filtered = useMemo(() => {
    return listings.filter(j => {
      if (filterStatus && j.status !== filterStatus) return false
      if (filterMandateType && j.mandate_type !== filterMandateType) return false
      if (filterRecruiter && j.recruiter_id !== filterRecruiter) return false
      return true
    })
  }, [listings, filterStatus, filterMandateType, filterRecruiter])

  function getCandidateCount(jobId) {
    return mockCandidates.filter(c => c.job_listing_id === jobId).length
  }

  function handleSave(form) {
    if (editingJob) {
      setListings(prev => prev.map(j => j.id === editingJob.id ? { ...j, ...form } : j))
    } else {
      setListings(prev => [{
        ...form,
        id: `j${Date.now()}`,
        applications: 0,
      }, ...prev])
    }
    setShowForm(false)
    setEditingJob(null)
  }

  // Summary stats
  const active = listings.filter(j => j.status === 'Active').length
  const filled = listings.filter(j => j.status === 'Filled').length
  const retained = listings.filter(j => j.mandate_type === 'Retained').length

  return (
    <div>
      <h1 className="page-title">Job Listings and Mandates</h1>
      <p className="page-subtitle">Active and historical recruitment mandates. London firm, global placements.</p>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Mandates</div>
          <div className="kpi-value">{listings.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active</div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{active}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Filled</div>
          <div className="kpi-value" style={{ color: 'var(--gold)' }}>{filled}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Retained</div>
          <div className="kpi-value">{retained}</div>
          <div className="kpi-sub">{listings.length - retained} contingency</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Mandates</div>
            <div className="panel-subtitle">{filtered.length} listing{filtered.length !== 1 ? 's' : ''}</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setEditingJob(null) }}>
            + New Mandate
          </button>
        </div>

        {(showForm || editingJob) && (
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24, paddingBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, marginBottom: 16 }}>
              {editingJob ? `Edit — ${editingJob.title}` : 'New Mandate'}
            </div>
            <JobForm
              job={editingJob}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingJob(null) }}
            />
          </div>
        )}

        <div className="search-bar">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterMandateType} onChange={e => setFilterMandateType(e.target.value)}>
            <option value="">All Types</option>
            {MANDATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterRecruiter} onChange={e => setFilterRecruiter(e.target.value)}>
            <option value="">All Recruiters</option>
            {mockStaff.filter(s => s.role === 'recruiter').map(r => (
              <option key={r.id} value={r.id}>{r.full_name}</option>
            ))}
          </select>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Client</th>
                <th>Type</th>
                <th>Recruiter</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Candidates</th>
                <th>Date Posted</th>
                <th>Date Filled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 700 }}>{job.title}</td>
                  <td style={{ fontSize: 12 }}>{job.client_company}</td>
                  <td><span className="badge badge-default">{job.mandate_type}</span></td>
                  <td style={{ fontSize: 12 }}>{getStaffName(job.recruiter_id, mockStaff)}</td>
                  <td><StatusBadge status={job.status} /></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {getCandidateCount(job.id)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(job.date_posted).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {job.date_filled
                      ? new Date(job.date_filled).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '-'
                    }
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-secondary btn-xs" onClick={() => { setEditingJob(job); setShowForm(false) }}>Edit</button>
                      <button className="btn btn-secondary btn-xs">View Pipeline</button>
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
