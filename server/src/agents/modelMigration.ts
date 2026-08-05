import type { ArchitectureSession, Specialist } from "../types.js";

export const AUTO_SMART_MODEL = "auto-smart";

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

export function migrateSpecialist(
  specialist: Specialist,
): { specialist: Specialist; changed: boolean } {
  const { model, params, changed } = migrateModelSelection(
    specialist.model,
    specialist.params ?? {},
  );
  if (!changed) return { specialist, changed: false };
  return { specialist: { ...specialist, model, params }, changed: true };
}

/** Rewrite legacy Opus/terra defaults inside a persisted session snapshot. */
export function migrateSessionSpecialists(session: ArchitectureSession): {
  session: ArchitectureSession;
  changed: boolean;
} {
  let changed = false;
  const analystResult = migrateSpecialist(session.specialists.analyst);
  changed ||= analystResult.changed;

  const teams = session.specialists.teams.map((team) => {
    const members = team.members.map((member) => {
      const result = migrateSpecialist(member);
      changed ||= result.changed;
      return result.specialist;
    });
    return { ...team, members };
  });

  if (!changed) return { session, changed: false };
  return {
    session: {
      ...session,
      specialists: { analyst: analystResult.specialist, teams },
    },
    changed: true,
  };
}
