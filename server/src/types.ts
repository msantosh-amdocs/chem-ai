/**
 * Domain types for the Chem AI app.
 *
 * A session takes a raw idea (a new factory or expansion in the chemical,
 * pharma, or semiconductor industry), refines it with the Analyst via
 * interactive Q&A, then hands the refined concept to specialist DEPARTMENTS.
 * Each department debates to produce one artifact — members write initial
 * drafts in round 1, then critique each other and revise until every
 * member's self-scored agreement with the collective hits the threshold
 * (default 95%) or `maxRounds` is reached. The department lead's final
 * draft becomes the artifact of record.
 *
 * Departments (in canonical order):
 *   1. Market Analysis
 *   2. Procedure       (route of synthesis, mass balance, hazards, scale-up)
 *   3. Procurement     (hardware + raw materials + landed cost)
 *   4. Intellectual Property (freedom-to-operate, patent landscape)
 *   5. Finance         (5-yr projections, unit economics, sales forecast)
 *   6. Presentation    (executive summary + full report)
 */

export type SpecialistRole =
  | "analyst"
  | "market_analyst"
  | "process_engineer"
  | "procurement_specialist"
  | "finance_analyst"
  | "ip_analyst"
  | "presenter";

/** Which artifact this specialist produces (analyst has none). */
export type DocumentKind =
  | "market"
  | "procedure"
  | "procurement"
  | "ip"
  | "finance"
  | "presentation";

export interface AgentAccent {
  text: string;
  bg: string;
  border: string;
  solid: string;
  ring: string;
}

/**
 * Full configuration for a specialist. Snapshotted into a session at start
 * time so old sessions still render correctly after the user renames or
 * reconfigures them later.
 */
export interface Specialist {
  id: string;
  role: SpecialistRole;
  /** For team members: which artifact this department produces. Undefined for analyst. */
  produces?: DocumentKind;
  name: string;
  tagline: string;
  roleDescription: string;
  tone: string;
  model: string;
  params: Record<string, string>;
  avatarId: string;
  accent: AgentAccent;
}

/** A specialist department responsible for one artifact. */
export interface StageTeam {
  kind: DocumentKind;
  /** Ordered — index 0 is the lead (their final draft becomes the artifact). */
  members: Specialist[];
  /** Enforced at start of debate. */
  minMembers: number;
}

/**
 * How a department's debate loop decides to stop.
 *
 * - `threshold_or_max` (default): stop as soon as every member's self-
 *   scored agreement hits `threshold` OR we hit `maxRounds`, whichever
 *   comes first. This is the classic behaviour.
 * - `threshold_only`: only stop when the threshold is met; `maxRounds` is
 *   ignored. A hard safety cap (`HARD_ROUND_CAP` in the orchestrator)
 *   still applies so a runaway debate can't spin forever.
 * - `max_only`: always run every round up to `maxRounds` regardless of
 *   agreement. Useful when the operator wants a deep debate trail even
 *   after early consensus.
 */
export type TerminationPolicy =
  | "threshold_or_max"
  | "threshold_only"
  | "max_only";

export interface GenerationSettings {
  /** Debate stops when every member reports agreement ≥ threshold. Default 95. */
  threshold: number;
  /** Upper bound on debate rounds per department. Default 4. */
  maxRounds: number;
  /**
   * How to combine `threshold` and `maxRounds`. Optional for backward
   * compatibility with sessions written before this field existed —
   * unset means `"threshold_or_max"`.
   */
  terminationPolicy?: TerminationPolicy;
}

/**
 * Cost accounting for a single LLM call — mirrors the Cursor SDK
 * `TokenUsage` fields plus the estimated USD we computed at the time
 * of the call.
 */
export interface LlmCallCost {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** Estimate — see `agents/costs.ts` for the rate table. */
  estimatedUsd: number;
  /** ISO timestamp of when the call completed. */
  at: string;
}

/**
 * Aggregated cost for a single scope (analyst refinement, one department,
 * or the whole session).
 */
export interface StageCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  llmCalls: number;
}

export interface SessionCosts {
  /** Refinement rounds + refined-concept generation by the analyst. */
  analyst: StageCost;
  /** Debate calls, keyed by department kind. */
  perTeam: Partial<Record<DocumentKind, StageCost>>;
  /** Whole-session rollup. */
  total: StageCost;
  /**
   * Whether the underlying SDK reported usage for every call. When false,
   * the estimate is a lower bound — some calls contributed no cost.
   */
  usageComplete: boolean;
}

