import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Bell } from "lucide-react"
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
