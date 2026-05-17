export type Role = "admin" | "analyst" | "viewer"

export const ROLE_ORDER: Role[] = ["viewer", "analyst", "admin"]

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(requiredRole)
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Acceso total incluyendo usuarios y configuración",
  analyst: "Gestión de infraestructura y análisis de datos",
  viewer: "Solo lectura del dashboard",
}

export const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-rose-500/10 text-rose-400",
  analyst: "bg-cyan-500/10 text-cyan-400",
  viewer: "bg-slate-500/10 text-slate-400",
}
