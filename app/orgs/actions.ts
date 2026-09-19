'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  name: z.string().min(2, 'Give your workspace a name'),
  slug: z
    .string()
    .min(3, 'The address must be at least 3 characters')
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Use lowercase letters, numbers and hyphens'),
  region: z.enum(['ZA', 'UK', 'EU', 'AE', 'US', 'AU', 'GLOBAL']),
})

export async function createOrganisation(
  _prev: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const parsed = schema.safeParse({
    name: form.get('name'),
    slug: String(form.get('slug') ?? '').toLowerCase().trim(),
    region: form.get('region'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  // A single database function creates the org, the owner membership, the
  // default pipeline, the starter automations and the careers site — so a
  // half-created workspace is not reachable.
  const { data, error } = await supabase.rpc('create_organisation', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_region: parsed.data.region,
  })

  if (error) {
    if (error.code === '23505') return { error: 'That address is already taken.' }
    return { error: error.message }
  }

  redirect(`/${(data as { slug: string }).slug}`)
}
