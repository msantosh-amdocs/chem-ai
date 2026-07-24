import type { AgentAccent, DocumentKind, SpecialistRole } from "./personas";

/** Broad industry the session is scoped to — see server types.ts for details. */
export type SessionIndustry =
  | "chemical"
  | "pharmaceutical"
  | "semiconductor"
  | "other";

export interface UploadedDoc {
  id: string;
  filename: string;
  kind: "pdf" | "docx" | "text";
  sizeBytes: number;
  chars: number;
  uploadedAt: string;
}

export interface SpecialistSnapshot {
  id: string;
  role: SpecialistRole;
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

export interface StageTeamSnapshot {
  kind: DocumentKind;
  minMembers: number;
  members: SpecialistSnapshot[];
}

/**
 * How a department's debate loop decides to stop.
 * See `server/src/types.ts` for the canonical documentation — this must
 * stay in sync with the server enum.
 */
export type TerminationPolicy =
  | "threshold_or_max"
  | "threshold_only"
  | "max_only";

export interface GenerationSettings {
  threshold: number;
  maxRounds: number;
  /** Optional for backward-compat with sessions written before this field existed. */
  terminationPolicy?: TerminationPolicy;
}

/** Aggregated token / USD estimate for a single scope. */
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
  analyst: StageCost;
  perTeam: Partial<Record<DocumentKind, StageCost>>;
  total: StageCost;
  usageComplete: boolean;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  whyItMatters: string;
  hint?: string;
  importance: "high" | "medium" | "low";
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
}

export interface ClarifyAnswer {
  questionId: string;
  answer: string;
}

export interface RefinementRound {
  n: number;
  interpretation: string;
  completeness: number;
  note?: string;
  questions: ClarifyQuestion[];
  answers: ClarifyAnswer[];
  createdAt: string;
}

export interface RefinedIdea {
  content: string;
  createdAt: string;
}

export interface StageRoundDraft {
  memberId: string;
  content: string;
  critique?: string;
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
  content: string;
  producedBy: string;
  createdAt: string;
  streaming?: boolean;
  error?: string;
  rounds: StageRound[];
  terminatedBy?: "agreement" | "maxRounds" | "error";
  finalAgreements: Record<string, number>;
  /** ISO — stamped when the department stage begins. See server types.ts. */
  startedAt?: string;
  /** ISO — stamped when the department stage finishes (success or error). */
  endedAt?: string;
  /** Convenience — `endedAt - startedAt` in ms. Absent while streaming. */
  durationMs?: number;
}

export type SessionStatus =
  | "refining"
  | "locked"
  | "generating"
  | "completed"
  | "error"
  | "cancelled";

/** Wall-clock timings for the different phases of a run, in ms. */
export interface SessionDurations {
  analystMs?: number;
  perTeam: Partial<Record<DocumentKind, number>>;
  totalMs?: number;
}

export interface ArchitectureSession {
  id: string;
  title: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  status: SessionStatus;
  settings: GenerationSettings;
  specialists: {
    analyst: SpecialistSnapshot;
    teams: StageTeamSnapshot[];
  };
  documents: UploadedDoc[];
  refinement: RefinementRound[];
  refinedIdea?: RefinedIdea;
  artifacts: DocumentArtifact[];
  /** Rolled-up token + estimated USD cost. Populated as the run progresses. */
  costs?: SessionCosts;
  /** Wall-clock phase durations. Populated incrementally. */
  durations?: SessionDurations;
  /**
   * Industry classification derived from the refined concept. Drives
   * whether Wave 1 runs `procedure` (chemical / pharma) or
   * `semiconductor` (chip projects). Missing on legacy sessions.
   */
  industry?: SessionIndustry;
  error?: string;
}

export interface HistorySummary {
  id: string;
  title: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  refinementRounds: number;
  completeness: number | null;
  documents: number;
  hasRefinedIdea: boolean;
  settings: GenerationSettings;
  /** Rolled-up token + USD cost estimate, or null if the run never produced any. */
  costs: SessionCosts | null;
  /** Wall-clock durations recorded during the run, or null if not tracked. */
  durations: SessionDurations | null;
  /**
   * Industry classification derived from the refined concept, or null
   * if the run has not yet reached the lock step (or predates the field).
   */
  industry: SessionIndustry | null;
  analyst: { id: string; name: string; model: string };
  teams: Array<{
    kind: DocumentKind;
    minMembers: number;
    members: Array<{ id: string; name: string; model: string }>;
  }>;
  artifacts: Array<{
    kind: DocumentKind;
    title: string;
    hasContent: boolean;
    error: string | null;
    rounds: number;
    terminatedBy: "agreement" | "maxRounds" | "error" | null;
    finalAgreements: Record<string, number>;
    startedAt: string | null;
    endedAt: string | null;
    durationMs: number | null;
  }>;
}

/**
 * Running-average durations across every session on disk. Returned as
 * a sibling of `sessions` from `GET /history` so the History page can
 * display "typical" reference times next to the per-run measurements.
 */
export interface HistoryAverages {
  perTeam: Partial<Record<DocumentKind, { avgMs: number; samples: number }>>;
  session: { avgMs: number; samples: number } | null;
  analyst: { avgMs: number; samples: number } | null;
}

export interface SdkModelParameterDefinition {
  id: string;
  displayName?: string;
  values: Array<{ value: string; displayName?: string }>;
}

export interface SdkModel {
  id: string;
  displayName: string;
  description?: string;
  aliases?: string[];
  parameters?: SdkModelParameterDefinition[];
}

export type SessionEvent =
  | { type: "session"; session: ArchitectureSession }
  | { type: "refinement.started" }
  | { type: "refinement.completed"; round: RefinementRound }
  | { type: "concept.started" }
  | { type: "concept.completed"; refinedIdea: string }
  | {
      type: "artifact.started";
      kind: DocumentKind;
      memberIds: string[];
      leadId: string;
      title: string;
    }
  | {
      type: "artifact.round.started";
      kind: DocumentKind;
      n: number;
      memberIds: string[];
    }
  | {
      type: "artifact.round.completed";
      kind: DocumentKind;
      round: StageRound;
      converged: boolean;
    }
  | { type: "artifact.completed"; artifact: DocumentArtifact }
  | { type: "artifact.error"; kind: DocumentKind; message: string }
  | { type: "session.completed"; session: ArchitectureSession }
  | { type: "session.error"; message: string }
  | { type: "stream.end" };
