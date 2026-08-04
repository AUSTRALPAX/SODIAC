-- Reversión de contenidos marcados como completados por error.
--
-- Principio: NADA se borra. El `xp_event` original se conserva y la reversión
-- agrega un evento compensatorio negativo (`amount < 0`, `reversal_of` apuntando
-- al original). Esta tabla es la bitácora de por qué se revirtió cada cosa.
--
-- Sigue el precedente de `task_history`, que ya guarda un `reason` por cambio.
-- Aditiva: no toca ninguna tabla existente.
CREATE TABLE completion_reversal (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('topic','subject')),
  entity_id TEXT NOT NULL,

  -- Estado previo, para poder auditar (y eventualmente rehacer) sin depender
  -- de reconstruirlo desde activity_log.
  completed_at_before TEXT,
  status_before TEXT,

  reason_code TEXT NOT NULL CHECK (reason_code IN
    ('sesion_prueba','marcado_por_error','contenido_no_estudiado',
     'evidencia_insuficiente','otro')),
  user_note TEXT,

  -- El evento original queda referenciado, nunca borrado; el compensatorio es
  -- el que netea el XP a cero. Ambos pueden ser NULL: un tema completado antes
  -- de que existiera el pool de XP por finalización no tiene evento asociado.
  original_xp_event_id TEXT REFERENCES xp_event(id),
  reversal_xp_event_id TEXT REFERENCES xp_event(id),

  -- La sesión que lo completó, si se pudo determinar. No se borra ni se
  -- modifica: revertir el tema no invalida que la sesión ocurrió.
  study_session_id TEXT REFERENCES study_session(id),

  -- Cuántas filas de academic_level_history se purgaron por quedar por encima
  -- del nivel resultante. Es la única excepción deliberada al "no borrar", con
  -- la misma justificación que academicLevelHistoryCleanup.ts: esa tabla sólo
  -- registra máximos y una fila que miente impide volver a registrar el nivel.
  purged_level_history INTEGER NOT NULL DEFAULT 0,

  reverted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_completion_reversal_entity
  ON completion_reversal(entity_type, entity_id);

CREATE INDEX idx_completion_reversal_reverted_at
  ON completion_reversal(reverted_at DESC);

-- Una segunda reversión del mismo evento de XP no debe poder existir. El UNIQUE
-- sobre `xp_event.idempotency_key` ya lo impide del lado del XP; esto lo impide
-- también del lado de la bitácora, incluso para entidades sin evento asociado.
CREATE UNIQUE INDEX idx_completion_reversal_original_xp
  ON completion_reversal(original_xp_event_id)
  WHERE original_xp_event_id IS NOT NULL;
