import React, { useState, useMemo } from 'react'
import {
  mockCandidates, mockStaff, mockJobListings,
  RECRUITMENT_STAGES, getStaffName, getJobTitle, getDaysInStage
} from '../../data/mockData.js'

const EMPTY_CANDIDATE = {
  full_name: '',
  email: '',
  phone: '',
  linkedin_url: '',
  nationality: '',
  current_title: '',
  current_company: '',
  current_location: '',
  target_role: '',
  target_geography: '',
  job_listing_id: '',
  recruiter_id: '',
  stage: 'New Application',
  source: '',
  gdpr_consent: false,
  right_to_work_checked: false,
  notes: '',
}

function CandidateForm({ candidate, onSave, onCancel }) {
  const [form, setForm] = useState(candidate || EMPTY_CANDIDATE)
  const recruiters = mockStaff.filter(s => s.role === 'recruiter' || s.role === 'admin')

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const canSubmit = form.full_name && form.gdpr_consent

  return (
    <div>
      <div className="form-grid">
        <div className="form-group">
          <label>Full Name *</label>
          <input type="text" value={form.full_name} onChange={e => handleChange('full_name', e.target.value)} placeholder="Thomas Berger" />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} placeholder="thomas.berger@example.com" />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input type="text" value={form.phone} onChange={e => handleChange('phone', e.target.value)} placeholder="+44 7700 900000" />
        </div>
        <div className="form-group">
          <label>LinkedIn URL</label>
          <input type="url" value={form.linkedin_url} onChange={e => handleChange('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/..." />
        </div>
        <div className="form-group">
          <label>Nationality</label>
          <input type="text" value={form.nationality} onChange={e => handleChange('nationality', e.target.value)} placeholder="German" />
        </div>
        <div className="form-group">
          <label>Current Title</label>
          <input type="text" value={form.current_title} onChange={e => handleChange('current_title', e.target.value)} placeholder="General Counsel" />
        </div>
        <div className="form-group">
          <label>Current Company</label>
          <input type="text" value={form.current_company} onChange={e => handleChange('current_company', e.target.value)} placeholder="Frankfurt Wealth Managers" />
        </div>
        <div className="form-group">
          <label>Current Location</label>
          <input type="text" value={form.current_location} onChange={e => handleChange('current_location', e.target.value)} placeholder="Frankfurt, Germany" />
        </div>
        <div className="form-group">
          <label>Target Role</label>
          <input type="text" value={form.target_role} onChange={e => handleChange('target_role', e.target.value)} placeholder="General Counsel / CLO" />
        </div>
        <div className="form-group">
          <label>Target Geography</label>
          <input type="text" value={form.target_geography} onChange={e => handleChange('target_geography', e.target.value)} placeholder="UK, EU, Global" />
        </div>
        <div className="form-group">
          <label>Job Listing</label>
          <select value={form.job_listing_id} onChange={e => handleChange('job_listing_id', e.target.value)}>
            <option value="">None / General Pipeline</option>
            {mockJobListings.map(j => (
              <option key={j.id} value={j.id}>{j.title} — {j.client_company}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Assigned Recruiter</label>
          <select value={form.recruiter_id} onChange={e => handleChange('recruiter_id', e.target.value)}>
            <option value="">Unassigned</option>
            {recruiters.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Pipeline Stage</label>
          <select value={form.stage} onChange={e => handleChange('stage', e.target.value)}>
            {RECRUITMENT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Source</label>
          <input type="text" value={form.source} onChange={e => handleChange('source', e.target.value)} placeholder="LinkedIn / Referral / Inbound" />
        </div>
        <div className="form-group full-width">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => handleChange('notes', e.target.value)} placeholder="Background, motivations, availability..." rows={3} />
        </div>

        {/* GDPR Compliance */}
        <div className="form-group full-width" style={{ background: 'var(--bg-primary)', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, color: 'var(--text-secondary)' }}>
            UK GDPR and GDPR Compliance
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.gdpr_consent}
                onChange={e => handleChange('gdpr_consent', e.target.checked)}
                style={{ width: 'auto', marginTop: 2 }}
              />
              <span>
                I confirm the candidate has given explicit consent for their personal data to be processed for recruitment purposes,
                in accordance with the <a href="#" style={{ color: 'var(--accent)' }}>Privacy Notice</a>.
                Lawful basis: legitimate interest or consent. Data retained for 2 years from last activity. *
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.right_to_work_checked}
                onChange={e => handleChange('right_to_work_checked', e.target.checked)}
                style={{ width: 'auto', marginTop: 2 }}
              />
              <span>
                Right to work check completed (UK Home Office compliant).
                For non-UK candidates: Standard Contractual Clauses apply for data transfers outside UK/EEA.
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={!canSubmit} onClick={() => onSave(form)}>
          {candidate ? 'Save Changes' : 'Add Candidate'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function CandidateDatabase() {
  const [candidates, setCandidates] = useState(mockCandidates)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterRecruiter, setFilterRecruiter] = useState('')
  const [filterNationality, setFilterNationality] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCandidate, setEditingCandidate] = useState(null)

  const nationalities = [...new Set(mockCandidates.map(c => c.nationality).filter(Boolean))].sort()

  const filtered = useMemo(() => {
    return candidates.filter(c => {
      if (filterStage && c.stage !== filterStage) return false
      if (filterRecruiter && c.recruiter_id !== filterRecruiter) return false
      if (filterNationality && c.nationality !== filterNationality) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          c.full_name.toLowerCase().includes(q) ||
          c.current_title?.toLowerCase().includes(q) ||
          c.current_company?.toLowerCase().includes(q) ||
          c.current_location?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [candidates, filterStage, filterRecruiter, filterNationality, search])

  function handleSave(form) {
    if (editingCandidate) {
      setCandidates(prev => prev.map(c => c.id === editingCandidate.id ? { ...c, ...form } : c))
    } else {
      setCandidates(prev => [{
        ...form,
        id: `c${Date.now()}`,
        stage_entered_at: new Date().toISOString(),
        created_at: new Date().toISOString().split('T')[0],
      }, ...prev])
    }
    setShowForm(false)
    setEditingCandidate(null)
  }

  return (
    <div>
      <h1 className="page-title">Candidate Database</h1>
      <p className="page-subtitle">Full searchable database of all executive candidates across all stages. Global talent pool.</p>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">All Candidates</div>
            <div className="panel-subtitle">{filtered.length} of {candidates.length} candidates</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setEditingCandidate(null) }}>
            + Add Candidate
          </button>
        </div>

        {(showForm || editingCandidate) && (
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24, paddingBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, marginBottom: 16 }}>
              {editingCandidate ? `Edit — ${editingCandidate.full_name}` : 'New Candidate'}
            </div>
            <CandidateForm
              candidate={editingCandidate}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingCandidate(null) }}
            />
          </div>
        )}

        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search name, role, company, location, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="">All Stages</option>
            {RECRUITMENT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterRecruiter} onChange={e => setFilterRecruiter(e.target.value)}>
            <option value="">All Recruiters</option>
            {mockStaff.filter(s => s.role === 'recruiter').map(s => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
          <select value={filterNationality} onChange={e => setFilterNationality(e.target.value)}>
            <option value="">All Nationalities</option>
            {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Nationality</th>
                <th>Current Role</th>
                <th>Location</th>
                <th>Target Role</th>
                <th>Stage</th>
                <th>Recruiter</th>
                <th>Source</th>
                <th>GDPR</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{c.full_name}</div>
                    {c.email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}</div>}
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)' }}>LinkedIn</a>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{c.nationality}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{c.current_title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{c.current_company}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{c.current_location}</td>
                  <td style={{ fontSize: 12 }}>{c.target_role}</td>
                  <td>
                    <span className={`badge ${c.stage === 'Placed' ? 'badge-gold' : c.stage === 'Rejected / Withdrawn' ? 'badge-danger' : c.stage === 'Offer Extended' ? 'badge-success' : 'badge-default'}`}>
                      {c.stage}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{getStaffName(c.recruiter_id, mockStaff)}</td>
                  <td style={{ fontSize: 11 }}><span className="badge badge-muted">{c.source}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    {c.gdpr_consent
                      ? <span className="badge badge-success">Yes</span>
                      : <span className="badge badge-danger">No</span>
                    }
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(c.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-secondary btn-xs" onClick={() => { setEditingCandidate(c); setShowForm(false) }}>Edit</button>
                      <button className="btn btn-secondary btn-xs">Docs</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-state">
                      <div className="empty-state-title">No candidates found</div>
                      Adjust your filters or add a new candidate.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
