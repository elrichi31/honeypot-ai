import Link from "next/link"
import { Server, Terminal, CheckCircle2, AlertTriangle, BookOpen, ExternalLink } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { getServerT } from "@/lib/i18n/server"

const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ??
  "https://github.com/elrichi31/honeypot-ai/tree/master/apps/docs"

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-400">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Cmd({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground">
      {children}
    </pre>
  )
}

export default async function InstallGuidePage() {
  const t = await getServerT()
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("install.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("install.subtitle")}
          </p>
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sensors"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/40"
          >
            <Server className="h-4 w-4 text-cyan-400" />
            {t("install.goToSensors")}
          </Link>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <BookOpen className="h-4 w-4" />
            {t("install.fullDocs")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Steps */}
        <Surface className="space-y-6 p-6">
          <Step n={1} title={t("install.step1.title")}>
            <p className="text-sm text-muted-foreground">
              Open <span className="font-medium text-foreground">Sensors → Add sensor</span> (or a
              client&apos;s <span className="font-medium text-foreground">Sensor Installers</span>).
              Tick every protocol you want — SSH, HTTP, FTP, MySQL, Port scanner — and download.
              You get a single <code className="font-mono">install-sensor-*.sh</code> that deploys
              all of them at once, with the ingest URL and shared secret already embedded.
            </p>
          </Step>

          <Step n={2} title={t("install.step2.title")}>
            <p className="text-sm text-muted-foreground">
              The installer writes to <code className="font-mono">/opt/honeypot-sensor</code> and
              manages Docker and the host SSH daemon, so it must run as root. It re-launches itself
              with <code className="font-mono">sudo</code> if needed.
            </p>
            <Cmd>{`scp install-sensor-*.sh user@your-vps:~
ssh user@your-vps
sudo bash install-sensor-*.sh`}</Cmd>
            <p className="text-sm text-muted-foreground">
              It installs Docker if missing, pulls the images, and starts the containers plus a
              Suricata IDS.
            </p>
          </Step>

          <Step n={3} title={t("install.step3.title")}>
            <Cmd>{`cd /opt/honeypot-sensor
sudo docker compose ps`}</Cmd>
            <p className="text-sm text-muted-foreground">
              Every service should show <code className="font-mono">running</code>. If one is{" "}
              <code className="font-mono">exited</code>, check its logs:
            </p>
            <Cmd>{`sudo docker compose logs --tail 50 <service>   # e.g. cowrie, web-honeypot, suricata`}</Cmd>
          </Step>

          <Step n={4} title={t("install.step4.title")}>
            <p className="text-sm text-muted-foreground">
              Each sensor sends a heartbeat every 30 seconds. Within a minute it should show up on
              the <Link href="/sensors" className="text-cyan-400 hover:underline">Sensors</Link>{" "}
              page as <span className="font-medium text-foreground">Online</span>, with its ports
              probed. SSH (Cowrie) uses a small <code className="font-mono">heartbeat.py</code>{" "}
              sidecar; the other sensors report from inside their own image.
            </p>
          </Step>

          <Step n={5} title={t("install.step5.title")}>
            <p className="text-sm text-muted-foreground">
              Generate a test hit and confirm it lands. For SSH, a failed login is enough:
            </p>
            <Cmd>{`ssh root@your-vps -p 22   # type a wrong password, then check the dashboard`}</Cmd>
            <p className="text-sm text-muted-foreground">
              The attempt should appear under{" "}
              <Link href="/sessions" className="text-cyan-400 hover:underline">Sessions</Link> /{" "}
              <Link href="/credentials" className="text-cyan-400 hover:underline">Credentials</Link>.
              Watch the heartbeat container directly if needed:
            </p>
            <Cmd>{`sudo docker compose logs -f cowrie-beacon   # heartbeat POSTs every 30s`}</Cmd>
          </Step>
        </Surface>

        {/* Port note */}
        <section className="flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{t("install.portNote.title")}</p>
            <p className="text-muted-foreground">
              When you install the SSH honeypot, the installer moves the real{" "}
              <code className="font-mono">sshd</code> to port <code className="font-mono">8022</code>{" "}
              so Cowrie can listen on 22. After install, reconnect with{" "}
              <code className="font-mono">ssh user@your-vps -p 8022</code>. Make sure your firewall
              allows 8022 before you disconnect.
            </p>
          </div>
        </section>

        {/* Troubleshooting */}
        <Surface className="space-y-3 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Terminal className="h-4 w-4 text-cyan-400" />
            {t("install.troubleshooting")}
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-foreground">
                <code className="font-mono">curl: (23) ... write</code> during download
              </dt>
              <dd className="text-muted-foreground">
                The script can&apos;t write to <code className="font-mono">/opt/honeypot-sensor</code>.
                Run it with <code className="font-mono">sudo</code>, and check{" "}
                <code className="font-mono">df -h /opt</code> for free disk space.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">A container exits immediately</dt>
              <dd className="text-muted-foreground">
                Usually a port already in use. Run{" "}
                <code className="font-mono">sudo ss -tlnp</code> to see what holds the port, then
                free it or stop the conflicting service.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Sensor never appears in /sensors</dt>
              <dd className="text-muted-foreground">
                Confirm the VPS can reach the ingest URL embedded in the script, and that the
                heartbeat container is up (
                <code className="font-mono">sudo docker compose logs cowrie-beacon</code> for SSH, or
                the sensor&apos;s own container otherwise).
              </dd>
            </div>
          </dl>
        </Surface>

        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {t("install.done")}
        </p>
      </div>
    </PageShell>
  )
}
