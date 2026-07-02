// Shared strings used across multiple features (e.g. table pagination).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  // ── Table pagination ────────────────────────────────────────────────────────
  "common.pagination.showing": "Showing {start}-{end} of {total}",
  "common.pagination.perPage": "Per page",
  "common.pagination.previous": "Previous",
  "common.pagination.next": "Next",
  "common.pagination.pageOf": "Page {page} / {totalPages}",
} as const

export const es: Record<keyof typeof en, string> = {
  // ── Table pagination ────────────────────────────────────────────────────────
  "common.pagination.showing": "Mostrando {start}-{end} de {total}",
  "common.pagination.perPage": "Por página",
  "common.pagination.previous": "Anterior",
  "common.pagination.next": "Siguiente",
  "common.pagination.pageOf": "Página {page} / {totalPages}",
}
