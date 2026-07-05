"use client"

import { apiFetch, assertOk } from "@/lib/client-fetch"

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
import { useT } from "@/components/locale-provider"

type Props = {
  client: Client | null
  onClose: () => void
  onDeleted: (clientId: string) => void
}

export function DeleteClientDialog({ client, onClose, onDeleted }: Props) {
  const t = useT()
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
      await assertOk(await apiFetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: "DELETE" }), t("clients.delete.error"))
      onDeleted(client.id)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.delete.netError"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={!!client} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("clients.delete.title")}</DialogTitle>
          <DialogDescription>
            {t("clients.delete.descPrefix")}
            <span className="font-semibold text-foreground">{client?.name}</span>
            {t("clients.delete.descSuffix")}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={deleting}>
            <X className="h-4 w-4" />
            {t("clients.delete.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
            <Trash2 className="h-4 w-4" />
            {deleting ? t("clients.delete.deleting") : t("clients.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
