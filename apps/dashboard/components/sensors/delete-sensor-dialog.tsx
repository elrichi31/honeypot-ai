"use client"

import { Loader2, Trash2 } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useT } from "@/components/locale-provider"

export function DeleteSensorDialog({
  name, sensorId, deleting, onDelete,
}: { name: string; sensorId: string; deleting: boolean; onDelete: () => void }) {
  const t = useT()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title={t("sensors.delete.button")}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("sensors.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("sensors.delete.descPrefix")}<span className="font-medium text-foreground">{name}</span>{" "}
            (<code className="font-mono text-xs">{sensorId}</code>).
            <br /><br />
            <span className="text-muted-foreground">
              {t("sensors.delete.descKept")}
            </span>
            {t("sensors.delete.descReregister")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("sensors.delete.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-white hover:bg-destructive/90">
            {t("sensors.delete.button")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
