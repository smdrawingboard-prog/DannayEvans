import React from 'react'

const NAV_ITEMS = [
  { section: 'Dashboard' },
  { id: 'overview', label: 'Overview' },
  { section: 'Recruitment' },
  { id: 'pipeline', label: 'Candidate Pipeline' },
  { id: 'candidates', label: 'Candidate Database' },
  { id: 'jobs', label: 'Job Listings' },
  { section: 'Business Development' },
  { id: 'deals', label: 'Deal Pipeline' },
  { id: 'documents', label: 'Documents' },
  { section: 'Performance' },
  { id: 'recruiter-performance', label: 'Recruiter KPIs' },
  { id: 'sales-performance', label: 'Sales Performance' },
  { section: 'Reports' },
  { id: 'reports', label: 'Reports' },
  { section: 'System' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'settings', label: 'Settings' },
]

export default function Sidebar({ activeSection, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Fate Collab CRM</h1>
        <span>Executive Recruitment — London</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item, idx) => {
          if (item.section) {
            return (
              <div key={`section-${idx}`} className="sidebar-section-label">
                {item.section}
              </div>
            )
          }
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Signed in as</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Eleanor Hartley</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Administrator</div>
      </div>
    </aside>
  )
}
