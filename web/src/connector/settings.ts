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

export type TerminationPolicy =
  | "threshold_or_max"
  | "threshold_only"
  | "max_only";

export interface GenerationSettings {
  threshold: number;
  maxRounds: number;
  terminationPolicy: TerminationPolicy;
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

const VALID_POLICIES: TerminationPolicy[] = [
  "threshold_or_max",
  "threshold_only",
  "max_only",
];

export function loadGenerationSettings(): GenerationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_GENERATION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GenerationSettings>;
    // maxRounds got a bigger upper bound (2..8) when we added the
    // threshold_only policy — headroom for teams that want a deeper debate.
    // Legacy settings saved with the older 2..6 cap still deserialize fine.
    return {
      threshold: clamp(parsed.threshold, 50, 100, DEFAULT_GENERATION_SETTINGS.threshold),
      maxRounds: clamp(parsed.maxRounds, 2, 8, DEFAULT_GENERATION_SETTINGS.maxRounds),
      terminationPolicy: VALID_POLICIES.includes(
        parsed.terminationPolicy as TerminationPolicy,
      )
        ? (parsed.terminationPolicy as TerminationPolicy)
        : DEFAULT_GENERATION_SETTINGS.terminationPolicy,
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
