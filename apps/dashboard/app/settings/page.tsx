"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Server, Bell, Database, Shield } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your honeypot monitoring preferences
          </p>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* Connection Settings */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/20">
                <Server className="h-4 w-4 text-chart-1" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Connection</h3>
                <p className="text-sm text-muted-foreground">
                  Honeypot server connection settings
                </p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="api-url">API Endpoint</Label>
                <Input
                  id="api-url"
                  placeholder="https://your-honeypot-api.com"
                  defaultValue="http://localhost:8080/api"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Enter your API key"
                  defaultValue="sk_live_xxxxxxxxxxxxx"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-refresh</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically refresh data every 30 seconds
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/20">
                <Bell className="h-4 w-4 text-warning" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Notifications</h3>
                <p className="text-sm text-muted-foreground">
                  Alert preferences for honeypot events
                </p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New session alerts</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when a new session is detected
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Successful login alerts</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified on successful authentication attempts
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Suspicious command alerts</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when suspicious commands are executed
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>

          {/* Data Retention */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-2/20">
                <Database className="h-4 w-4 text-chart-2" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Data Retention</h3>
                <p className="text-sm text-muted-foreground">
                  Configure how long data is stored
                </p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="retention">Retention Period (days)</Label>
                <Input
                  id="retention"
                  type="number"
                  defaultValue="90"
                  min={1}
                  max={365}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Archive old data</Label>
                  <p className="text-xs text-muted-foreground">
                    Move old data to archive storage
                  </p>
                </div>
                <Switch />
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/20">
                <Shield className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Security</h3>
                <p className="text-sm text-muted-foreground">
                  Security and access settings
                </p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Two-factor authentication</Label>
                  <p className="text-xs text-muted-foreground">
                    Require 2FA for dashboard access
                  </p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>IP Whitelisting</Label>
                  <p className="text-xs text-muted-foreground">
                    Only allow access from specific IPs
                  </p>
                </div>
                <Switch />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              Save Changes
            </Button>
            <Button variant="outline">Reset to Defaults</Button>
          </div>
        </div>
      </main>
    </div>
  )
}
