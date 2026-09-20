import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createJob } from '../actions'
import { JobForm } from '../job-form'

export const metadata = { title: 'Add a role' }

export default async function NewJobPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const ctx = await requireOrg(slug)
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('org_id', ctx.orgId)
    .order('name')

  const action = createJob.bind(null, slug)

  return (
    <div className="max-w-3xl space-y-5">
      <nav className="text-sm">
        <Link href={`/${slug}/jobs`} className="text-accent hover:underline">← Roles</Link>
      </nav>

      <header>
        <h1 className="text-2xl">Add a role</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Saved as a draft. Nothing goes public until you publish it.
        </p>
      </header>

      <JobForm
        action={action}
        clients={clients ?? []}
        currency={ctx.currency}
        submitLabel="Save draft"
      />
    </div>
  )
}
