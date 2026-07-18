import { useState } from "react";
import { Link } from "react-router-dom";

interface ToolRole {
  name: string;
  role: string;
  should: string[];
  shouldNot?: string;
}

const TOOL_ROLES: ToolRole[] = [
  {
    name: "SODIAC",
    role: "Sistema rector y operativo.",
    should: [
      "indicar qué estudiar y mostrar el cronograma",
      "iniciar sesiones y registrar tiempo, dificultad y continuidad",
      "administrar carrera, progreso, experiencia y niveles",
      "programar repasos y mostrar estadísticas",
      "conservar el historial académico y conectar las demás herramientas",
    ],
  },
  {
    name: "Obsidian",
    role: "Memoria permanente del conocimiento.",
    should: [
      "notas conceptuales, mapas conceptuales y relaciones entre ideas",
      "contenido consolidado, resúmenes y fuentes",
      "preguntas abiertas y evolución de las notas",
    ],
    shouldNot: "no debe usarse como espacio de borradores temporales — eso es SODIAC o NotebookLM.",
  },
  {
    name: "NotebookLM",
    role: "Entorno temporal para trabajar con fuentes.",
    should: [
      "cargar libros, documentos o PDFs y consultar fuentes",
      "contrastar información y generar resúmenes o infografías",
      "detectar conexiones y preparar materiales de estudio",
    ],
    shouldNot: "no debe convertirse en la memoria permanente del Instituto — eso es Obsidian.",
  },
  {
    name: "ChatGPT",
    role: "Espacio de conversación académica.",
    should: [
      "estudiar, dialogar, preguntar y resolver problemas",
      "cuestionar ideas, explicar conceptos y generar ejercicios",
      "revisar comprensión y ayudar a transformar materiales en una nota final",
    ],
    shouldNot: "su contenido no se considera conocimiento consolidado hasta que se apruebe en una nota de Obsidian.",
  },
];

interface WorkflowStage {
  id: string;
  title: string;
  objetivo: string;
  herramienta: string;
  acciones: string[];
  resultado: string;
  criterio: string;
  actions: { label: string; to: string }[];
}

const STAGES: WorkflowStage[] = [
  {
    id: "orientar",
    title: "1. Orientar",
    objetivo: "Identificar con claridad qué lección o tema corresponde estudiar ahora.",
    herramienta: "SODIAC",
    acciones: [
      "Abrir Dashboard, Carrera o Cronograma Maestro",
      "Consultar materia, unidad, tema, pregunta fundamental, competencia y bibliografía",
      "Revisar notas existentes, proyecto relacionado y XP disponible",
    ],
    resultado: "Una lección o tema activo claramente identificado.",
    criterio: "Sabés exactamente qué vas a estudiar antes de empezar.",
    actions: [
      { label: "Ver Dashboard", to: "/dashboard" },
      { label: "Ver Carrera", to: "/carrera" },
    ],
  },
  {
    id: "preparar",
    title: "2. Preparar",
    objetivo: "Reunir el contexto necesario antes de iniciar la sesión.",
    herramienta: "SODIAC",
    acciones: [
      "Al iniciar sesión, se reúnen materia, objetivo, bibliografía, notas previas y punto de continuidad",
      "Elegir el tipo de trabajo: explicación, lectura, debate, ejercicio, investigación, aplicación, producción o repaso",
    ],
    resultado: "Una sesión preparada con contexto suficiente.",
    criterio: "Tenés todo lo necesario a mano antes de empezar a estudiar.",
    actions: [{ label: "Iniciar sesión nueva", to: "/sesiones/nueva" }],
  },
  {
    id: "investigar",
    title: "3. Investigar",
    objetivo: "Consultar fuentes y preparar materiales de estudio.",
    herramienta: "NotebookLM, Biblioteca y Documentos",
    acciones: [
      "Abrir bibliografía, PDFs o NotebookLM desde la sesión activa",
      "SODIAC registra qué fuente fue abierta, consultada, utilizada o citada",
      "No es necesario copiar todo el contenido producido en NotebookLM",
    ],
    resultado: "Fuentes identificadas y registradas como consultadas.",
    criterio: "Tenés el material de base para estudiar el tema.",
    actions: [
      { label: "Ver Biblioteca", to: "/biblioteca" },
      { label: "Ver Documentos", to: "/documentos" },
    ],
  },
  {
    id: "estudiar",
    title: "4. Estudiar",
    objetivo: "Trabajar el contenido y registrar el proceso real de estudio.",
    herramienta: "ChatGPT, SODIAC y los recursos seleccionados",
    acciones: [
      "Registrar tiempo, pausas, dificultad percibida y preguntas durante la sesión",
      "Usar ChatGPT para conversar, resolver dudas, generar ejemplos y ejercicios",
      "El contenido de ChatGPT no se considera automáticamente conocimiento consolidado",
    ],
    resultado: "Avance real de comprensión, con dudas y descubrimientos registrados.",
    criterio: "Podés esbozar una explicación propia del tema, aunque sea incompleta.",
    actions: [{ label: "Ver sesión en curso", to: "/sesiones" }],
  },
  {
    id: "consolidar",
    title: "5. Consolidar",
    objetivo: "Dejar el conocimiento final en una nota propia, no solo en la conversación.",
    herramienta: "Obsidian",
    acciones: [
      "Abrir o crear la nota del tema desde SODIAC",
      "Escribir definición, explicación propia, relaciones, aplicaciones, límites y preguntas abiertas",
      "No se copia automáticamente lo generado por ChatGPT o NotebookLM — el usuario aprueba y consolida",
    ],
    resultado: "Una nota consolidada en Obsidian, vinculada al tema.",
    criterio: "Existe una nota (o evidencia equivalente) antes de pasar a validar.",
    actions: [{ label: "Ir a Obsidian", to: "/obsidian" }],
  },
  {
    id: "validar",
    title: "6. Validar",
    objetivo: "Comprobar si realmente podés explicar, relacionar y aplicar el contenido.",
    herramienta: "SODIAC (autoevaluación) o ChatGPT (con un único prompt)",
    acciones: [
      "Entre 3 y 10 preguntas (5 por defecto): explicación propia, relación, comparación, aplicación, caso, objeción",
      "Modo A: autoevaluación local con rúbrica, sin Internet",
      "Modo B: SODIAC arma un prompt único para ChatGPT, que pregunta, evalúa y devuelve una calificación",
    ],
    resultado: "Un resultado de validación (evaluación asistida por criterios, no una nota objetiva absoluta).",
    criterio: "Alcanzás el umbral de aprobación configurado (75/100 por defecto).",
    actions: [{ label: "Ver Trayectoria", to: "/trajectory" }],
  },
  {
    id: "acreditar",
    title: "7. Acreditar",
    objetivo: "Reconocer el dominio alcanzado con experiencia (XP) real, no solo con una casilla.",
    herramienta: "SODIAC",
    acciones: [
      "El XP del tema se reparte: sesión y trabajo (20%), nota consolidada (30%), validación aprobada (40%), repaso diferido (10%)",
      "Cada evento tiene una clave de idempotencia — nunca se duplica el XP",
    ],
    resultado: "XP acreditado de forma proporcional a la evidencia real.",
    criterio: "El tema queda marcado como dominado cuando se completan sus componentes.",
    actions: [{ label: "Ver Trayectoria", to: "/trajectory" }],
  },
  {
    id: "repasar",
    title: "8. Repasar",
    objetivo: "Sostener en el tiempo lo que ya se comprendió.",
    herramienta: "SODIAC",
    acciones: [
      "Se programa un repaso al finalizar la sesión o cuando el conocimiento se enfría",
      "El repaso reutiliza errores y respuestas anteriores, no vuelve a empezar de cero",
    ],
    resultado: "Un repaso completado que actualiza la retención del tema.",
    criterio: "El enfriamiento nunca reduce el XP ya obtenido, solo indica que conviene repasar.",
    actions: [{ label: "Ver Repasos", to: "/repasos" }],
  },
  {
    id: "continuar",
    title: "9. Continuar",
    objetivo: "Retomar sin perder el hilo, incluso después de mucho tiempo sin estudiar.",
    herramienta: "SODIAC",
    acciones: [
      "El punto de continuidad y la próxima acción quedan guardados al finalizar cada sesión",
      "El Cronograma Maestro y Carrera siempre muestran qué sigue",
    ],
    resultado: "Podés retomar la carrera en cualquier momento sin tener que reconstruir el contexto.",
    criterio: "Sabés qué es lo próximo que corresponde estudiar.",
    actions: [{ label: "Ver Cronograma Maestro", to: "/carrera" }],
  },
];

