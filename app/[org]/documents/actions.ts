'use server'

import { revalidatePath } from 'next/cache'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface UploadResult {
  error?: string
  ok?: string
}

const BUCKET = 'recruitment-files'
const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
])

/** Keep the stored name printable and free of path separators. */
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file'
}

/**
 * Store a file against a candidate, client or role.
 *
 * The taxonomy rules — post-offer only, special personal information, the s27
 * justification — are enforced by a database trigger. This inserts the row
 * first and only uploads the bytes once the row is accepted, so a document
 * the agency is not entitled to hold never reaches storage at all.
 */
export async function uploadDocument(
  orgSlug: string,
  _prev: UploadResult,
  form: FormData,
): Promise<UploadResult> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: `"${file.name}" is larger than 25 MB.` }
  }
  if (!ALLOWED.has(file.type)) {
    return { error: `"${file.name}" is not a PDF, Word, Excel or image file.` }
  }

  const documentType = String(form.get('documentType') ?? '').trim()
  const subjectType = String(form.get('subjectType') ?? '').trim()
  const subjectId = String(form.get('subjectId') ?? '').trim()
  const justification = String(form.get('justification') ?? '').trim()

  if (!documentType) return { error: 'Choose what kind of document this is.' }
  if (!subjectType || !subjectId) return { error: 'Choose who this belongs to.' }

  const path = `${ctx.orgId}/${subjectType}/${crypto.randomUUID()}-${safeName(file.name)}`

  // The row first. If the rules refuse it, nothing has been stored.
  const { error: rowError } = await supabase.from('documents').insert({
    org_id: ctx.orgId,
    file_name: file.name,
    mime_type: file.type,
    document_type: documentType,
    storage_path: path,
    size_bytes: file.size,
    subject_type: subjectType,
    subject_id: subjectId,
    uploaded_by: ctx.userId,
    justification: justification || null,
  })

  if (rowError) {
    // The trigger raises these with a message written for the person holding
    // the file, so pass it through rather than replacing it.
    return { error: rowError.message.replace(/^.*?:\s*/, '') }
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    // Don't leave a record pointing at a file that is not there.
    await supabase.from('documents').delete().eq('storage_path', path).eq('org_id', ctx.orgId)
    return { error: 'The file could not be stored. Nothing was saved.' }
  }

  revalidatePath(`/${orgSlug}/documents`)
  return { ok: `${file.name} stored.` }
}

/**
 * Hand back a short-lived signed URL.
 *
 * A raw storage URL is never rendered: the link is minted per click, expires
 * in five minutes, and the read goes through RLS, so a document belonging to
 * another tenant is simply not found.
 */
export async function documentUrl(
  orgSlug: string,
  documentId: string,
): Promise<{ url?: string; error?: string }> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('org_id', ctx.orgId)
    .eq('id', documentId)
    .maybeSingle()

  if (!doc) return { error: 'That document is no longer here.' }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 300)

  if (error || !data) return { error: 'Could not open that document.' }
  return { url: data.signedUrl }
}

/** Remove a document and the file behind it. */
export async function deleteDocument(orgSlug: string, form: FormData): Promise<void> {
  const ctx = await requireOrg(orgSlug)
  const supabase = await createClient()
  const id = String(form.get('id') ?? '')

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('org_id', ctx.orgId)
    .eq('id', id)
    .maybeSingle()

  if (!doc) return

  await supabase.from('documents').delete().eq('org_id', ctx.orgId).eq('id', id)
  await supabase.storage.from(BUCKET).remove([doc.storage_path])

  revalidatePath(`/${orgSlug}/documents`)
}
