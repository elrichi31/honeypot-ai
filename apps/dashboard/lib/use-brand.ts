"use client"

import { useEffect, useState } from "react"
import type { Brand } from "@/lib/brand-config"

function isBrand(value: unknown): value is Brand {
  return value === "default" || value === "ist-americas"
}

/**
 * Instance-wide brand identity (login page + sidebar). Deterministic
 * "default" initial value on server and client (same trap as the sidebar's
 * role cache: reading localStorage in the initializer would desync SSR vs.
 * client render), then reconciled from localStorage and the server in
 * effects. Setting `data-brand` on <html> is what activates the brand's CSS
 * accent override in globals.css.
 */
export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>("default")

  useEffect(() => {
    const cached = localStorage.getItem("brand")
    if (isBrand(cached)) setBrand(cached)
  }, [])

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (isBrand(data?.brand)) {
          setBrand(data.brand)
          localStorage.setItem("brand", data.brand)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.dataset.brand = brand
  }, [brand])

  return brand
}
