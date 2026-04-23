import type { RiskLevel } from "@/lib/api"

// ── Web attack types ────────────────────────────────────────────────────────

/** Tailwind badge classes for web attack types */
export const ATTACK_COLORS: Record<string, string> = {
  sqli:            "bg-red-500/15 text-red-400 border-red-500/30",
  xss:             "bg-orange-500/15 text-orange-400 border-orange-500/30",
  lfi:             "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  rfi:             "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cmdi:            "bg-purple-500/15 text-purple-400 border-purple-500/30",
  scanner:         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  info_disclosure: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  recon:           "bg-muted/50 text-muted-foreground border-border",
}

/** Hex colors for charts (recharts, etc.) */
export const ATTACK_COLORS_HEX: Record<string, string> = {
  sqli:            "#ef4444",
  xss:             "#f97316",
  lfi:             "#eab308",
  rfi:             "#ca8a04",
  cmdi:            "#a855f7",
  scanner:         "#3b82f6",
  info_disclosure: "#06b6d4",
  recon:           "#6b7280",
}

export const ATTACK_LABELS: Record<string, string> = {
  sqli:            "SQLi",
  xss:             "XSS",
  lfi:             "LFI",
  rfi:             "RFI",
  cmdi:            "CmdI",
  scanner:         "Scanner",
  info_disclosure: "Info",
  recon:           "Recon",
}

export const ATTACK_LABELS_LONG: Record<string, string> = {
  sqli:            "SQL Injection",
  xss:             "XSS",
  lfi:             "LFI",
  rfi:             "RFI",
  cmdi:            "Cmd Injection",
  scanner:         "Scanner",
  info_disclosure: "Info Disclosure",
  recon:           "Recon",
}

// ── Risk levels ─────────────────────────────────────────────────────────────

export const LEVEL_STYLES: Record<RiskLevel, { badge: string; bg: string; bar: string; dot: string }> = {
  CRITICAL: { badge: "bg-red-500/15 text-red-400 border-red-500/40",         bg: "bg-red-500/10",    bar: "bg-red-500",         dot: "bg-red-500"         },
  HIGH:     { badge: "bg-orange-500/15 text-orange-400 border-orange-500/40", bg: "bg-orange-500/10", bar: "bg-orange-500",       dot: "bg-orange-500"       },
  MEDIUM:   { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40", bg: "bg-yellow-500/10", bar: "bg-yellow-500",       dot: "bg-yellow-500"       },
  LOW:      { badge: "bg-blue-500/15 text-blue-400 border-blue-500/40",       bg: "bg-blue-500/10",   bar: "bg-blue-500",         dot: "bg-blue-500"         },
  INFO:     { badge: "bg-muted/40 text-muted-foreground border-border",        bg: "bg-muted/20",      bar: "bg-muted-foreground", dot: "bg-muted-foreground" },
}

// ── Command categories ───────────────────────────────────────────────────────

/** Tailwind badge classes for command categories */
export const CMD_COLORS: Record<string, string> = {
  malware_drop:     "bg-red-500/15 text-red-400 border-red-500/30",
  persistence:      "bg-orange-500/15 text-orange-400 border-orange-500/30",
  lateral_movement: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  crypto_mining:    "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  data_exfil:       "bg-pink-500/15 text-pink-400 border-pink-500/30",
  recon:            "bg-muted/50 text-muted-foreground border-border",
  other:            "bg-muted/30 text-muted-foreground border-border",
}

export const CMD_LABELS: Record<string, string> = {
  malware_drop:     "Malware Drop",
  persistence:      "Persistence",
  lateral_movement: "Lateral Movement",
  crypto_mining:    "Crypto Mining",
  data_exfil:       "Data Exfil",
  recon:            "Recon",
  other:            "Other",
}

export const CMD_LABELS_SHORT: Record<string, string> = {
  malware_drop:     "Malware",
  persistence:      "Persist",
  lateral_movement: "Lateral",
  crypto_mining:    "Mining",
  data_exfil:       "Exfil",
  recon:            "Recon",
  other:            "Other",
}
