import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()
export const { signIn, signUp, signOut, useSession } = authClient

/**
 * Obtiene la IP pública del cliente desde su navegador. Como el dashboard se
 * sirve por un túnel SSH / proxy, el servidor solo vería loopback; esta es la
 * única forma de registrar la IP real de quien inicia/cierra sesión.
 * Best-effort: si falla devuelve null y la auditoría cae al comportamiento previo.
 */
export async function fetchPublicIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.ip === "string" ? data.ip : null
  } catch {
    return null
  }
}
