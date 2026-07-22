"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, AlertCircle, CheckCircle } from "lucide-react"
import { signIn, fetchPublicIp } from "@/lib/auth-client"
import { BrandMark } from "@/components/brand-mark"
import { LoginGlobe } from "@/components/login-globe"
import { useBrand } from "@/lib/use-brand"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setupSuccess = searchParams.get("setup") === "success"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [phase, setPhase] = useState<"idle" | "signing-in" | "redirecting">("idle")
  const [checking, setChecking] = useState(true)
  const brand = useBrand()

  useEffect(() => {
    let cancelled = false
    fetch("/api/setup-status")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data.setupRequired) router.replace("/setup")
        else setChecking(false)
      })
      .catch(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setPhase("signing-in")
    try {
      // The server only sees the tunnel/proxy IP (loopback), so the browser
      // reports its real public IP to enrich the audit log.
      const publicIp = await fetchPublicIp()
      const result = await signIn.email(
        { email, password },
        publicIp
          ? { headers: { "x-client-public-ip": publicIp } }
          : undefined,
      )
      if (result.error) {
        setError(result.error.message ?? "Invalid email or password.")
        setPhase("idle")
      } else {
        // Show "redirecting" state then do a hard navigation so the
        // middleware gets a fresh request with the new session cookie.
        setPhase("redirecting")
        window.location.href = "/"
      }
    } catch {
      setError("An unexpected error occurred. Please try again.")
      setPhase("idle")
    }
  }

  const loading = phase !== "idle"

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <div className="scale-150">
            <BrandMark variant="full" />
          </div>
          {brand !== "ist-americas" && (
            <div>
              <h1 className="text-2xl font-semibold text-foreground">HoneyTrap</h1>
              <p className="text-sm text-muted-foreground">Sign in to your dashboard</p>
            </div>
          )}
        </div>

        {setupSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Account created. Sign in to continue.
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "redirecting" ? (
                <><CheckCircle className="h-4 w-4" /> Redirecting…</>
              ) : phase === "signing-in" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>
      </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden bg-[#060b18] lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(80,90,160,0.25),transparent_70%)]" />
        <div className="relative flex flex-col items-center gap-8 px-10">
          <LoginGlobe />
          <div className="max-w-md text-center">
            <h2 className="text-2xl font-semibold text-white">Threats, mapped in real time</h2>
            <p className="mt-2 text-sm text-slate-400">
              Every probe, scan and login attempt against your honeypots — visualized as it happens.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
