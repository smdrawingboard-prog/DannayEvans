'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { signIn, type AuthState } from './actions'
import { BRAND } from '@/lib/brand'

function LoginForm() {
  const next = useSearchParams().get('next') ?? '/orgs'
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {})

  return (
    <form action={action} className="panel p-6 w-full max-w-sm">
      <h1 className="text-xl">Sign in</h1>
      <input type="hidden" name="next" value={next} />

      <div className="mt-5">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <div className="mt-4">
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>

      {state.error && (
        <p role="alert" className="mt-4 text-sm text-state-danger">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full mt-5">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="mt-4 text-sm text-ink-soft">
        No account? <Link href="/signup" className="text-accent underline">Start a trial</Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-lg block mb-4">{BRAND.platform}</Link>
        <Suspense fallback={<div className="panel p-6 h-72" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
