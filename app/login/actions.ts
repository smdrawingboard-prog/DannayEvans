'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const credentials = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export interface AuthState {
  error?: string
  notice?: string
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  // Deliberately generic: distinguishing "no such account" from "wrong
  // password" tells an attacker which addresses are registered.
  if (error) return { error: 'Those details did not match an account.' }

  revalidatePath('/', 'layout')
  redirect(String(form.get('next') || '/orgs'))
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials
    .extend({ fullName: z.string().min(2, 'Tell us your name') })
    .safeParse({
      email: form.get('email'),
      password: form.get('password'),
      fullName: form.get('fullName'),
    })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  })
  if (error) return { error: error.message }

  return {
    notice: 'Check your inbox to confirm your address, then sign in.',
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
