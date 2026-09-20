'use client'

import { useTransition } from 'react'
import { toggleAutomation } from './actions'

export function ToggleAutomation({
  orgSlug,
  id,
  active,
}: {
  orgSlug: string
  id: string
  active: boolean
}) {
  const [pending, start] = useTransition()

  return (
    <button
      className="btn text-xs"
      style={{ minHeight: '2rem' }}
      disabled={pending}
      onClick={() => start(async () => { await toggleAutomation(orgSlug, id, !active) })}
    >
      {active ? 'Turn off' : 'Turn on'}
    </button>
  )
}
