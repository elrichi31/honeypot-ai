import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
}

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c search_path=public",
    max: 5,
  })
}

// Reuse pool across hot-reloads in dev
export const db: Pool = globalThis.__pgPool ?? (globalThis.__pgPool = createPool())
