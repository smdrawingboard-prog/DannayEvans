'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp, type AuthState } from '../login/actions'
import { BRAND } from '@/lib/brand'

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, {})

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-lg block mb-4">{BRAND.platform}</Link>

        <form action={action} className="panel p-6">
          <h1 className="text-xl">Start your trial</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Fourteen days, no card. You will set up your workspace next.
          </p>

          <div className="mt-5">
            <label className="label" htmlFor="fullName">Your name</label>
            <input id="fullName" name="fullName" required autoComplete="name" className="field" />
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field" />
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" name="password" type="password" required minLength={8}
              autoComplete="new-password" className="field"
            />
            <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
          </div>

          {state.error && <p role="alert" className="mt-4 text-sm text-state-danger">{state.error}</p>}
          {state.notice && <p role="status" className="mt-4 text-sm text-state-success">{state.notice}</p>}

          <button type="submit" disabled={pending} className="btn btn-primary w-full mt-5">
            {pending ? 'Creating…' : 'Create account'}
          </button>

          <p className="mt-4 text-sm text-ink-soft">
            Already have one? <Link href="/login" className="text-accent underline">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  )
}
