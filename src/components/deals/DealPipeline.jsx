import React, { useState, useMemo } from 'react'
import {
  mockDeals, mockStaff, SALES_STAGES, STAGE_PROBABILITY, formatGBP, getStaffName
} from '../../data/mockData.js'
import { fetchSalesNavLeads, mapLeadToDeal, isLeadDuplicate } from '../../lib/linkedin.js'

const MANDATE_TYPES = ['Retained', 'Contingency', 'RPO']
const SOURCES = ['LinkedIn Sales Navigator', 'Referral', 'Inbound', 'Cold Email', 'Event', 'Other']

const EMPTY_DEAL = {
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_linkedin_url: '',
  mandate_type: 'Retained',
  role_being_filled: '',
  estimated_fee_gbp: '',
  stage: 'Lead Identified',
  probability_pct: 10,
  expected_close_date: '',
  sales_rep_id: '',
  notes: '',
  source: 'Inbound',
}

function DealForm({ deal, onSave, onCancel, salesReps }) {
  const [form, setForm] = useState(deal || EMPTY_DEAL)

  function handleChange(field, value) {
    const updates = { [field]: value }
    if (field === 'stage') {
      updates.probability_pct = STAGE_PROBABILITY[value] ?? form.probability_pct
    }
    setForm(prev => ({ ...prev, ...updates }))
  }

  return (
    <div>
      <div className="form-grid">
        <div className="form-group">
          <label>Company Name *</label>
          <input type="text" value={form.company_name} onChange={e => handleChange('company_name', e.target.value)} placeholder="Stonehouse Asset Management" />
        </div>
        <div className="form-group">
          <label>Contact Name</label>
          <input type="text" value={form.contact_name} onChange={e => handleChange('contact_name', e.target.value)} placeholder="Richard Hargreaves" />
        </div>
        <div className="form-group">
          <label>Contact Email</label>
          <input type="email" value={form.contact_email} onChange={e => handleChange('contact_email', e.target.value)} placeholder="r.hargreaves@stonehouse.co.uk" />
        </div>
        <div className="form-group">
          <label>Contact LinkedIn URL</label>
          <input type="url" value={form.contact_linkedin_url} onChange={e => handleChange('contact_linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/..." />
        </div>
        <div className="form-group">
          <label>Deal Type</label>
          <select value={form.mandate_type} onChange={e => handleChange('mandate_type', e.target.value)}>
            {MANDATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Role Being Filled</label>
          <input type="text" value={form.role_being_filled} onChange={e => handleChange('role_being_filled', e.target.value)} placeholder="Managing Director APAC" />
        </div>
        <div className="form-group">
          <label>Estimated Fee (GBP)</label>
          <input type="number" value={form.estimated_fee_gbp} onChange={e => handleChange('estimated_fee_gbp', e.target.value)} placeholder="125000" min="0" />
        </div>
        <div className="form-group">
          <label>Pipeline Stage</label>
          <select value={form.stage} onChange={e => handleChange('stage', e.target.value)}>
            {SALES_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Probability %</label>
          <input type="number" value={form.probability_pct} onChange={e => handleChange('probability_pct', parseInt(e.target.value))} min="0" max="100" />
        </div>
        <div className="form-group">
          <label>Expected Close Date</label>
          <input type="date" value={form.expected_close_date} onChange={e => handleChange('expected_close_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Assigned Sales Rep</label>
          <select value={form.sales_rep_id} onChange={e => handleChange('sales_rep_id', e.target.value)}>
            <option value="">Select rep...</option>
            {salesReps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Source</label>
          <select value={form.source} onChange={e => handleChange('source', e.target.value)}>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group full-width">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => handleChange('notes', e.target.value)} placeholder="Context, relationship history, next steps..." rows={3} />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={() => onSave(form)}>
          {deal ? 'Save Changes' : 'Add Deal'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function PipelineSummaryBar({ deals }) {
  const stageValues = SALES_STAGES.filter(s => s !== 'Lost / No Decision').map(stage => {
    const stageDeals = deals.filter(d => d.stage === stage && !d.outcome)
    const value = stageDeals.reduce((s, d) => s + (d.estimated_fee_gbp || 0), 0)
    return { stage, value, count: stageDeals.length }
  })
  const total = stageValues.reduce((s, x) => s + x.value, 0)

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
        Pipeline by Stage — Total {formatGBP(total)}
      </div>
      <div className="pipeline-bar">
        {stageValues.map(({ stage, value, count }) => (
          <div key={stage} className="pipeline-bar-segment" style={{ flex: Math.max(value, 1) }}>
            <div className="pipeline-bar-label" title={stage}>{stage.split(' ').slice(0, 2).join(' ')}</div>
            <div className="pipeline-bar-value">{value > 0 ? formatGBP(value) : <span style={{ color: 'var(--text-muted)' }}>-</span>}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkedInImportModal({ onClose, existingDeals, onImport }) {
  const [loading, setLoading] = useState(false)
  const [stagedLeads, setStagedLeads] = useState([])
  const [selected, setSelected] = useState([])
  const [error, setError] = useState(null)

  async function handleFetch() {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSalesNavLeads()
      const mapped = result.elements.map(mapLeadToDeal)
      const deduped = mapped.map(lead => ({
        ...lead,
        isDuplicate: isLeadDuplicate(lead, existingDeals),
      }))
      setStagedLeads(deduped)
      setSelected(deduped.filter(l => !l.isDuplicate).map((_, i) => i))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(idx) {
    setSelected(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Import from LinkedIn Sales Navigator</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          {!stagedLeads.length && (
            <div>
              <p style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                Fetches saved leads from LinkedIn Sales Navigator and imports them into the deal pipeline.
                Duplicate leads (matched by email or LinkedIn URL) are flagged automatically.
              </p>
              {error && <div className="alert alert-danger">{error}</div>}
              <button className="btn btn-primary" onClick={handleFetch} disabled={loading}>
                {loading ? 'Fetching leads...' : 'Fetch Leads from Sales Navigator'}
              </button>
            </div>
          )}
          {stagedLeads.length > 0 && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                {stagedLeads.length} leads fetched. {stagedLeads.filter(l => l.isDuplicate).length} flagged as duplicates.
                Select leads to import.
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>Company</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Source</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagedLeads.map((lead, idx) => (
                      <tr key={idx} style={{ opacity: lead.isDuplicate ? 0.5 : 1 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(idx)}
                            onChange={() => toggleSelect(idx)}
                            disabled={lead.isDuplicate}
                          />
                        </td>
                        <td>{lead.company_name}</td>
                        <td>{lead.contact_name}</td>
                        <td style={{ fontSize: 12 }}>{lead.contact_email || '-'}</td>
                        <td><span className="badge badge-accent">Sales Navigator</span></td>
                        <td>
                          {lead.isDuplicate
                            ? <span className="badge badge-warning">Duplicate</span>
                            : <span className="badge badge-success">New</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => onImport(selected.map(i => stagedLeads[i]))}
                  disabled={selected.length === 0}
                >
                  Import {selected.length} Lead{selected.length !== 1 ? 's' : ''}
                </button>
                <button className="btn btn-secondary" onClick={() => setSelected(stagedLeads.filter(l => !l.isDuplicate).map((_, i) => i))}>
                  Select All New
                </button>
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DealPipeline() {
  const [deals, setDeals] = useState(mockDeals)
  const [showForm, setShowForm] = useState(false)
  const [editingDeal, setEditingDeal] = useState(null)
  const [filterStage, setFilterStage] = useState('')
  const [filterRep, setFilterRep] = useState('')
  const [showLinkedIn, setShowLinkedIn] = useState(false)
  const [notification, setNotification] = useState(null)

  const salesReps = mockStaff.filter(s => s.role === 'sales_rep')

  const filtered = useMemo(() => {
    return deals.filter(d => {
      if (filterStage && d.stage !== filterStage) return false
      if (filterRep && d.sales_rep_id !== filterRep) return false
      return true
    })
  }, [deals, filterStage, filterRep])

  function handleSaveDeal(form) {
    if (editingDeal) {
      setDeals(prev => prev.map(d => d.id === editingDeal.id ? { ...d, ...form } : d))
    } else {
      setDeals(prev => [{
        ...form,
        id: `d${Date.now()}`,
        estimated_fee_gbp: parseFloat(form.estimated_fee_gbp) || 0,
        probability_pct: parseInt(form.probability_pct) || 10,
      }, ...prev])
    }
    setShowForm(false)
    setEditingDeal(null)
  }

  function handleMarkWon(deal) {
    setDeals(prev => prev.map(d =>
      d.id === deal.id ? { ...d, outcome: 'Won', actual_close_date: new Date().toISOString().split('T')[0], stage: 'Retained Mandate Signed' } : d
    ))
    notify(`Deal marked as Won — ${deal.company_name} ${formatGBP(deal.estimated_fee_gbp)}`)
  }

  function handleMarkLost(deal) {
    setDeals(prev => prev.map(d =>
      d.id === deal.id ? { ...d, outcome: 'Lost', actual_close_date: new Date().toISOString().split('T')[0], stage: 'Lost / No Decision' } : d
    ))
  }

  function handleLinkedInImport(leads) {
    const newDeals = leads.map(l => ({
      ...l,
      id: `d${Date.now()}-${Math.random().toString(36).slice(2)}`,
      estimated_fee_gbp: 0,
    }))
    setDeals(prev => [...newDeals, ...prev])
    setShowLinkedIn(false)
    notify(`${leads.length} lead${leads.length !== 1 ? 's' : ''} imported from LinkedIn Sales Navigator`)
  }

  function notify(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  return (
    <div>
      <h1 className="page-title">Deal Pipeline</h1>
      <p className="page-subtitle">Business development — from lead to retained mandate. Currency: GBP.</p>

      {notification && <div className="alert alert-success">{notification}</div>}

      <PipelineSummaryBar deals={deals} />

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Deals</div>
            <div className="panel-subtitle">{filtered.length} deal{filtered.length !== 1 ? 's' : ''} shown</div>
          </div>
          <div className="flex gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowLinkedIn(true)}>
              Import from Sales Navigator
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setEditingDeal(null) }}>
              + Add Deal
            </button>
          </div>
        </div>

        {(showForm || editingDeal) && (
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24, paddingBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, marginBottom: 16 }}>
              {editingDeal ? `Edit — ${editingDeal.company_name}` : 'New Deal'}
            </div>
            <DealForm
              deal={editingDeal}
              salesReps={salesReps}
              onSave={handleSaveDeal}
              onCancel={() => { setShowForm(false); setEditingDeal(null) }}
            />
          </div>
        )}

        <div className="search-bar">
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="">All Stages</option>
            {SALES_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterRep} onChange={e => setFilterRep(e.target.value)}>
            <option value="">All Reps</option>
            {salesReps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Fee (GBP)</th>
                <th>Stage</th>
                <th style={{ textAlign: 'right' }}>Prob.</th>
                <th>Close Date</th>
                <th>Rep</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(deal => (
                <tr key={deal.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{deal.company_name}</div>
                    {deal.outcome && (
                      <span className={`badge ${deal.outcome === 'Won' ? 'badge-success' : 'badge-danger'}`}>
                        {deal.outcome}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{deal.contact_name}</div>
                    {deal.contact_linkedin_url && (
                      <a href={deal.contact_linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)' }}>LinkedIn</a>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{deal.role_being_filled}</td>
                  <td><span className="badge badge-default">{deal.mandate_type}</span></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {formatGBP(deal.estimated_fee_gbp)}
                  </td>
                  <td style={{ fontSize: 12 }}>{deal.stage}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {deal.probability_pct}%
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {deal.expected_close_date || '-'}
                  </td>
                  <td style={{ fontSize: 12 }}>{getStaffName(deal.sales_rep_id, mockStaff)}</td>
                  <td style={{ fontSize: 11 }}>
                    <span className="badge badge-default">{deal.source}</span>
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-secondary btn-xs" onClick={() => { setEditingDeal(deal); setShowForm(false) }}>Edit</button>
                      {!deal.outcome && (
                        <>
                          <button className="btn btn-success btn-xs" onClick={() => handleMarkWon(deal)}>Won</button>
                          <button className="btn btn-danger btn-xs" onClick={() => handleMarkLost(deal)}>Lost</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showLinkedIn && (
        <LinkedInImportModal
          existingDeals={deals}
          onClose={() => setShowLinkedIn(false)}
          onImport={handleLinkedInImport}
        />
      )}
    </div>
  )
}
