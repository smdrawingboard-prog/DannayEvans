'use client'

import { useState, useTransition } from 'react'
import { publishJob, unpublishJob, type JobResult } from '../actions'

export function PublishControls({
  orgSlug,
  jobId,
  jobSlug,
  status,
}: {
  orgSlug: string
  jobId: string
  jobSlug: string
  status: string
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<JobResult>({})

  const live = status === 'open'

  return (
    <div className="text-right">
      <div className="flex flex-wrap gap-2 justify-end">
        {live ? (
          <>
            <a
              href={`/careers/${orgSlug}/${jobSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              View public page
            </a>
            <button
              className="btn" disabled={pending}
              onClick={() => start(async () => setResult(await unpublishJob(orgSlug, jobId)))}
            >
              Take down
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary" disabled={pending}
            onClick={() => start(async () => setResult(await publishJob(orgSlug, jobId)))}
          >
            {pending ? 'Publishing…' : 'Publish to careers site'}
          </button>
        )}
      </div>

      {result.error && (
        <p role="alert" className="mt-2 text-sm text-state-danger max-w-sm">{result.error}</p>
      )}
      {result.notice && (
        <p role="status" className="mt-2 text-sm text-state-success">{result.notice}</p>
      )}
    </div>
  )
}
