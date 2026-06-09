"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useState } from "react"
import { Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Client } from "@/lib/api"

type Props = {
  client: Client | null
  onClose: () => void
  onDeleted: (clientId: string) => void
}

export function DeleteClientDialog({ client, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    setError(null)
    onClose()
  }

  async function handleDelete() {
    if (!client) return
    setDeleting(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Error ${res.status}: could not delete client`)
        return
      }
      onDeleted(client.id)
      handleClose()
    } catch {
      setError("Network error while trying to delete the client")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={!!client} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Client</DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <span className="font-semibold text-foreground">{client?.name}</span> and unassign all its
            sensors. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={deleting}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting..." : "Delete Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
