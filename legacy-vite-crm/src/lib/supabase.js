import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing environment variables. Running in demo mode with mock data.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// ============================================================
// Document Storage Helpers
// ============================================================

/**
 * Upload a document to Supabase Storage and insert a record.
 * Returns the document record or throws.
 */
export async function uploadDocument({ file, documentType, linkedEntityType, linkedEntityId, uploadedById }) {
  if (!supabase) throw new Error('Supabase not configured')

  const ext = file.name.split('.').pop()
  const storagePath = `${linkedEntityType}/${linkedEntityId}/${Date.now()}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('crm-documents')
    .upload(storagePath, file, { contentType: file.type })

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documents')
    .insert({
      file_name: file.name,
      file_type: file.type,
      document_type: documentType,
      storage_path: storagePath,
      linked_entity_type: linkedEntityType,
      linked_entity_id: linkedEntityId,
      uploaded_by: uploadedById,
      file_size_bytes: file.size,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Generate a signed URL for a document (expires 1 hour).
 * Never exposes raw storage URLs.
 */
export async function getDocumentSignedUrl(storagePath) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase.storage
    .from('crm-documents')
    .createSignedUrl(storagePath, 3600) // 1 hour

  if (error) throw error
  return data.signedUrl
}

/**
 * Delete a document from storage and the database record.
 */
export async function deleteDocument(documentId, storagePath) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error: storageError } = await supabase.storage
    .from('crm-documents')
    .remove([storagePath])

  if (storageError) throw storageError

  const { error } = await supabase.from('documents').delete().eq('id', documentId)
  if (error) throw error
}

// ============================================================
// Activity Log
// ============================================================
export async function logActivity({ entityType, entityId, staffId, action, oldValue, newValue }) {
  if (!supabase) return
  await supabase.from('activity_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    staff_id: staffId,
    action,
    old_value: oldValue ? String(oldValue) : null,
    new_value: newValue ? String(newValue) : null,
  })
}

// ============================================================
// Candidates
// ============================================================
export async function fetchCandidates(filters = {}) {
  if (!supabase) return []
  let q = supabase.from('candidates').select('*').order('created_at', { ascending: false })
  if (filters.stage) q = q.eq('stage', filters.stage)
  if (filters.recruiter_id) q = q.eq('recruiter_id', filters.recruiter_id)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function updateCandidateStage(candidateId, newStage, staffId) {
  if (!supabase) return
  const { data: current } = await supabase.from('candidates').select('stage').eq('id', candidateId).single()
  const { error } = await supabase
    .from('candidates')
    .update({ stage: newStage, stage_entered_at: new Date().toISOString() })
    .eq('id', candidateId)
  if (error) throw error
  await logActivity({ entityType: 'candidate', entityId: candidateId, staffId, action: 'stage_change', oldValue: current?.stage, newValue: newStage })
}

// ============================================================
// Deals
// ============================================================
export async function fetchDeals(filters = {}) {
  if (!supabase) return []
  let q = supabase.from('deals').select('*').order('created_at', { ascending: false })
  if (filters.stage) q = q.eq('stage', filters.stage)
  if (filters.sales_rep_id) q = q.eq('sales_rep_id', filters.sales_rep_id)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createDeal(dealData) {
  if (!supabase) return null
  const { data, error } = await supabase.from('deals').insert(dealData).select().single()
  if (error) throw error
  return data
}

export async function updateDeal(dealId, updates, staffId) {
  if (!supabase) return
  const { error } = await supabase.from('deals').update(updates).eq('id', dealId)
  if (error) throw error
  if (updates.stage) {
    await logActivity({ entityType: 'deal', entityId: dealId, staffId, action: 'stage_change', newValue: updates.stage })
  }
}
