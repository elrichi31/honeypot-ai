"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"

interface SearchInputProps {
  defaultValue?: string
  placeholder?: string
  className?: string
}

export function SearchInput({ defaultValue = "", placeholder = "Search...", className }: SearchInputProps) {
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransitionOptional()
  const [value, setValue] = useState(defaultValue)
  const debounced = useDebounce(value, 350)

  useEffect(() => {
    setValue(defaultValue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue])

  useEffect(() => {
    const current = searchParams.get("q") ?? ""
    if (debounced === current) return
    if (debounced) {
      pushParams({ q: debounced }, ["page"])
    } else {
      pushParams({}, ["q", "page"])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return (
    <div className={`relative flex-1 min-w-[260px] ${className ?? ""}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
