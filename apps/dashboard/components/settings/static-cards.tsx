import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Bell, Database, Shield } from "lucide-react"
import { CardHeader } from "./setting-card"

export function NotificationsCard() {
  const items = [
    { label: "New session alerts",        description: "Get notified when a new session is detected" },
    { label: "Successful login alerts",   description: "Get notified on successful authentication" },
    { label: "Suspicious command alerts", description: "Get notified when suspicious commands are executed" },
  ]

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader icon={Bell} iconBg="bg-warning/20" iconColor="text-warning" title="Notifications" description="Alert preferences for honeypot events" />
      <div className="space-y-4 p-4">
        {items.map(({ label, description }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{label}</Label>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch defaultChecked />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DataRetentionCard() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader icon={Database} iconBg="bg-chart-2/20" iconColor="text-chart-2" title="Data Retention" description="Configure how long data is stored" />
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="retention">Retention Period (days)</Label>
          <Input id="retention" type="number" defaultValue="90" min={1} max={365} />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Archive old data</Label>
            <p className="text-xs text-muted-foreground">Move old data to archive storage</p>
          </div>
          <Switch />
        </div>
      </div>
    </div>
  )
}

export function SecurityCard() {
  const items = [
    { label: "Two-factor authentication", description: "Require 2FA for dashboard access" },
    { label: "IP Whitelisting",           description: "Only allow access from specific IPs" },
  ]

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader icon={Shield} iconBg="bg-destructive/20" iconColor="text-destructive" title="Security" description="Security and access settings" />
      <div className="space-y-4 p-4">
        {items.map(({ label, description }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{label}</Label>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch />
          </div>
        ))}
      </div>
    </div>
  )
}
