import Link from 'next/link'
import type { ReactNode } from 'react'

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          {title && <h2 className="text-base">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-2xl">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  )
}

const PILL_TONES: Record<string, string> = {
  neutral: 'border-line text-ink-soft bg-bg-secondary',
  accent: 'border-accent text-accent bg-accent-light',
  success: 'border-state-success text-state-success bg-green-50',
  warning: 'border-state-warning text-state-warning bg-amber-50',
  danger: 'border-state-danger text-state-danger bg-red-50',
  gold: 'border-gold text-gold bg-amber-50',
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: keyof typeof PILL_TONES
}) {
  return <span className={`pill ${PILL_TONES[tone] ?? PILL_TONES.neutral}`}>{children}</span>
}

/** Maps an envelope status onto a visual tone, in one place. */
export function statusTone(status: string): keyof typeof PILL_TONES {
  switch (status) {
    case 'completed':
      return 'success'
    case 'declined':
    case 'voided':
    case 'expired':
      return 'danger'
    case 'sent':
    case 'in_progress':
      return 'accent'
    default:
      return 'neutral'
  }
}

export function EmptyState({
  title,
  body,
  href,
  cta,
}: {
  title: string
  body: string
  href?: string
  cta?: string
}) {
  return (
    <div className="text-center py-12 px-4">
      <h3 className="text-base">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-soft max-w-md mx-auto">{body}</p>
      {href && cta && (
        <Link href={href} className="btn btn-primary mt-4">
          {cta}
        </Link>
      )}
    </div>
  )
}
