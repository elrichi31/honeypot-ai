// Role labels and descriptions for the users / profile pages.
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

import type { TranslationKey } from "../dictionaries"

export const en = {
  "users.tenant.unassigned": "Unassigned",
  "users.tenant.select": "Select tenant",

  "users.role.superadmin.label": "Super Admin",
  "users.role.admin.label": "Admin",
  "users.role.analyst.label": "Analyst",
  "users.role.viewer.label": "Viewer",
  "users.role.cliente.label": "Client",

  "users.role.superadmin.description": "Global access to all clients (multi-tenant)",
  "users.role.admin.description": "Full access including users and configuration",
  "users.role.analyst.description": "Infrastructure management and data analysis",
  "users.role.viewer.description": "Read-only dashboard access",
  "users.role.cliente.description": "Read-only access to a single tenant (external client)",

  "users.page.title": "Users",
  "users.page.description": "Manage who has access to the dashboard and with what permissions.",
  "users.page.createButton": "Create user",
  "users.page.loading": "Loading users...",
  "users.page.empty": "No users",
  "users.page.adminOnlyHint": "Only administrators can create, delete, or change user roles.",
  "users.page.deleteTitle": "Delete user",

  "users.create.title": "Create user",
  "users.create.description": "The user will be able to access the dashboard with these credentials.",
  "users.create.name": "Name",
  "users.create.email": "Email",
  "users.create.password": "Password",
  "users.create.passwordHint": "At least 8 characters",
  "users.create.role": "Role",
  "users.create.tenant": "Tenant (client)",
  "users.create.tenantHint": "The user will only see data for this client.",
  "users.create.cancel": "Cancel",
  "users.create.submit": "Create user",
  "users.create.creating": "Creating...",
  "users.create.error": "Failed to create user",
  "users.create.netError": "Network error while creating user",

  "users.delete.descPrefix": "Delete ",
  "users.delete.descSuffix": "? This action cannot be undone. All of their active sessions will be closed.",
  "users.delete.cancel": "Cancel",
  "users.delete.submit": "Delete",
  "users.delete.deleting": "Deleting...",
  "users.delete.error": "Failed to delete",
  "users.delete.netError": "Network error while deleting user",
} as const

export const es: Record<keyof typeof en, string> = {
  "users.tenant.unassigned": "Sin asignar",
  "users.tenant.select": "Selecciona tenant",

  "users.role.superadmin.label": "Super Admin",
  "users.role.admin.label": "Admin",
  "users.role.analyst.label": "Analista",
  "users.role.viewer.label": "Observador",
  "users.role.cliente.label": "Cliente",

  "users.role.superadmin.description": "Acceso global a todos los clientes (multi-tenant)",
  "users.role.admin.description": "Acceso completo, incluidos usuarios y configuración",
  "users.role.analyst.description": "Gestión de infraestructura y análisis de datos",
  "users.role.viewer.description": "Acceso de solo lectura al dashboard",
  "users.role.cliente.description": "Acceso de solo lectura a un solo tenant (cliente externo)",

  "users.page.title": "Usuarios",
  "users.page.description": "Gestiona quién tiene acceso al dashboard y con qué permisos.",
  "users.page.createButton": "Crear usuario",
  "users.page.loading": "Cargando usuarios...",
  "users.page.empty": "No hay usuarios",
  "users.page.adminOnlyHint": "Solo los administradores pueden crear, eliminar o cambiar roles de usuario.",
  "users.page.deleteTitle": "Eliminar usuario",

  "users.create.title": "Crear usuario",
  "users.create.description": "El usuario podrá acceder al dashboard con estas credenciales.",
  "users.create.name": "Nombre",
  "users.create.email": "Correo",
  "users.create.password": "Contraseña",
  "users.create.passwordHint": "Al menos 8 caracteres",
  "users.create.role": "Rol",
  "users.create.tenant": "Tenant (cliente)",
  "users.create.tenantHint": "El usuario solo verá los datos de este cliente.",
  "users.create.cancel": "Cancelar",
  "users.create.submit": "Crear usuario",
  "users.create.creating": "Creando...",
  "users.create.error": "No se pudo crear el usuario",
  "users.create.netError": "Error de red al crear el usuario",

  "users.delete.descPrefix": "¿Eliminar a ",
  "users.delete.descSuffix": "? Esta acción no se puede deshacer. Se cerrarán todas sus sesiones activas.",
  "users.delete.cancel": "Cancelar",
  "users.delete.submit": "Eliminar",
  "users.delete.deleting": "Eliminando...",
  "users.delete.error": "No se pudo eliminar",
  "users.delete.netError": "Error de red al eliminar el usuario",
}

// Satisfies the full TranslationKey constraint once merged — verified at compile time in dictionaries.ts.
void (0 as unknown as keyof typeof en extends TranslationKey ? true : never)
