import React, { useState } from 'react'
import { mockStaff } from '../../data/mockData.js'

export default function Settings() {
  const [staff, setStaff] = useState(mockStaff)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'recruiter' })
  const [saved, setSaved] = useState(false)

  function handleAddStaff() {
    if (!form.full_name || !form.email) return
    setStaff(prev => [...prev, { ...form, id: `s${Date.now()}`, active: true }])
    setForm({ full_name: '', email: '', role: 'recruiter' })
    setShowForm(false)
  }

  function handleDeactivate(id) {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s))
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Manage staff accounts, system configuration, and data compliance.</p>

      {/* Staff Management */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Staff and Users</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>
            + Add Staff
          </button>
        </div>

        {showForm && (
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="admin">Admin</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="sales_rep">Sales Rep</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary btn-sm" onClick={handleAddStaff}>Add</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 700 }}>{s.full_name}</td>
                  <td style={{ fontSize: 12 }}>{s.email}</td>
                  <td>
                    <span className={`badge ${s.role === 'admin' ? 'badge-accent' : s.role === 'recruiter' ? 'badge-default' : 'badge-success'}`}>
                      {s.role === 'sales_rep' ? 'Sales Rep' : s.role.charAt(0).toUpperCase() + s.role.slice(1)}
                    </span>
                  </td>
                  <td>
                    {s.active
                      ? <span className="badge badge-success">Active</span>
                      : <span className="badge badge-muted">Inactive</span>
                    }
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-xs" onClick={() => handleDeactivate(s.id)}>
                      {s.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Configuration */}
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 16 }}>System Configuration</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Firm Name</label>
            <input type="text" defaultValue="Fate Collab Recruitment" />
          </div>
          <div className="form-group">
            <label>Base Currency</label>
            <select defaultValue="GBP">
              <option value="GBP">GBP — British Pound</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="AED">AED — UAE Dirham</option>
            </select>
          </div>
          <div className="form-group">
            <label>Client Location</label>
            <input type="text" defaultValue="London, UK" />
          </div>
          <div className="form-group">
            <label>Weekly Report Day</label>
            <select defaultValue="Monday">
              <option>Monday</option>
              <option>Friday</option>
            </select>
          </div>
          <div className="form-group">
            <label>Report Time (GMT)</label>
            <input type="text" defaultValue="09:00" />
          </div>
          <div className="form-group">
            <label>Admin Email</label>
            <input type="email" defaultValue="e.hartley@firm.co.uk" />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={() => setSaved(true)}>Save Configuration</button>
        </div>
        {saved && <div className="alert alert-success" style={{ marginTop: 16 }}>Configuration saved.</div>}
      </div>

      {/* GDPR / UK GDPR Settings */}
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 8 }}>Data Protection and Compliance</div>
        <div className="panel-subtitle" style={{ marginBottom: 20 }}>UK GDPR and GDPR settings for candidate data handling</div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Data Retention Period</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Candidate personal data is retained for 2 years from last activity, then automatically purged.
              Lawful basis: legitimate interest or explicit consent.
            </div>
            <select defaultValue="24" style={{ width: 200 }}>
              <option value="12">12 months</option>
              <option value="24">24 months (default)</option>
              <option value="36">36 months</option>
            </select>
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Right to Erasure</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Candidates may request erasure of their personal data by emailing privacy@firm.co.uk.
              Requests are processed within 30 days as required by UK GDPR Article 17.
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>International Data Transfers</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Candidate data transferred outside the UK/EEA is covered by Standard Contractual Clauses (SCCs).
              Adequacy decisions apply to: EU member states, EEA, and ICO-approved countries.
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Privacy Notice URL</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Displayed on all candidate-facing forms. Required before any personal data is collected.
            </div>
            <input type="url" defaultValue="https://firm.co.uk/privacy" style={{ width: 400 }} />
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>UK Home Office Right to Work</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Right to work checks are required for candidates being placed in UK roles.
              All checks are recorded with date on the candidate record and must comply with current Home Office guidance.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
