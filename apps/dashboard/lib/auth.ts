import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { Pool } from "pg"

const authBaseUrl = process.env.BETTER_AUTH_URL || "http://localhost:4000"
const authBaseUrlObject = new URL(authBaseUrl)
const authAllowedHosts = Array.from(
  new Set([authBaseUrlObject.hostname, "localhost", "127.0.0.1"]),
)

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c search_path=public",
  }),
  baseURL: {
    allowedHosts: authAllowedHosts,
    fallback: authBaseUrl,
    protocol: authBaseUrlObject.protocol === "https:" ? "https" : "http",
  },
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  session: {
    expiresIn: 60 * 60 * 8,   // 8 hours
    updateAge: 60 * 60 * 2,   // re-issue cookie every 2 hours of activity
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,          // cache in a signed cookie for 5 min (skips DB on middleware)
    },
  },
  plugins: [nextCookies()],
})
