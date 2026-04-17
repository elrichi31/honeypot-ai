"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sparkles, Eye, EyeOff, CheckCircle, Loader2 } from "lucide-react"
import { SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

export function OpenAiForm() {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setHasKey(data.hasKey)
        setKey(data.hasKey ? data.openaiApiKey : "")
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  async function save() {
    setStatus("saving")
    setError("")
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: key }),
      })
      if (!res.ok) throw new Error()
      setHasKey(!!key.trim())
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("Could not save. Is the server running?")
      setStatus("error")
    }
  }

  function clear() {
    setKey("")
    setHasKey(false)
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openaiApiKey: "" }),
    })
  }

  const badge = hasKey ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" /> Configured
    </span>
  ) : undefined

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader icon={Sparkles} iconBg="bg-primary/20" iconColor="text-primary" title="AI Analysis" description="OpenAI key for session threat analysis" badge={badge} />

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="openai-key">OpenAI API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              {status === "loading" ? (
                <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading...
                </div>
              ) : (
                <Input
                  id="openai-key"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  className="pr-10 font-mono text-sm"
                />
              )}
              {status !== "loading" && (
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            <Button onClick={save} disabled={status === "saving" || status === "loading"} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {status === "saving" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving</> : status === "saved" ? <><CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Saved</> : "Save"}
            </Button>
            {hasKey && <Button variant="outline" onClick={clear}>Clear</Button>}
          </div>
          <SaveFeedback status={status} error={error} />
          <p className="text-xs text-muted-foreground">
            Get your key at <span className="font-mono text-foreground">platform.openai.com/api-keys</span>. Stored locally, never exposed in plain text.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">How it works</p>
          <p>Open any session and click <strong>Analyze session</strong>. The dashboard sends session data to GPT-4o mini and returns a threat assessment.</p>
        </div>
      </div>
    </div>
  )
}
