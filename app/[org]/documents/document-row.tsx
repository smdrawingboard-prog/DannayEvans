'use client'

import { useState, useTransition } from 'react'
import { documentUrl } from './actions'

/**
 * Opens a document through a signed URL minted at the moment of the click.
 *
 * The link is not in the page source, so a stored URL cannot leak through a
 * screenshot, a referrer or browser history shared with someone else.
 */
export function DocumentRow({
  slug,
  id,
  fileName,
}: {
  slug: string
  id: string
  fileName: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function open() {
    setError(null)
    start(async () => {
      const result = await documentUrl(slug, id)
      if (result.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer')
      } else {
        setError(result.error ?? 'Could not open that document.')
      }
    })
  }

  return (
    <>
      <button
        onClick={open}
        disabled={pending}
        className="text-left hover:underline text-ink disabled:text-ink-muted"
      >
        {pending ? 'Opening…' : fileName}
      </button>
      {error && <span className="block text-xs text-state-danger">{error}</span>}
    </>
  )
}
