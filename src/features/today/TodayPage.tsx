/**
 * Dashboard "Hoy" — pantalla inicial. Responde primero: "¿qué conviene estudiar
 * ahora y por qué?" (docs/PRODUCT_SPEC.md §6). Construcción completa en Fase 3;
 * esta cabecera atmosférica y el botón principal se implementan primero porque
 * fijan la identidad visual del resto del sistema (docs/DESIGN_SYSTEM.md §5).
 */
export function TodayPage() {
  return (
    <div className="flex h-full flex-col">
      <header
        className="relative overflow-hidden border-b border-border-subtle px-10 py-14"
        style={{
          background:
            "radial-gradient(1200px 400px at 20% -20%, var(--atmosphere-blue), transparent), radial-gradient(900px 400px at 90% 10%, var(--atmosphere-purple), transparent), var(--background-deep)",
        }}
      >
        <p className="text-sm text-text-secondary">
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-text-primary">
          Bienvenido al Instituto
        </h1>
        <p className="mt-3 max-w-xl text-text-secondary">
          Todavía no hay datos académicos cargados. Importá la estructura inicial
          (preguntas, competencias, materias, etapas) desde{" "}
          <code className="text-text-primary">seed/</code> para activar la
          recomendación de próxima acción.
        </p>
        <button
          disabled
          title="Disponible al completar la Fase 3 (protocolo INICIAR ESTUDIO)"
          className="mt-6 rounded border border-accent px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-accent opacity-50"
        >
          Iniciar estudio
        </button>
      </header>
      <div className="p-10 text-sm text-text-muted">
        Repasos vencidos, próximas sesiones, proyectos activos y estado semanal se
        muestran aquí a partir de la Fase 3 (ver docs/ROADMAP.md).
      </div>
    </div>
  );
}
