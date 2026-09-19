import React, { useState } from 'react'
import { runSync } from '../../lib/integrations.js'
import { mockDeals, mockCandidates } from '../../data/mockData.js'

const DEFAULT_INTEGRATIONS = [
  {
    name: 'LinkedIn Sales Navigator',
    description: 'Import leads from Sales Navigator directly into the deal pipeline. Requires Enterprise or Advanced plan with API access.',
    enabled: false,
    sync_direction: 'pull',
    config: { access_token: '', apify_fallback: true },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
  {
    name: 'HubSpot',
    description: 'Sync deals bidirectionally with HubSpot CRM. Push deal stage changes and pull contact updates.',
    enabled: false,
    sync_direction: 'bidirectional',
    config: { access_token: '' },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
  {
    name: 'Salesforce',
    description: 'Sync opportunities and contacts with Salesforce. Maps to Opportunity records using Recruitment record type.',
    enabled: false,
    sync_direction: 'bidirectional',
    config: { access_token: '', instance_url: '', record_type_id: '' },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
  {
    name: 'Pipedrive',
    description: 'Push deals to Pipedrive pipeline. Maps deal stages to Pipedrive pipeline stages.',
    enabled: false,
    sync_direction: 'push',
    config: { api_token: '' },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
  {
    name: 'Bullhorn',
    description: 'Sync candidate records with Bullhorn ATS. Specialist recruitment CRM. Maps candidate stages and source fields.',
    enabled: false,
    sync_direction: 'bidirectional',
    config: { bullhorn_url: '', username: '', client_id: '', client_secret: '' },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
  {
    name: 'Apify',
    description: 'Fallback scraper for LinkedIn Sales Navigator, job listing enrichment, and candidate profile data.',
    enabled: false,
    sync_direction: 'pull',
    config: { api_token: '' },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
  {
    name: 'SendGrid',
    description: 'Email notifications for key CRM events: offer extended, mandate signed, weekly report, stale candidate alerts.',
    enabled: false,
    sync_direction: 'push',
    config: { api_key: '', from_email: 'crm@firm.co.uk', from_name: 'Recruitment CRM' },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
  {
    name: 'WhatsApp',
    description: 'WhatsApp notifications via Meta Cloud API. Optional channel for mobile alerts alongside email.',
    enabled: false,
    sync_direction: 'push',
    config: { api_token: '', phone_number_id: '' },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_records: 0,
    last_sync_errors: 0,
    syncLog: [],
  },
]

const CONFIG_LABELS = {
  access_token: 'Access Token',
  api_token: 'API Token',
  api_key: 'API Key',
  instance_url: 'Instance URL',
  record_type_id: 'Record Type ID',
  bullhorn_url: 'Bullhorn REST URL',
  username: 'Username',
  client_id: 'Client ID',
  client_secret: 'Client Secret',
  from_email: 'From Email',
  from_name: 'From Name',
  phone_number_id: 'Phone Number ID',
  apify_fallback: null, // rendered as checkbox
}

const SECRET_FIELDS = new Set(['access_token', 'api_token', 'api_key', 'client_secret'])

function IntegrationCard({ integration, onToggle, onUpdate, onSync }) {
  const [expanded, setExpanded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [localConfig, setLocalConfig] = useState(integration.config)

  function handleConfigChange(key, value) {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    onUpdate(integration.name, { config: localConfig })
    setExpanded(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const results = await runSync(integration.name, integration, {
        deals: mockDeals,
        candidates: mockCandidates,
      })
      const logEntry = {
        timestamp: new Date().toLocaleString('en-GB'),
        status: results.errors === 0 ? 'Success' : 'Partial',
        records: results.synced,
        errors: results.errors,
        messages: results.errorMessages,
      }
      onUpdate(integration.name, {
        last_synced_at: new Date().toISOString(),
        last_sync_status: logEntry.status,
        last_sync_records: results.synced,
        last_sync_errors: results.errors,
        syncLog: [logEntry, ...(integration.syncLog || [])].slice(0, 10),
      })
    } catch (e) {
      onUpdate(integration.name, {
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'Error',
        last_sync_errors: 1,
        syncLog: [
          { timestamp: new Date().toLocaleString('en-GB'), status: 'Error', records: 0, errors: 1, messages: [e.message] },
          ...(integration.syncLog || [])
        ].slice(0, 10),
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className={`integration-card ${integration.enabled ? 'enabled' : ''}`}>
      <div style={{ flex: 1 }}>
        <div className="flex-between">
          <div>
            <div className="integration-name">{integration.name}</div>
            <div className="integration-status">{integration.description}</div>
          </div>
          <div className="flex-center gap-8" style={{ gap: 12 }}>
            {integration.last_synced_at && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                <div>Last sync: {new Date(integration.last_synced_at).toLocaleString('en-GB')}</div>
                <div>
                  <span style={{ color: integration.last_sync_status === 'Success' ? 'var(--success)' : 'var(--danger)' }}>
                    {integration.last_sync_status}
                  </span>
                  {' — '}{integration.last_sync_records} records
                  {integration.last_sync_errors > 0 && `, ${integration.last_sync_errors} errors`}
                </div>
              </div>
            )}
            <div className="toggle-wrap">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={integration.enabled}
                  onChange={() => onToggle(integration.name)}
                />
                <span className="toggle-slider"></span>
              </label>
              <span style={{ fontSize: 12, color: integration.enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                {integration.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        {integration.enabled && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(e => !e)}>
              {expanded ? 'Hide Settings' : 'Configure'}
            </button>
            {integration.sync_direction !== 'pull' || integration.name === 'LinkedIn Sales Navigator' ? (
              <button className="btn btn-secondary btn-sm" disabled={syncing} onClick={handleSync}>
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            ) : null}
          </div>
        )}

        {integration.enabled && expanded && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
              Configuration
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Sync Direction</label>
              <select
                value={integration.sync_direction}
                onChange={e => onUpdate(integration.name, { sync_direction: e.target.value })}
                style={{ marginTop: 4 }}
              >
                <option value="push">Push only (CRM to external)</option>
                <option value="pull">Pull only (external to CRM)</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </div>
            <div className="form-grid">
              {Object.entries(localConfig).map(([key, value]) => {
                const label = CONFIG_LABELS[key]
                if (label === null) return null
                if (typeof value === 'boolean') {
                  return (
                    <div key={key} className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={e => handleConfigChange(key, e.target.checked)}
                          style={{ width: 'auto' }}
                        />
                        Use Apify as fallback when LinkedIn API is unavailable
                      </label>
                    </div>
                  )
                }
                return (
                  <div key={key} className="form-group">
                    <label>{label || key}</label>
                    <input
                      type={SECRET_FIELDS.has(key) ? 'password' : 'text'}
                      value={value}
                      onChange={e => handleConfigChange(key, e.target.value)}
                      placeholder={SECRET_FIELDS.has(key) ? '••••••••••••••••' : ''}
                    />
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              API keys are stored securely. In production, tokens are held in Supabase Vault and never exposed in the frontend.
            </div>
            <div className="form-actions">
              <button className="btn btn-primary btn-sm" onClick={handleSave}>Save Configuration</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Sync Log */}
        {integration.enabled && integration.syncLog?.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Sync Log
            </div>
            {integration.syncLog.slice(0, 3).map((entry, i) => (
              <div key={i} className="sync-log-entry">
                [{entry.timestamp}]
                {' '}<span style={{ color: entry.status === 'Success' ? 'var(--success)' : 'var(--danger)' }}>{entry.status}</span>
                {' '}— {entry.records} records synced
                {entry.errors > 0 && <span style={{ color: 'var(--danger)' }}>, {entry.errors} error{entry.errors !== 1 ? 's' : ''}</span>}
                {entry.messages?.length > 0 && (
                  <div style={{ color: 'var(--danger)', marginTop: 2 }}>{entry.messages[0]}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Integrations() {
  const [integrations, setIntegrations] = useState(DEFAULT_INTEGRATIONS)

  function handleToggle(name) {
    setIntegrations(prev => prev.map(i => i.name === name ? { ...i, enabled: !i.enabled } : i))
  }

  function handleUpdate(name, updates) {
    setIntegrations(prev => prev.map(i => i.name === name ? { ...i, ...updates } : i))
  }

  const enabledCount = integrations.filter(i => i.enabled).length

  return (
    <div>
      <h1 className="page-title">Integrations</h1>
      <p className="page-subtitle">
        Connect external platforms. All integrations are opt-in.
        API tokens are stored in Supabase Vault — never in the frontend code or browser storage.
      </p>

      {enabledCount > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 24 }}>
          {enabledCount} integration{enabledCount !== 1 ? 's' : ''} enabled.
          Data transfers to third parties outside the UK/EEA are subject to Standard Contractual Clauses (SCCs) under UK GDPR.
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
          Sourcing and Lead Generation
        </div>
        {integrations.filter(i => ['LinkedIn Sales Navigator', 'Apify'].includes(i.name)).map(integration => (
          <IntegrationCard
            key={integration.name}
            integration={integration}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
          />
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
          CRM Platforms
        </div>
        {integrations.filter(i => ['HubSpot', 'Salesforce', 'Pipedrive', 'Bullhorn'].includes(i.name)).map(integration => (
          <IntegrationCard
            key={integration.name}
            integration={integration}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
          />
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
          Notifications
        </div>
        {integrations.filter(i => ['SendGrid', 'WhatsApp'].includes(i.name)).map(integration => (
          <IntegrationCard
            key={integration.name}
            integration={integration}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
          />
        ))}
      </div>

      <div className="panel" style={{ background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>UK GDPR Data Transfer Notice</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          When enabling integrations that transfer personal data to third-party platforms outside the UK or EEA
          (such as HubSpot, Salesforce, Pipedrive, or Bullhorn), ensure Standard Contractual Clauses (SCCs)
          are in place with each processor. Review your Data Processing Agreement (DPA) with each vendor before enabling.
          All personal data transfers are subject to UK GDPR Article 46 and the ICO adequacy guidance.
        </p>
      </div>
    </div>
  )
}
