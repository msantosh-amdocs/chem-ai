import type { SpecialistPersona } from "./personas";

export const AUTO_SMART_MODEL = "auto-smart";

/** Human-readable model label for UI chips and cards. */
export function formatModelLabel(
  model: string,
  params?: Record<string, string>,
): string {
  if (model === AUTO_SMART_MODEL && params?.optimize_for) {
    return `${model} (${params.optimize_for})`;
  }
  return model;
}

/**
 * Upgrade legacy model ids (Opus, terra, etc.) to Cursor Router auto-smart.
 * Returns `changed: true` when the persona was rewritten.
 */
export function migratePersonaModel(persona: SpecialistPersona): {
  persona: SpecialistPersona;
  changed: boolean;
} {
  const { model, params, changed } = migrateModelSelection(
    persona.model,
    persona.params ?? {},
  );
  if (!changed) return { persona, changed: false };
  return { persona: { ...persona, model, params }, changed: true };
}

export function migrateModelSelection(
  model: string,
  params: Record<string, string> = {},
): { model: string; params: Record<string, string>; changed: boolean } {
  if (/^claude-opus/i.test(model)) {
    return {
      model: AUTO_SMART_MODEL,
      params: { optimize_for: "intelligence" },
      changed: true,
    };
  }
  if (/^gpt-5\.6-terra$/i.test(model) || /^composer/i.test(model)) {
    return {
      model: AUTO_SMART_MODEL,
      params: { optimize_for: "cost" },
      changed: true,
    };
  }
  if (model === AUTO_SMART_MODEL && !params.optimize_for) {
    return {
      model,
      params: { optimize_for: "intelligence" },
      changed: true,
    };
  }
  return { model, params, changed: false };
}
