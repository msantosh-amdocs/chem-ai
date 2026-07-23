import {
  DEFAULT_GENERATION_SETTINGS,
  KIND_MIN_MEMBERS,
  PRODUCER_KINDS,
  defaultAnalyst,
  defaultTeams,
  type DocumentKind,
  type SpecialistPersona,
  type TeamPersona,
} from "./personas";

const SPECIALISTS_KEY = "mr.specialists.v1";
const SETTINGS_KEY = "mr.settings.v1";

export interface SpecialistsSettings {
  analyst: SpecialistPersona;
  teams: TeamPersona[];
}

export interface GenerationSettings {
  threshold: number;
  maxRounds: number;
}

function defaultSpecialists(): SpecialistsSettings {
  return { analyst: defaultAnalyst(), teams: defaultTeams() };
}

function normalizeTeam(t: TeamPersona | undefined, kind: DocumentKind): TeamPersona {
  const min = KIND_MIN_MEMBERS[kind];
  const fallback = defaultTeams().find((x) => x.kind === kind)!;
  if (!t || !Array.isArray(t.members) || t.members.length === 0) {
    return { kind, minMembers: min, members: fallback.members };
  }
  // Ensure produces field matches team kind on all members.
  const members = t.members.map((m) => ({ ...m, produces: kind }));
  return { kind, minMembers: min, members };
}

export function loadSpecialists(): SpecialistsSettings {
  try {
    const raw = localStorage.getItem(SPECIALISTS_KEY);
    if (!raw) return defaultSpecialists();
    const parsed = JSON.parse(raw) as Partial<SpecialistsSettings>;
    const analyst = parsed.analyst ?? defaultAnalyst();
    const teams = PRODUCER_KINDS.map((kind) => {
      const found = Array.isArray(parsed.teams)
        ? parsed.teams.find((t) => t.kind === kind)
        : undefined;
      return normalizeTeam(found, kind);
    });
    return { analyst, teams };
  } catch {
    return defaultSpecialists();
  }
}

export function saveSpecialists(s: SpecialistsSettings): void {
  localStorage.setItem(SPECIALISTS_KEY, JSON.stringify(s));
}

export function resetSpecialists(): SpecialistsSettings {
  localStorage.removeItem(SPECIALISTS_KEY);
  return defaultSpecialists();
}

export function loadGenerationSettings(): GenerationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_GENERATION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GenerationSettings>;
    return {
      threshold: clamp(parsed.threshold, 50, 100, DEFAULT_GENERATION_SETTINGS.threshold),
      maxRounds: clamp(parsed.maxRounds, 2, 6, DEFAULT_GENERATION_SETTINGS.maxRounds),
    };
  } catch {
    return { ...DEFAULT_GENERATION_SETTINGS };
  }
}

export function saveGenerationSettings(s: GenerationSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function resetGenerationSettings(): GenerationSettings {
  localStorage.removeItem(SETTINGS_KEY);
  return { ...DEFAULT_GENERATION_SETTINGS };
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
