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
