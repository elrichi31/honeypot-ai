import { betterAuth } from "better-auth"
import { Pool } from "pg"

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c search_path=public",
  }),
  baseURL: process.env.BETTER_AUTH_URL,
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
})
