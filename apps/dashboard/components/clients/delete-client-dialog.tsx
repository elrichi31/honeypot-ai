"use client"

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

  async function handleDelete() {
    if (!client) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      onDeleted(client.id)
      onClose()
    } catch {
      // keep dialog open on error
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={!!client} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Client</DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <span className="font-semibold text-foreground">{client?.name}</span> and unassign all its
            sensors. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
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
