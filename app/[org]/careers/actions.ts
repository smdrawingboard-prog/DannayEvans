'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireOrg, canManage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface CareersResult {
  error?: string
  notice?: string
}

const schema = z.object({
  headline: z.string().max(120).optional().or(z.literal('')),
  introMd: z.string().max(4000).optional().or(z.literal('')),
  metaTitle: z.string().max(60, 'Meta title must be 60 characters or fewer').optional().or(z.literal('')),
  metaDescription: z.string().max(160, 'Meta description must be 160 characters or fewer').optional().or(z.literal('')),
  primaryKeyword: z.string().max(120).optional().or(z.literal('')),
  googleSiteVerification: z.string().max(200).optional().or(z.literal('')),
  enabled: z.boolean(),
})

export async function updateCareersSite(
  orgSlug: string,
  _prev: CareersResult,
  form: FormData,
): Promise<CareersResult> {
  const ctx = await requireOrg(orgSlug)
  if (!canManage(ctx.role)) {
    return { error: 'Only an owner or admin can change the careers site.' }
  }

  const parsed = schema.safeParse({
    headline: form.get('headline') ?? '',
    introMd: form.get('introMd') ?? '',
    metaTitle: form.get('metaTitle') ?? '',
    metaDescription: form.get('metaDescription') ?? '',
    primaryKeyword: form.get('primaryKeyword') ?? '',
    googleSiteVerification: form.get('googleSiteVerification') ?? '',
    enabled: form.get('enabled') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // The FAQ rows are what answer engines quote and what earns the FAQPage
  // rich result, so they are stored as structured pairs rather than prose.
  const questions = form.getAll('faqQuestion').map(String)
  const answers = form.getAll('faqAnswer').map(String)
  const faq = questions
    .map((q, i) => ({ q: q.trim(), a: (answers[i] ?? '').trim() }))
    .filter((row) => row.q && row.a)

  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('careers_sites')
    .update({
      enabled: d.enabled,
      headline: d.headline || null,
      intro_md: d.introMd || null,
      meta_title: d.metaTitle || null,
      meta_description: d.metaDescription || null,
      primary_keyword: d.primaryKeyword || null,
      google_site_verification: d.googleSiteVerification || null,
      faq,
    })
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath(`/${orgSlug}/careers`)
  revalidatePath(`/careers/${orgSlug}`)
  return { notice: 'Saved. The public page updates within a few minutes.' }
}
