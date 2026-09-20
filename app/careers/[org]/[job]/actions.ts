'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { tryAdminClient } from '@/lib/supabase/admin'
import { regionOf } from '@/lib/region'

const schema = z.object({
  jobId: z.string().uuid(),
  fullName: z.string().min(2, 'Please give your full name').max(120),
  email: z.string().email('Please give a valid email address'),
  phone: z.string().max(40).optional().or(z.literal('')),
  linkedin: z.string().url('That does not look like a URL').optional().or(z.literal('')),
  message: z.string().max(4000).optional().or(z.literal('')),
  consent: z.literal('on', { errorMap: () => ({ message: 'We need your consent to store your details' }) }),
})

export interface ApplyState {
  error?: string
  done?: boolean
}

/**
 * Public application intake.
 *
 * Runs with the service role because the applicant has no session, so it
 * authorises for itself: the org is derived from the job row, never from the
 * form, and the job must be open and published. Nothing the applicant sends
 * chooses which tenant the row lands in.
 */
export async function apply(_prev: ApplyState, form: FormData): Promise<ApplyState> {
  const parsed = schema.safeParse({
    jobId: form.get('jobId'),
    fullName: form.get('fullName'),
    email: form.get('email'),
    phone: form.get('phone') ?? '',
    linkedin: form.get('linkedin') ?? '',
    message: form.get('message') ?? '',
    consent: form.get('consent'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const input = parsed.data
  const db = tryAdminClient()
  if (!db) return { error: 'We could not record your application. Please try again shortly.' }

  const { data: job } = await db
    .from('jobs')
    .select('id, org_id, title, organisations!inner(region)')
    .eq('id', input.jobId)
    .eq('status', 'open')
    .not('published_at', 'is', null)
    .maybeSingle()

  if (!job) return { error: 'This role is no longer accepting applications.' }

  const region = regionOf((job.organisations as unknown as { region: string }).region)
  const now = new Date()
  const retainUntil = new Date(now)
  retainUntil.setMonth(retainUntil.getMonth() + region.defaultRetentionMonths)

  // An applicant who already exists is updated rather than duplicated — the
  // unique index on (org_id, email) makes this the only correct write.
  const { data: candidate, error: candidateError } = await db
    .from('candidates')
    .upsert(
      {
        org_id: job.org_id,
        full_name: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        whatsapp: region.primaryChannel === 'whatsapp' ? input.phone || null : null,
        linkedin_url: input.linkedin || null,
        source: 'careers_site',
        lawful_basis: 'consent',
        consent_given: true,
        consent_at: now.toISOString(),
        retain_until: retainUntil.toISOString().slice(0, 10),
        notes: input.message || null,
      },
      { onConflict: 'org_id,email' },
    )
    .select('id')
    .single()

  if (candidateError || !candidate) {
    return { error: 'We could not record your application. Please try again.' }
  }

  const { data: firstStage } = await db
    .from('pipeline_stages')
    .select('id')
    .eq('org_id', job.org_id)
    .eq('kind', 'candidate')
    .order('position')
    .limit(1)
    .maybeSingle()

  const { error: applicationError } = await db.from('applications').upsert(
    {
      org_id: job.org_id,
      job_id: job.id,
      candidate_id: candidate.id,
      stage_id: firstStage?.id ?? null,
      applied_via: 'careers_site',
    },
    { onConflict: 'job_id,candidate_id', ignoreDuplicates: true },
  )

  if (applicationError) {
    return { error: 'We could not record your application. Please try again.' }
  }

  // Consent is itself a record that may have to be produced later.
  await db.from('contact_channels').upsert(
    {
      org_id: job.org_id,
      subject_type: 'candidate',
      subject_id: candidate.id,
      channel: 'email',
      address: input.email.toLowerCase(),
      opted_in: true,
      opted_in_at: now.toISOString(),
      opted_in_source: `careers_site:${job.id}`,
    },
    { onConflict: 'org_id,channel,address,subject_id' },
  )

  revalidatePath(`/careers`)
  return { done: true }
}
