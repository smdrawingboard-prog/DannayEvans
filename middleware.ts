import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session cookie on every request so Server Components
 * always see a valid session.
 *
 * This middleware does NOT authorise anything. Page-level `requireOrg()` and
 * the RLS policies do that. Treating middleware as an authorisation boundary
 * is how tenants leak: it is easy to bypass with a route the matcher misses.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items: { name: string; value: string; options: CookieOptions }[]) {
          items.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: [
    // Everything except static assets, the signing ceremony (public by
    // design) and the public careers sites.
    '/((?!_next/static|_next/image|favicon.ico|sign|careers|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
