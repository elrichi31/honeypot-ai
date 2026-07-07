export type Brand = "default" | "ist-americas"

export interface BrandInfo {
  name: string
  tagline: string
  /** Square mark only (no wordmark) — collapsed sidebar rail. */
  logoMark: string
  /** White lockup (mark + wordmark, no slogan) — expanded sidebar header. */
  logoWide: string
  /** Full lockup (mark + wordmark + slogan) — login page. */
  logoFull: string
}

// Only the non-default brand needs assets here — the default identity
// ("HoneyTrap") stays hardcoded at each call site exactly as it is today.
export const BRANDS: Record<Exclude<Brand, "default">, BrandInfo> = {
  "ist-americas": {
    name: "IST AMERICAS",
    tagline: "The Threat Intelligence Company",
    logoMark: "/brands/ist-americas/logo-mark.svg",
    logoWide: "/brands/ist-americas/logo-wide.png",
    logoFull: "/brands/ist-americas/logo-full.svg",
  },
}
