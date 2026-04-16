import { NextResponse } from "next/server"
import { Pool } from "pg"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=public",
})

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int as count FROM "user" LIMIT 1`
    )
    return NextResponse.json({ setupRequired: result.rows[0].count === 0 })
  } catch {
    return NextResponse.json({ setupRequired: true })
  }
}
