'use client'

import { useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { moveApplication } from './actions'

export interface Card {
  id: string
  stageId: string | null
  candidateId: string
  score?: number | null
  candidateName: string
  currentTitle: string | null
  jobTitle: string
  daysInStage: number
  sla: number | null
}

export interface Stage {
  id: string
  name: string
  slaDays: number | null
}

export function Board({
  orgSlug,
  stages,
  cards,
}: {
  orgSlug: string
  stages: Stage[]
  cards: Card[]
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The card jumps column immediately; if the server refuses, React reverts
  // it when the transition settles. Waiting on a round trip for a stage move
  // makes the board feel broken.
  const [optimistic, applyOptimistic] = useOptimistic(
    cards,
    (current: Card[], move: { id: string; stageId: string }) =>
      current.map((c) => (c.id === move.id ? { ...c, stageId: move.stageId } : c)),
  )

  function move(cardId: string, stageId: string) {
    setError(null)
    start(async () => {
      applyOptimistic({ id: cardId, stageId })
      const result = await moveApplication(orgSlug, cardId, stageId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <>
      {error && <p role="alert" className="text-sm text-state-danger mb-3">{error}</p>}

      {/* Horizontal scroll rather than a cramped grid: a pipeline with eight
          stages cannot be read at phone width any other way. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {stages.map((stage) => {
            const inStage = optimistic.filter((c) => c.stageId === stage.id)
            return (
              <section key={stage.id} className="w-64 shrink-0">
                <header className="flex items-baseline justify-between px-1 pb-2">
                  <h2 className="text-sm font-medium">{stage.name}</h2>
                  <span className="text-xs text-ink-muted">{inStage.length}</span>
                </header>

                <div className="space-y-2 min-h-[4rem]">
                  {inStage.map((card) => {
                    const stalling = card.sla !== null && card.daysInStage > card.sla
                    return (
                      <article
                        key={card.id}
                        className={`panel p-3 ${stalling ? 'border-state-warning' : ''}`}
                      >
                        <Link
                          href={`/${orgSlug}/candidates/${card.candidateId}`}
                          className="text-sm hover:underline"
                        >
                          {card.candidateName}
                        </Link>
                        <p className="text-xs text-ink-muted mt-0.5 truncate">
                          {card.currentTitle ?? '—'}
                        </p>
                        <p className="text-xs text-ink-soft mt-1 truncate">{card.jobTitle}</p>
                        <p className={`text-xs mt-1 ${stalling ? 'text-state-warning' : 'text-ink-muted'}`}>
                          {card.daysInStage}d in stage
                          {stalling && ` · past ${card.sla}d target`}
                        </p>

                        <Link
                          href={`/${orgSlug}/assess/${card.id}`}
                          className="inline-block mt-1 text-xs text-accent hover:underline"
                        >
                          {card.score !== null && card.score !== undefined
                            ? `Scored ${card.score}%`
                            : 'Score'}
                        </Link>

                        <label className="sr-only" htmlFor={`move-${card.id}`}>
                          Move {card.candidateName} to another stage
                        </label>
                        <select
                          id={`move-${card.id}`}
                          className="field mt-2 text-xs"
                          value={card.stageId ?? ''}
                          disabled={pending}
                          onChange={(e) => move(card.id, e.target.value)}
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </article>
                    )
                  })}

                  {inStage.length === 0 && (
                    <p className="text-xs text-ink-muted px-1 py-3">Empty</p>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}
