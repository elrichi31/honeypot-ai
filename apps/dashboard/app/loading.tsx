export default function Loading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:72px_72px] loading-grid-drift" />
      <div className="pointer-events-none absolute inset-y-0 left-[-20%] w-[40%] bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.16),transparent)] blur-3xl loading-scan-sweep" />

      <div className="relative z-10 w-full max-w-3xl rounded-[32px] border border-white/10 bg-card/80 p-8 shadow-[0_24px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl md:p-10">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.85)]" />
              HoneyTrap Routing
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Synchronizing the next view
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                Pulling sensor telemetry, rebuilding context, and preparing the next page so the
                transition feels alive instead of frozen.
              </p>
            </div>
          </div>

          <div className="relative hidden h-24 w-24 shrink-0 items-center justify-center md:flex">
            <div className="absolute inset-0 rounded-full border border-cyan-400/20 loading-orbit-slow" />
            <div className="absolute inset-3 rounded-full border border-emerald-400/30 loading-orbit-fast" />
            <div className="absolute h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_24px_rgba(103,232,249,0.95)]" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/8 bg-background/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Telemetry Pipeline
                </p>
                <p className="mt-2 text-lg font-medium text-foreground">Route handoff in progress</p>
              </div>
              <div className="flex gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-300/80 loading-dot-pulse [animation-delay:0ms]" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80 loading-dot-pulse [animation-delay:180ms]" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80 loading-dot-pulse [animation-delay:360ms]" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="overflow-hidden rounded-full bg-white/6">
                <div className="h-2 w-2/3 rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.55),rgba(52,211,153,0.75),rgba(34,211,238,0.55))] loading-progress-flow" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                    Sensors
                  </p>
                  <div className="mt-3 h-2 w-3/4 rounded-full bg-white/8 loading-shimmer" />
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                    Sessions
                  </p>
                  <div className="mt-3 h-2 w-2/3 rounded-full bg-white/8 loading-shimmer" />
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                    Threat Intel
                  </p>
                  <div className="mt-3 h-2 w-4/5 rounded-full bg-white/8 loading-shimmer" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-background/50 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Activity Trace</p>
            <div className="mt-4 space-y-3">
              {[
                "Preparing route data cache",
                "Syncing client and sensor state",
                "Rendering the next dashboard surface",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full bg-cyan-300 loading-dot-pulse"
                    style={{ animationDelay: `${index * 220}ms` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{item}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