export interface UploadedDoc {
  id: string;
  filename: string;
  kind: "pdf" | "docx" | "text";
  sizeBytes: number;
  chars: number;
  uploadedAt: string;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Refinement
 * ────────────────────────────────────────────────────────────────────────── */

export interface ClarifyQuestion {
  id: string;
  question: string;
  whyItMatters: string;
  category:
    | "product"
    | "industry"
    | "scale"
    | "geography"
    | "budget"
    | "timeline"
    | "regulatory"
    | "constraints"
    | "risks"
    | "other";
  hint?: string;
  importance: "high" | "medium" | "low";
}

export interface ClarifyAnswer {
  questionId: string;
  answer: string;
}

export interface RefinementRound {
  n: number;
  interpretation: string;
  questions: ClarifyQuestion[];
  answers: ClarifyAnswer[];
  completeness: number;
  note?: string;
  createdAt: string;
}

export interface RefinedIdea {
  content: string;
  createdAt: string;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Debate rounds per department
 * ────────────────────────────────────────────────────────────────────────── */

export interface StageRoundDraft {
  /** Specialist.id — matches a member of the department. */
  memberId: string;
  content: string;
  /** Present from round 2 onwards. */
  critique?: string;
  /**
   * 0-100. In round 1 this is 0 (no comparison yet). From round 2 onwards
   * it is the member's self-scored alignment of THIS draft with the
   * collective of teammates' latest drafts.
   */
  agreementWithOthers: number;
  createdAt: string;
}

export interface StageRound {
  n: number;
  drafts: StageRoundDraft[];
  startedAt: string;
  endedAt: string;
}

export interface DocumentArtifact {
  kind: DocumentKind;
  title: string;
  /** The department lead's final revised draft — the artifact of record. */
  content: string;
  /** Specialist.id of the lead. */
  producedBy: string;
  createdAt: string;
  /** True while the debate is running. */
  streaming?: boolean;
  /** Error message if the whole department stage failed. */
  error?: string;
  /** Full debate trail. */
  rounds: StageRound[];
  terminatedBy?: "agreement" | "maxRounds" | "error";
  /** memberId → final round's agreement % */
  finalAgreements: Record<string, number>;
  /**
   * ISO timestamp when this department stage started (before round 1
   * drafts fan out). Written eagerly on the streaming placeholder so
   * the UI can display an in-flight duration; never rewritten once set.
   */
  startedAt?: string;
  /**
   * ISO timestamp when the department stage terminated (success or
   * error). Together with `startedAt` this gives the wall-clock
   * duration of this department's contribution to the run.
   */
  endedAt?: string;
  /**
   * Convenience — `endedAt - startedAt` in milliseconds. Persisted
   * alongside the timestamps so the client doesn't need to reparse
   * ISO strings for every render.
   */
  durationMs?: number;
}

export type SessionStatus =
  | "refining"
  | "locked"
  | "generating"
  | "completed"
  | "error"
  | "cancelled";

/**
 * Wall-clock durations for the different phases of a run, in
 * milliseconds. All fields are optional — a session written before this
 * struct existed, or one that hasn't reached a phase yet, will simply
 * omit the field. Consumers should compute totals defensively.
 */
export interface SessionDurations {
  /**
   * Time spent in analyst-driven work — refinement Q&A rounds plus the
   * final refined-concept generation. Measured from the first
   * refinement round's `createdAt` to `refinedIdea.createdAt`.
   */
  analystMs?: number;
  /**
   * Per-department wall-clock duration in milliseconds. Populated as
   * each department's `DocumentArtifact` gets its `endedAt`.
   */
  perTeam: Partial<Record<DocumentKind, number>>;
  /**
   * End-to-end duration: `session.endedAt - session.createdAt`. Set
   * when the session reaches a terminal status (completed / error /
   * cancelled).
   */
  totalMs?: number;
}

export interface ArchitectureSession {
  id: string;
  title: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;

  settings: GenerationSettings;

  specialists: {
    analyst: Specialist;
    teams: StageTeam[];
  };

  documents: UploadedDoc[];

  refinement: RefinementRound[];
  refinedIdea?: RefinedIdea;

  artifacts: DocumentArtifact[];

  /** Rolled-up token + estimated USD cost. Populated as the run progresses. */
  costs?: SessionCosts;

  /**
   * ISO timestamp of when the session reached a terminal status. Kept
   * separate from `updatedAt` because the latter is bumped on any
   * intermediate persistence write; this one is set exactly once.
   */
  endedAt?: string;

  /** Wall-clock phase durations. Populated incrementally. */
  durations?: SessionDurations;

  error?: string;
}
