import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parsePage(value: string | undefined): number {
  const n = Number(value ?? "1")
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}
