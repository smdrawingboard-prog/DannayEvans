'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrg, canManage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface JobResult {
  error?: string
  notice?: string
}

/** "Financial Manager (Cape Town)" -> "financial-manager-cape-town" */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '')
}

/** Textarea lines -> array, dropping blanks. */
function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
}

const jobSchema = z.object({
  title: z.string().min(2, 'Give the role a title').max(120),
  clientId: z.string().uuid().optional().or(z.literal('')),
  employmentType: z.enum([
    'permanent', 'contract', 'temporary', 'fixed_term', 'internship', 'part_time',
  ]),
  workModel: z.enum(['onsite', 'hybrid', 'remote']),
  city: z.string().max(80).optional().or(z.literal('')),
  country: z.string().max(80).optional().or(z.literal('')),
  salaryMin: z.coerce.number().nonnegative().optional().or(z.nan()),
  salaryMax: z.coerce.number().nonnegative().optional().or(z.nan()),
  salaryPeriod: z.enum(['hour', 'day', 'month', 'year']),
  salaryPublic: z.boolean(),
  summary: z.string().max(400).optional().or(z.literal('')),
  description: z.string().max(20000).optional().or(z.literal('')),
  openings: z.coerce.number().int().min(1).max(999),
})

function parseJob(form: FormData) {
  return jobSchema.safeParse({
    title: form.get('title'),
    clientId: form.get('clientId') ?? '',
    employmentType: form.get('employmentType'),
    workModel: form.get('workModel'),
    city: form.get('city') ?? '',
    country: form.get('country') ?? '',
    salaryMin: form.get('salaryMin') || Number.NaN,
    salaryMax: form.get('salaryMax') || Number.NaN,
    salaryPeriod: form.get('salaryPeriod'),
    salaryPublic: form.get('salaryPublic') === 'on',
    summary: form.get('summary') ?? '',
    description: form.get('description') ?? '',
    openings: form.get('openings') || 1,
  })
}

/** Salary range must make sense before it reaches a public job page. */
function salaryError(min: number, max: number, isPublic: boolean): string | null {
  if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
    return 'The maximum salary is below the minimum.'
  }
  if (isPublic && !Number.isFinite(min)) {
    return 'To show the salary publicly, give at least a minimum.'
  }
  return null
}

export async function createJob(
  orgSlug: string,
  _prev: JobResult,
  form: FormData,
): Promise<JobResult> {
  const ctx = await requireOrg(orgSlug)
  const parsed = parseJob(form)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const d = parsed.data
  const bad = salaryError(d.salaryMin as number, d.salaryMax as number, d.salaryPublic)
  if (bad) return { error: bad }

  const supabase = await createClient()
  const base = slugify(d.title) || 'role'

  // A slug collides whenever two roles share a title, which is common
  // ("Sales Consultant" twice in a year). Suffix rather than reject.
  let slug = base
  for (let attempt = 2; attempt <= 50; attempt++) {
    const { data: clash } = await supabase
      .from('jobs')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('slug', slug)
      .maybeSingle()
    if (!clash) break
    slug = `${base}-${attempt}`
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      org_id: ctx.orgId,
      client_id: d.clientId || null,
      title: d.title,
      slug,
      employment_type: d.employmentType,
      work_model: d.workModel,
      city: d.city || null,
      country: d.country || null,
      salary_min: Number.isFinite(d.salaryMin as number) ? d.salaryMin : null,
      salary_max: Number.isFinite(d.salaryMax as number) ? d.salaryMax : null,
      salary_currency: ctx.currency,
      salary_period: d.salaryPeriod,
      salary_public: d.salaryPublic,
      summary: d.summary || null,
      description_md: d.description || null,
      requirements: lines(form.get('requirements')),
      benefits: lines(form.get('benefits')),
      openings: d.openings,
      owner_id: ctx.userId,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  redirect(`/${orgSlug}/jobs/${data.id}`)
}

export async function updateJob(
  orgSlug: string,
  jobId: string,
  _prev: JobResult,
  form: FormData,
): Promise<JobResult> {
  const ctx = await requireOrg(orgSlug)
  const parsed = parseJob(form)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const d = parsed.data
  const bad = salaryError(d.salaryMin as number, d.salaryMax as number, d.salaryPublic)
  if (bad) return { error: bad }

  const supabase = await createClient()
  const { error } = await supabase
    .from('jobs')
    .update({
      title: d.title,
      client_id: d.clientId || null,
      employment_type: d.employmentType,
      work_model: d.workModel,
      city: d.city || null,
      country: d.country || null,
      salary_min: Number.isFinite(d.salaryMin as number) ? d.salaryMin : null,
      salary_max: Number.isFinite(d.salaryMax as number) ? d.salaryMax : null,
      salary_period: d.salaryPeriod,
      salary_public: d.salaryPublic,
      summary: d.summary || null,
      description_md: d.description || null,
      requirements: lines(form.get('requirements')),
      benefits: lines(form.get('benefits')),
      openings: d.openings,
      meta_title: (form.get('metaTitle') as string) || null,
      meta_description: (form.get('metaDescription') as string) || null,
      primary_keyword: (form.get('primaryKeyword') as string) || null,
    })
    .eq('id', jobId)

  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/jobs/${jobId}`)
  revalidatePath(`/careers/${orgSlug}`)
  return { notice: 'Saved.' }
}

/**
 * Publish a role to the public careers site.
 *
 * Refuses on anything that would produce an invalid `JobPosting` or an empty
 * page: Google drops a listing missing a description, and a role published
 * without one simply will not rank. Better to block here than to publish
 * something that quietly never appears in search.
 */
export async function publishJob(
  orgSlug: string,
  jobId: string,
): Promise<JobResult> {
  const ctx = await requireOrg(orgSlug)
  if (!canManage(ctx.role) && ctx.role !== 'recruiter') {
    return { error: 'You do not have permission to publish roles.' }
  }

  const supabase = await createClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) return { error: 'Role not found.' }

  const missing: string[] = []
  if (!job.description_md?.trim()) missing.push('a description')
  if (!job.summary?.trim()) missing.push('a short summary')
  if (!job.city && job.work_model !== 'remote') missing.push('a location')
  if (missing.length > 0) {
    return {
      error: `Add ${missing.join(' and ')} before publishing — search engines drop listings without them.`,
    }
  }

  const now = new Date()
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'open',
      published_at: job.published_at ?? now.toISOString(),
      // Default a 60-day window. Google treats a listing with no
      // validThrough as stale after about 30 days, so this is not optional.
      closes_at:
        job.closes_at ?? new Date(now.getTime() + 60 * 86_400_000).toISOString(),
      meta_title:
        job.meta_title ??
        `${job.title} — ${job.city ?? 'Remote'}`.slice(0, 60),
      meta_description:
        job.meta_description ?? (job.summary as string).slice(0, 160),
    })
    .eq('id', jobId)

  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/jobs/${jobId}`)
  revalidatePath(`/careers/${orgSlug}`)
  revalidatePath(`/careers/${orgSlug}/${job.slug}`)
  revalidatePath('/sitemap.xml')
  return { notice: 'Published. It is live on your careers site.' }
}

export async function unpublishJob(
  orgSlug: string,
  jobId: string,
): Promise<JobResult> {
  await requireOrg(orgSlug)
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs').select('slug').eq('id', jobId).maybeSingle()

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'on_hold' })
    .eq('id', jobId)
  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/jobs/${jobId}`)
  revalidatePath(`/careers/${orgSlug}`)
  if (job?.slug) revalidatePath(`/careers/${orgSlug}/${job.slug}`)
  return { notice: 'Taken off the careers site.' }
}
