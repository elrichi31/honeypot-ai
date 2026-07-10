"use client"

import { useState } from "react"
import { Package, ChevronDown } from "lucide-react"
import { toBundle, type IocEntry, type IocBundleFormat } from "@/lib/ioc-export"
import { useT } from "@/components/locale-provider"

const FORMATS: { format: IocBundleFormat; ext: string; mime: string; label: string }[] = [
  { format: "csv", ext: "csv", mime: "text/csv", label: "CSV" },
  { format: "stix", ext: "stix.json", mime: "application/json", label: "STIX" },
  { format: "misp", ext: "misp.json", mime: "application/json", label: "MISP" },
]

export function IocBundleExport({ entries }: { entries: IocEntry[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)

  function exportAs(format: IocBundleFormat, ext: string, mime: string) {
    const blob = new Blob([toBundle(entries, format)], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `honeypot-iocs-bundle.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <Package className="h-4 w-4" />
        {t("iocs.export.bundle")}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-md border border-border bg-popover shadow-md">
            {FORMATS.map((f) => (
              <button
                key={f.format}
                type="button"
                onClick={() => exportAs(f.format, f.ext, f.mime)}
                className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
