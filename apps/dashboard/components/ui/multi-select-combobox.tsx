"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface MultiSelectOption {
  value: string
  label: string
  /** Optional swatch class shown as a small dot next to the label. */
  dotClassName?: string
}

interface MultiSelectComboboxProps {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Show a search box inside the dropdown. Defaults to false (short lists). */
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
}

/**
 * Compact multi-select built on the shadcn Popover + Command pattern.
 * Renders a trigger like "Level (2) ▾" and a checklist of options.
 */
export function MultiSelectCombobox({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  className,
  disabled,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false)
  const selectedSet = new Set(selected)

  function toggle(value: string) {
    const next = selectedSet.has(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-expanded={open}
          className={cn("h-9 gap-1.5", className)}
        >
          <span className="text-muted-foreground">{label}</span>
          {selected.length > 0 && (
            <span className="rounded bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
              {selected.length}
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-sm border",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    {option.dotClassName && (
                      <span className={cn("h-2 w-2 rounded-full", option.dotClassName)} />
                    )}
                    <span className="flex-1">{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