export function WorkflowGuide() {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [showToolRoles, setShowToolRoles] = useState(false);

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
        Flujo de trabajo
      </h2>
      <p className="mt-1 text-xs text-text-muted">
        Guía navegable del proceso completo de estudio: qué herramienta usar en cada momento,
        cuándo una sesión está realmente terminada, y cómo retomar después de un tiempo sin
        estudiar.
      </p>

      <button
        onClick={() => setShowToolRoles((v) => !v)}
        className="mt-3 rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
      >
        {showToolRoles ? "Ocultar" : "Ver"} el rol de cada herramienta
      </button>
      {showToolRoles && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {TOOL_ROLES.map((tool) => (
            <div key={tool.name} className="rounded border border-border-subtle bg-surface p-3 text-xs">
              <p className="font-semibold text-text-primary">{tool.name}</p>
              <p className="mt-0.5 text-text-secondary">{tool.role}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-text-muted">
                {tool.should.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {tool.shouldNot && <p className="mt-2 text-text-muted italic">{tool.shouldNot}</p>}
            </div>
          ))}
        </div>
      )}

      <ol className="mt-4 space-y-2">
        {STAGES.map((stage, index) => {
          const isOpen = expandedStage === stage.id;
          return (
            <li key={stage.id} className="rounded border border-border-subtle bg-surface">
              <button
                onClick={() => setExpandedStage(isOpen ? null : stage.id)}
                className="flex w-full items-center justify-between gap-4 p-3 text-left text-sm"
              >
                <span className="text-text-primary">{stage.title}</span>
                <span className="text-xs text-text-muted">{isOpen ? "Ocultar ▲" : "Ver detalle ▼"}</span>
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-border-subtle p-3 text-xs">
                  <p>
                    <span className="text-text-muted">Objetivo: </span>
                    <span className="text-text-secondary">{stage.objetivo}</span>
                  </p>
                  <p>
                    <span className="text-text-muted">Herramienta principal: </span>
                    <span className="text-text-secondary">{stage.herramienta}</span>
                  </p>
                  <div>
                    <span className="text-text-muted">Acciones: </span>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-secondary">
                      {stage.acciones.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                  <p>
                    <span className="text-text-muted">Resultado esperado: </span>
                    <span className="text-text-secondary">{stage.resultado}</span>
                  </p>
                  <p>
                    <span className="text-text-muted">Criterio para avanzar: </span>
                    <span className="text-text-secondary">{stage.criterio}</span>
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {stage.actions.map((action) => (
                      <Link
                        key={action.to}
                        to={action.to}
                        className="rounded border border-accent px-2 py-1 text-xs text-accent hover:bg-accent/10"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {index < STAGES.length - 1 && !isOpen && (
                <div className="flex justify-center pb-1 text-text-muted">↓</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
