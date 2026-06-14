import { cn } from "@/lib/utils"

export function Flag({ code, className }: { code: string; className?: string }) {
  if (!code || code.length !== 2) return null
  return (
    <span
      className={cn("fi", `fi-${code.toLowerCase()}`, "rounded-[2px]", className)}
      title={code.toUpperCase()}
    />
  )
}
