import type { AgentAccent, DocumentKind, SpecialistRole } from "./personas";

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

export interface GenerationSettings {
  threshold: number;
  maxRounds: number;
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
}

export type SessionStatus =
  | "refining"
  | "locked"
  | "generating"
  | "completed"
  | "error"
  | "cancelled";

export interface ArchitectureSession {
  id: string;
  title: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
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
  error?: string;
}

export interface HistorySummary {
  id: string;
  title: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  refinementRounds: number;
  completeness: number | null;
  documents: number;
  hasRefinedIdea: boolean;
  settings: GenerationSettings;
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
  }>;
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
