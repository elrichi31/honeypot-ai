// Role labels and descriptions for the users / profile pages.
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

import type { TranslationKey } from "../dictionaries"

export const en = {
  "users.role.superadmin.label": "Super Admin",
  "users.role.admin.label": "Admin",
  "users.role.analyst.label": "Analyst",
  "users.role.viewer.label": "Viewer",

  "users.role.superadmin.description": "Global access to all clients (multi-tenant)",
  "users.role.admin.description": "Full access including users and configuration",
  "users.role.analyst.description": "Infrastructure management and data analysis",
  "users.role.viewer.description": "Read-only dashboard access",
} as const

export const es: Record<keyof typeof en, string> = {
  "users.role.superadmin.label": "Super Admin",
  "users.role.admin.label": "Admin",
  "users.role.analyst.label": "Analista",
  "users.role.viewer.label": "Observador",

  "users.role.superadmin.description": "Acceso global a todos los clientes (multi-tenant)",
  "users.role.admin.description": "Acceso completo, incluidos usuarios y configuración",
  "users.role.analyst.description": "Gestión de infraestructura y análisis de datos",
  "users.role.viewer.description": "Acceso de solo lectura al dashboard",
}

// Satisfies the full TranslationKey constraint once merged — verified at compile time in dictionaries.ts.
void (0 as unknown as keyof typeof en extends TranslationKey ? true : never)
