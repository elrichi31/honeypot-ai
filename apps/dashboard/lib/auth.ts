import { betterAuth, type BetterAuthOptions } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { Pool } from "pg"
import { getSessionDurationSeconds } from "@/lib/server-config"

const authBaseUrl = process.env.BETTER_AUTH_URL || "http://localhost:4000"
const authBaseUrlObject = new URL(authBaseUrl)
const authAllowedHosts = Array.from(
  new Set([authBaseUrlObject.hostname, "localhost", "127.0.0.1"]),
)

// One shared connection pool for both auth instances below.
const authPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=public",
})

const baseOptions = {
  database: authPool,
  baseURL: {
    allowedHosts: authAllowedHosts,
    fallback: authBaseUrl,
    protocol: authBaseUrlObject.protocol === "https:" ? "https" : "http",
  },
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      // Tenant the user belongs to. NULL = unscoped (only meaningful for the
      // superadmin role, which has global access). For every other role, NULL
      // means "no data" — enforcement is fail-closed (see roles.ts).
      // input:false so it can't be set via the public signup/update API; it's
      // assigned by admins through the users management endpoint.
      clientId: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: getSessionDurationSeconds(),   // configurable in Settings (default 8h)
    updateAge: 60 * 60 * 2,   // re-issue cookie every 2 hours of activity
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,          // cache in a signed cookie for 5 min (skips DB on middleware)
    },
  },
} satisfies BetterAuthOptions

export const auth = betterAuth({ ...baseOptions, plugins: [nextCookies()] })

// Admin-side user creation must NOT touch the CALLER's session. The `auth`
// instance above has nextCookies, whose after-hook writes any Set-Cookie from an
// auth.api call onto the current response — so signUpEmail would overwrite the
// admin's session cookie with the newly-created user's (silently logging the
// admin in as the new user). This cookie-less instance shares the same pool and
// config but skips that side effect, so it's what /api/users POST uses.
export const authAdmin = betterAuth(baseOptions)
