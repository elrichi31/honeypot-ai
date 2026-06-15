import * as React from "react"
import { cn } from "@/lib/utils"
import { Surface } from "@/components/ui/surface"
import { TableCell, TableRow } from "@/components/ui/table"

/**
 * Bordered card wrapper for a table that scrolls horizontally on overflow. Use
 * for simple tables that don't need TableShell's title/toolbar/pagination
 * chrome. Pairs with the Table primitive:
 *
 *   <TableCard>
 *     <Table>…</Table>
 *     <TableCardFooter>…</TableCardFooter>   // optional
 *   </TableCard>
 */
export function TableCard({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <Surface className={cn("overflow-hidden", className)} {...props}>
      <div className="overflow-x-clip">{children}</div>
    </Surface>
  )
}

/** Optional footer row inside a TableCard (totals, pagination controls). */
export function TableCardFooter({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Centered empty-state row spanning the whole table. Standardizes the
 * `<tr><td colSpan>…</td></tr>` empty message repeated in every table.
 */
export function EmptyRow({
  colSpan,
  children,
  className,
}: {
  colSpan: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className={cn("px-4 py-10 text-center text-muted-foreground", className)}>
        {children}
      </TableCell>
    </TableRow>
  )
}
