import React, { useState, useRef, useMemo } from 'react'
import { mockDocuments, mockCandidates, mockDeals, mockStaff, getStaffName } from '../../data/mockData.js'

const ACCEPTED_TYPES = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg'
const MAX_SIZE_BYTES = 25 * 1024 * 1024 // 25MB
const DOC_TYPES = ['CV', 'Cover Letter', 'Assessment', 'Reference', 'Contract', 'Proposal', 'Other']

function formatBytes(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getEntityLabel(type, id) {
  if (type === 'candidate') {
    const c = mockCandidates.find(x => x.id === id)
    return c ? `${c.full_name} (Candidate)` : id
  }
  if (type === 'deal') {
    const d = mockDeals.find(x => x.id === id)
    return d ? `${d.company_name} (Deal)` : id
  }
  return id
}

function UploadZone({ onFilesSelected }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    onFilesSelected(files)
  }

  function handleFileInput(e) {
    const files = Array.from(e.target.files)
    onFilesSelected(files)
    e.target.value = ''
  }

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
    >
      <div className="upload-zone-title">Drag and drop files here, or click to select</div>
      <div className="upload-zone-sub">
        Accepted: PDF, DOCX, XLSX, PNG, JPG — Maximum 25 MB per file
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  )
}

function UploadModal({ files, onClose, onConfirm }) {
  const [assignments, setAssignments] = useState(
    files.map(f => ({
      file: f,
      documentType: 'CV',
      linkedEntityType: 'candidate',
      linkedEntityId: '',
      error: f.size > MAX_SIZE_BYTES ? 'File exceeds 25 MB limit' : null,
    }))
  )

  function updateAssignment(idx, field, value) {
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  const allValid = assignments.every(a => !a.error && a.linkedEntityId)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload {files.length} Document{files.length !== 1 ? 's' : ''}</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          {assignments.map((assignment, idx) => (
            <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>{assignment.file.name}</div>
              {assignment.error && <div className="alert alert-danger">{assignment.error}</div>}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label>Document Type</label>
                  <select value={assignment.documentType} onChange={e => updateAssignment(idx, 'documentType', e.target.value)}>
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Link To</label>
                  <select value={assignment.linkedEntityType} onChange={e => updateAssignment(idx, 'linkedEntityType', e.target.value)}>
                    <option value="candidate">Candidate</option>
                    <option value="deal">Deal</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{assignment.linkedEntityType === 'candidate' ? 'Candidate' : 'Deal'}</label>
                  <select
                    value={assignment.linkedEntityId}
                    onChange={e => updateAssignment(idx, 'linkedEntityId', e.target.value)}
                  >
                    <option value="">Select...</option>
                    {assignment.linkedEntityType === 'candidate'
                      ? mockCandidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)
                      : mockDeals.map(d => <option key={d.id} value={d.id}>{d.company_name} — {d.role_being_filled}</option>)
                    }
                  </select>
                </div>
              </div>
            </div>
          ))}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={!allValid} onClick={() => onConfirm(assignments)}>
              Upload {assignments.filter(a => !a.error).length} Document{assignments.length !== 1 ? 's' : ''}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
          <div className="gdpr-note">
            Documents are stored securely in Supabase Storage. Access via signed URLs that expire after 1 hour.
            Never expose raw storage paths. Subject to UK GDPR data retention policies.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DocumentManager() {
  const [documents, setDocuments] = useState(mockDocuments)
  const [pendingFiles, setPendingFiles] = useState(null)
  const [filterEntityType, setFilterEntityType] = useState('')
  const [filterDocType, setFilterDocType] = useState('')
  const [search, setSearch] = useState('')
  const [notification, setNotification] = useState(null)

  const filtered = useMemo(() => {
    return documents.filter(doc => {
      if (filterEntityType && doc.linked_entity_type !== filterEntityType) return false
      if (filterDocType && doc.document_type !== filterDocType) return false
      if (search && !doc.file_name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [documents, filterEntityType, filterDocType, search])

  function handleFilesSelected(files) {
    setPendingFiles(files)
  }

  function handleUploadConfirm(assignments) {
    const newDocs = assignments
      .filter(a => !a.error && a.linkedEntityId)
      .map(a => ({
        id: `doc${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file_name: a.file.name,
        file_type: a.file.type,
        document_type: a.documentType,
        storage_path: `${a.linkedEntityType}/${a.linkedEntityId}/${Date.now()}_${a.file.name}`,
        linked_entity_type: a.linkedEntityType,
        linked_entity_id: a.linkedEntityId,
        uploaded_by: 's1',
        file_size_bytes: a.file.size,
        created_at: new Date().toISOString().split('T')[0],
      }))

    setDocuments(prev => [...newDocs, ...prev])
    setPendingFiles(null)
    setNotification(`${newDocs.length} document${newDocs.length !== 1 ? 's' : ''} uploaded successfully.`)
    setTimeout(() => setNotification(null), 4000)
  }

  function handleDelete(docId) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  function handleView(doc) {
    // In production: call getDocumentSignedUrl(doc.storage_path) and open in new tab
    alert(`In production: generates a signed URL (1 hour expiry) for ${doc.file_name} and opens securely. Raw storage paths are never exposed.`)
  }

  return (
    <div>
      <h1 className="page-title">Documents</h1>
      <p className="page-subtitle">Upload and manage documents linked to candidate and deal records.</p>

      {notification && <div className="alert alert-success">{notification}</div>}

      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 16 }}>Upload Documents</div>
        <UploadZone onFilesSelected={handleFilesSelected} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Document Library</div>
            <div className="panel-subtitle">{filtered.length} document{filtered.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by filename..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}>
            <option value="">All Records</option>
            <option value="candidate">Candidates</option>
            <option value="deal">Deals</option>
          </select>
          <select value={filterDocType} onChange={e => setFilterDocType(e.target.value)}>
            <option value="">All Types</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Type</th>
                <th>Linked To</th>
                <th>Uploaded By</th>
                <th>Size</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.file_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {doc.file_type}
                    </div>
                  </td>
                  <td><span className="badge badge-accent">{doc.document_type}</span></td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: 11 }}>
                      {doc.linked_entity_type}
                    </div>
                    <div>{getEntityLabel(doc.linked_entity_type, doc.linked_entity_id)}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{getStaffName(doc.uploaded_by, mockStaff)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatBytes(doc.file_size_bytes)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(doc.created_at)}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-secondary btn-xs" onClick={() => handleView(doc)}>View</button>
                      <button className="btn btn-secondary btn-xs">Download</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(doc.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-title">No documents found</div>
                      Upload documents using the zone above.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingFiles && (
        <UploadModal
          files={pendingFiles}
          onClose={() => setPendingFiles(null)}
          onConfirm={handleUploadConfirm}
        />
      )}
    </div>
  )
}
