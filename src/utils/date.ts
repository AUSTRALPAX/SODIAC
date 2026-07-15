/**
 * Convierte el valor de un <input type="date"> (YYYY-MM-DD, sin zona
 * horaria) a un ISO string de medianoche en hora LOCAL. Parsear ese string
 * directamente con `new Date()` lo interpreta como UTC (spec de Date),
 * corriendo la fecha un día hacia atrás en zonas horarias negativas
 * (ej. Argentina, UTC-3) — bug real detectado al verificar la Fase 3.
 */
export function localDateInputToIso(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}
