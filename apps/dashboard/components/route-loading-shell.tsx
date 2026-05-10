import { PageShell } from "@/components/page-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

type RouteLoadingShellProps = {
  title: string
  description: string
  label?: string
  variant?: "overview" | "detail"
}

function LoadingCard({
  lines = 3,
  tall = false,
}: {
  lines?: number
  tall?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32 rounded-full bg-accent/60" />
        <Skeleton className="h-3 w-14 rounded-full bg-accent/40" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            className={`h-3 rounded-full bg-accent/40 ${
              index === lines - 1 ? "w-2/3" : "w-full"
            }`}
          />
        ))}
        {tall ? <Skeleton className="mt-4 h-40 w-full rounded-xl bg-accent/25" /> : null}
      </div>
    </div>
  )
}

export function RouteLoadingShell({
  title,
  description,
  label = "Loading view",
  variant = "overview",
}: RouteLoadingShellProps) {
  return (
    <PageShell>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                <Spinner className="size-6 text-cyan-300" />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-300">
                  <span className="h-2 w-2 rounded-full bg-cyan-300" />
                  {label}
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 self-start md:self-auto">
              <Skeleton className="h-12 w-20 rounded-xl bg-accent/35" />
              <Skeleton className="h-12 w-20 rounded-xl bg-accent/35" />
              <Skeleton className="h-12 w-20 rounded-xl bg-accent/35" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28 rounded-xl bg-accent/30" />
          <Skeleton className="h-28 rounded-xl bg-accent/30" />
          <Skeleton className="h-28 rounded-xl bg-accent/30" />
          <Skeleton className="h-28 rounded-xl bg-accent/30" />
        </div>

        {variant === "detail" ? (
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-1">
              <LoadingCard lines={4} />
              <LoadingCard lines={5} />
            </div>
            <div className="space-y-6 xl:col-span-2">
              <LoadingCard lines={4} tall />
              <LoadingCard lines={6} tall />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <LoadingCard lines={5} tall />
              <LoadingCard lines={4} tall />
            </div>
            <div className="space-y-6">
              <LoadingCard lines={4} />
              <LoadingCard lines={5} />
              <LoadingCard lines={3} />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
