-- Fase 3 de la mejora integral: recalibra el techo de XP de carrera
-- proporcional al crecimiento real del currículo (492 -> 554 temas tras la
-- Fase 2), sin ceremonia de curva por tramos porque hoy no hay XP real
-- otorgado (xp_event tiene 0 filas, nivel 0) — no hay nada que preservar.
-- frozen_at_level/frozen_at_xp quedan NULL: el mecanismo de recalibración
-- no destructiva ya existe (xpRequiredForLevelWithRules en
-- src/services/xpRulesVersion.ts) para la próxima vez que sí haga falta.
--
-- 100000 * 554 / 492 = 112601.63... -> redondeado a 112600.
UPDATE xp_rules_version
SET career_total_xp = 112600,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'xp-rules-v1';
