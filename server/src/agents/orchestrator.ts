import { promptModel, type PromptResult } from "./llm.js";
import { priceUsage, roundUsd } from "./costs.js";
import {
  refinePrompt,
  refinedConceptPrompt,
  stageInitialPrompt,
  stageReviseAndScorePrompt,
  TITLES,
  type UpstreamArtifacts,
} from "./prompts.js";
import { history } from "../store/history.js";
import type {
  ArchitectureSession,
  ClarifyAnswer,
  ClarifyQuestion,
  DocumentArtifact,
  DocumentKind,
  GenerationSettings,
  LlmCallCost,
  RefinementRound,
  SessionCosts,
  Specialist,
  StageCost,
  StageRound,
  StageRoundDraft,
  StageTeam,
  TerminationPolicy,
  UploadedDoc,
} from "../types.js";

/**
 * Hard safety cap on debate rounds when `terminationPolicy === "threshold_only"`.
 * A misconfigured session (e.g. threshold impossibly high) must not spin
 * forever burning credits — this ceiling ensures the loop eventually
 * exits even if agreement never converges.
 */
const HARD_ROUND_CAP = 20;

/* ────────────────────────────────────────────────────────────────────────── *
 * Cost accounting
 * ────────────────────────────────────────────────────────────────────────── */

function emptyStageCost(): StageCost {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedUsd: 0,
    llmCalls: 0,
  };
}

function emptySessionCosts(): SessionCosts {
  return {
    analyst: emptyStageCost(),
    perTeam: {},
    total: emptyStageCost(),
    usageComplete: true,
  };
}

/**
 * Merge a single LLM call's cost into a `StageCost` accumulator, in place.
 * Returns the merged accumulator for convenient chaining.
 */
function addToStage(target: StageCost, call: LlmCallCost): StageCost {
  target.inputTokens += call.inputTokens;
  target.outputTokens += call.outputTokens;
  target.cacheReadTokens += call.cacheReadTokens;
  target.cacheWriteTokens += call.cacheWriteTokens;
  target.reasoningTokens += call.reasoningTokens;
  target.totalTokens += call.totalTokens;
  target.estimatedUsd = roundUsd(target.estimatedUsd + call.estimatedUsd);
  target.llmCalls += 1;
  return target;
}

/** Where to attribute a single call's cost. */
type CostScope =
  | { kind: "analyst" }
  | { kind: "team"; team: DocumentKind };

/**
 * Wrapper around `promptModel` that records the call's TokenUsage against
 * the session's cost ledger. This is the ONLY LLM entry point used by the
 * orchestrator — every debate/refinement call flows through here so the
 * `session.costs` we persist is always complete.
 */
async function tracedPrompt(
  session: ArchitectureSession,
  scope: CostScope,
  modelId: string,
  prompt: string,
  systemHint?: string,
  params?: Record<string, string>,
): Promise<PromptResult> {
  const res = await promptModel(modelId, prompt, systemHint, params);

  if (!session.costs) session.costs = emptySessionCosts();
  const costs = session.costs;
  const u = res.usage;

  const call: LlmCallCost = {
    model: res.model,
    inputTokens: u?.inputTokens ?? 0,
    outputTokens: u?.outputTokens ?? 0,
    cacheReadTokens: u?.cacheReadTokens ?? 0,
    cacheWriteTokens: u?.cacheWriteTokens ?? 0,
    reasoningTokens: u?.reasoningTokens ?? 0,
    totalTokens: u?.totalTokens ?? 0,
    estimatedUsd: roundUsd(priceUsage(res.model, u)),
    at: new Date().toISOString(),
  };
  if (!u) costs.usageComplete = false;

  if (scope.kind === "analyst") {
    addToStage(costs.analyst, call);
  } else {
    const bucket = costs.perTeam[scope.team] ?? emptyStageCost();
    addToStage(bucket, call);
    costs.perTeam[scope.team] = bucket;
  }
  addToStage(costs.total, call);

  return res;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Event stream
 * ────────────────────────────────────────────────────────────────────────── */

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
      /** Member ids the round is running (in parallel). */
      memberIds: string[];
    }
  | {
      type: "artifact.round.completed";
      kind: DocumentKind;
      round: StageRound;
      /** True if this round satisfied the agreement threshold. */
      converged: boolean;
    }
  | { type: "artifact.completed"; artifact: DocumentArtifact }
  | { type: "artifact.error"; kind: DocumentKind; message: string }
  | { type: "session.completed"; session: ArchitectureSession }
  | { type: "session.error"; message: string }
  | { type: "stream.end" };

export type Emit = (e: SessionEvent) => void;

/* ────────────────────────────────────────────────────────────────────────── *
 * Bootstrap
 * ────────────────────────────────────────────────────────────────────────── */

export interface StartInput {
  sessionId: string;
  idea: string;
  settings: GenerationSettings;
  specialists: {
    analyst: Specialist;
    teams: StageTeam[];
  };
  documents: UploadedDoc[];
  docTexts: { filename: string; text: string }[];
}

export async function createSession(input: StartInput): Promise<ArchitectureSession> {
  const now = new Date().toISOString();
  const session: ArchitectureSession = {
    id: input.sessionId,
    title: firstNonEmptyLine(input.idea).slice(0, 80) || "Untitled idea",
    idea: input.idea,
    createdAt: now,
    updatedAt: now,
    status: "refining",
    settings: input.settings,
    specialists: input.specialists,
    documents: input.documents,
    refinement: [],
    artifacts: [],
  };
  await history.upsert(session);
  return session;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Refinement
 * ────────────────────────────────────────────────────────────────────────── */

export interface RunRefinementInput {
  session: ArchitectureSession;
  latestAnswers: ClarifyAnswer[];
  docTexts: { filename: string; text: string }[];
}

interface AnalystRoundOutput {
  interpretation: string;
  completeness: number;
  note?: string;
  questions: ClarifyQuestion[];
}

export async function runRefinementRound(
  input: RunRefinementInput,
  emit: Emit,
): Promise<RefinementRound> {
  const { session, latestAnswers, docTexts } = input;

  if (session.refinement.length && latestAnswers.length) {
    const last = session.refinement[session.refinement.length - 1]!;
    last.answers = latestAnswers;
  }

  emit({ type: "refinement.started" });

  const analyst = session.specialists.analyst;
  const { system, user } = refinePrompt(
    analyst,
    session.idea,
    session.refinement,
    latestAnswers,
    docTexts,
  );

  const { text: raw } = await tracedPrompt(
    session,
    { kind: "analyst" },
    analyst.model,
    user,
    system,
    analyst.params,
  );
  const parsed = parseJsonLoose<Partial<AnalystRoundOutput>>(raw) ?? {};
  const round: RefinementRound = {
    n: session.refinement.length + 1,
    interpretation: (parsed.interpretation ?? "").toString().trim(),
    completeness: clampScore(parsed.completeness),
    note: (parsed.note ?? "").toString().trim() || undefined,
    questions: normalizeQuestions(parsed.questions ?? []),
    answers: [],
    createdAt: new Date().toISOString(),
  };
  session.refinement.push(round);
  session.updatedAt = new Date().toISOString();
  await history.upsert(session);
  emit({ type: "refinement.completed", round });
  return round;
}

export interface LockInput {
  session: ArchitectureSession;
  latestAnswers: ClarifyAnswer[];
  docTexts: { filename: string; text: string }[];
}

export async function lockAndProduceConcept(
  input: LockInput,
  emit: Emit,
): Promise<ArchitectureSession> {
  const { session, latestAnswers, docTexts } = input;

  if (session.refinement.length && latestAnswers.length) {
    const last = session.refinement[session.refinement.length - 1]!;
    last.answers = latestAnswers;
  }

  emit({ type: "concept.started" });

  const analyst = session.specialists.analyst;
  const { system, user } = refinedConceptPrompt(
    analyst,
    session.idea,
    session.refinement,
    docTexts,
  );
  const { text } = await tracedPrompt(
    session,
    { kind: "analyst" },
    analyst.model,
    user,
    system,
    analyst.params,
  );
  const content = text.trim();
  session.refinedIdea = { content, createdAt: new Date().toISOString() };
  session.status = "locked";
  session.updatedAt = new Date().toISOString();
  await history.upsert(session);
  emit({ type: "concept.completed", refinedIdea: content });
  return session;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Department debate — one artifact per department, converge on agreement.
 *
 * Round 1: every member writes their own initial draft independently.
 * Rounds 2..maxRounds: every member sees teammates' latest drafts and
 *   produces (critique, revised draft, self-scored agreement 0-100).
 * Terminate when every score ≥ threshold OR we hit maxRounds.
 * The lead (index 0) member's final draft is the artifact of record.
 * ────────────────────────────────────────────────────────────────────────── */

interface ReviseResult {
  critique: string;
  revised: string;
  agreement: number;
}

async function runStageDebate(
  session: ArchitectureSession,
  team: StageTeam,
  refinedConcept: string,
  upstream: UpstreamArtifacts,
  settings: GenerationSettings,
  docTexts: { filename: string; text: string }[],
  onRound: (rounds: StageRound[]) => Promise<void>,
  emit: Emit,
): Promise<DocumentArtifact> {
  if (team.members.length < team.minMembers) {
    throw new Error(
      `Team for ${TITLES[team.kind]} needs at least ${team.minMembers} member(s); got ${team.members.length}.`,
    );
  }
  const lead = team.members[0]!;
  const rounds: StageRound[] = [];
  const policy: TerminationPolicy = settings.terminationPolicy ?? "threshold_or_max";
  const effectiveMaxRounds =
    policy === "threshold_only"
      ? HARD_ROUND_CAP
      : Math.max(1, settings.maxRounds);

  emit({
    type: "artifact.started",
    kind: team.kind,
    memberIds: team.members.map((m) => m.id),
    leadId: lead.id,
    title: TITLES[team.kind],
  });

  // ── Round 1: initial drafts in parallel ────────────────────────────────
  emit({
    type: "artifact.round.started",
    kind: team.kind,
    n: 1,
    memberIds: team.members.map((m) => m.id),
  });
  const round1Started = new Date().toISOString();
  const round1Drafts = await Promise.all(
    team.members.map(async (m) => {
      const teammates = team.members.filter((x) => x.id !== m.id);
      const { system, user } = stageInitialPrompt(
        m,
        teammates,
        team.kind,
        refinedConcept,
        upstream,
        docTexts,
      );
      const { text } = await tracedPrompt(
        session,
        { kind: "team", team: team.kind },
        m.model,
        user,
        system,
        m.params,
      );
      return {
        memberId: m.id,
        content: text.trim(),
        agreementWithOthers: 0,
        createdAt: new Date().toISOString(),
      } satisfies StageRoundDraft;
    }),
  );
  rounds.push({
    n: 1,
    drafts: round1Drafts,
    startedAt: round1Started,
    endedAt: new Date().toISOString(),
  });
  emit({
    type: "artifact.round.completed",
    kind: team.kind,
    round: rounds[0]!,
    converged: false,
  });
  await onRound(rounds);

  // ── Rounds 2..effectiveMaxRounds: critique + revise + score ────────────
  let terminatedBy: "agreement" | "maxRounds" = "maxRounds";
  for (let n = 2; n <= effectiveMaxRounds; n++) {
    const prior = rounds[rounds.length - 1]!;
    const startedAt = new Date().toISOString();
    emit({
      type: "artifact.round.started",
      kind: team.kind,
      n,
      memberIds: team.members.map((m) => m.id),
    });

    const drafts = await Promise.all(
      team.members.map(async (m) => {
        const teammates = team.members.filter((x) => x.id !== m.id);
        const teammateDrafts = prior.drafts
          .filter((d) => d.memberId !== m.id)
          .map((d) => ({
            member: team.members.find((x) => x.id === d.memberId)!,
            draft: d.content,
          }));
        const own = prior.drafts.find((d) => d.memberId === m.id)!;
        const { system, user } = stageReviseAndScorePrompt(
          m,
          teammates,
          teammateDrafts,
          own.content,
          team.kind,
          refinedConcept,
          upstream,
          docTexts,
          settings.threshold,
          n,
        );
        const { text: raw } = await tracedPrompt(
          session,
          { kind: "team", team: team.kind },
          m.model,
          user,
          system,
          m.params,
        );
        const parsed = parseJsonLoose<Partial<ReviseResult>>(raw);
        const revised = (parsed?.revised ?? "").toString().trim() || own.content;
        const critique = (parsed?.critique ?? "").toString().trim();
        const agreement = clampScore(parsed?.agreement);
        return {
          memberId: m.id,
          content: revised,
          critique: critique || undefined,
          agreementWithOthers: agreement,
          createdAt: new Date().toISOString(),
        } satisfies StageRoundDraft;
      }),
    );

    const converged = drafts.every((d) => d.agreementWithOthers >= settings.threshold);
    rounds.push({ n, drafts, startedAt, endedAt: new Date().toISOString() });
    emit({
      type: "artifact.round.completed",
      kind: team.kind,
      round: rounds[rounds.length - 1]!,
      converged,
    });
    await onRound(rounds);

    // Termination policy — see `TerminationPolicy` doc-comment in types.ts:
    //   threshold_or_max : stop on either (default)
    //   threshold_only   : ignore maxRounds; stop only on convergence
    //   max_only         : ignore convergence; always run every round
    if (converged && policy !== "max_only") {
      terminatedBy = "agreement";
      break;
    }
  }

  const finalRound = rounds[rounds.length - 1]!;
  const finalAgreements: Record<string, number> = {};
  for (const d of finalRound.drafts) {
    finalAgreements[d.memberId] = d.agreementWithOthers;
  }
  const leadDraft =
    finalRound.drafts.find((d) => d.memberId === lead.id) ?? finalRound.drafts[0]!;

  return {
    kind: team.kind,
    title: TITLES[team.kind],
    content: leadDraft.content,
    producedBy: lead.id,
    createdAt: new Date().toISOString(),
    rounds,
    terminatedBy,
    finalAgreements,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Pipeline — the full DAG:
 *
 *   RefinedIdea
 *     ├── Market Analysis   } Wave 1 (parallel)
 *     └── Procedure         }
 *          ↓
 *          ├── Procurement  } Wave 2 (parallel — both need Procedure;
 *          └── IP           }         Procurement + IP also use Market)
 *                ↓
 *                Finance     Wave 3 (needs Procurement + Market)
 *                  ↓
 *                  Presentation  Wave 4 (aggregates everything)
 * ────────────────────────────────────────────────────────────────────────── */

const ORDER: DocumentKind[] = [
  "market",
  "procedure",
  "procurement",
  "ip",
  "finance",
  "presentation",
];

export interface GenerateInput {
  session: ArchitectureSession;
  docTexts: { filename: string; text: string }[];
}

export async function runGeneration(
  input: GenerateInput,
  emit: Emit,
): Promise<ArchitectureSession> {
  const { session, docTexts } = input;
  if (!session.refinedIdea) {
    throw new Error("Cannot generate artifacts before the idea is locked.");
  }

  session.status = "generating";
  session.artifacts = [];
  await history.upsert(session);

  const teams = new Map<DocumentKind, StageTeam>();
  for (const t of session.specialists.teams) teams.set(t.kind, t);

  const artifacts = new Map<DocumentKind, DocumentArtifact>();

  const persistArtifacts = async () => {
    session.artifacts = ORDER.map((k) => artifacts.get(k)).filter(
      (a): a is DocumentArtifact => !!a,
    );
    session.updatedAt = new Date().toISOString();
    await history.upsert(session);
  };

  const runStage = async (kind: DocumentKind): Promise<DocumentArtifact | null> => {
    const team = teams.get(kind);
    if (!team) return null;

    try {
      const upstream: UpstreamArtifacts = {
        market: artifacts.get("market"),
        procedure: artifacts.get("procedure"),
        procurement: artifacts.get("procurement"),
        ip: artifacts.get("ip"),
        finance: artifacts.get("finance"),
      };
      const artifact = await runStageDebate(
        session,
        team,
        session.refinedIdea!.content,
        upstream,
        session.settings,
        docTexts,
        async (rounds) => {
          // Persist a streaming placeholder so history is always up-to-date.
          const placeholder: DocumentArtifact = {
            kind,
            title: TITLES[kind],
            content:
              rounds[rounds.length - 1]?.drafts.find(
                (d) => d.memberId === team.members[0]!.id,
              )?.content ?? "",
            producedBy: team.members[0]!.id,
            createdAt: new Date().toISOString(),
            streaming: true,
            rounds,
            finalAgreements: {},
          };
          artifacts.set(kind, placeholder);
          await persistArtifacts();
        },
        emit,
      );
      artifacts.set(kind, artifact);
      await persistArtifacts();
      emit({ type: "artifact.completed", artifact });
      return artifact;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed: DocumentArtifact = {
        kind,
        title: TITLES[kind],
        content: "",
        producedBy: team.members[0]?.id ?? "",
        createdAt: new Date().toISOString(),
        error: message,
        rounds: [],
        terminatedBy: "error",
        finalAgreements: {},
      };
      artifacts.set(kind, failed);
      await persistArtifacts();
      emit({ type: "artifact.error", kind, message });
      return null;
    }
  };

  try {
    // Wave 1 — Market + Procedure in parallel (both operate on Refined Concept).
    const [market, procedure] = await Promise.all([
      runStage("market"),
      runStage("procedure"),
    ]);

    // Wave 2 — Procurement + IP in parallel (both need Procedure).
    // Procurement additionally leans on Market for scale sizing; IP leans on
    // Market for jurisdictions. If Procedure failed we skip both.
    let procurement: DocumentArtifact | null = null;
    let ip: DocumentArtifact | null = null;
    if (teams.has("procurement") || teams.has("ip")) {
      if (!procedure) {
        if (teams.has("procurement")) {
          emit({
            type: "artifact.error",
            kind: "procurement",
            message:
              "Procurement skipped — Procedure is required upstream and it failed or was disabled.",
          });
        }
        if (teams.has("ip")) {
          emit({
            type: "artifact.error",
            kind: "ip",
            message:
              "IP analysis skipped — Procedure is required upstream and it failed or was disabled.",
          });
        }
      } else {
        const [proc, ipRes] = await Promise.all([
          teams.has("procurement") ? runStage("procurement") : Promise.resolve(null),
          teams.has("ip") ? runStage("ip") : Promise.resolve(null),
        ]);
        procurement = proc;
        ip = ipRes;
      }
    }

    // Wave 3 — Finance (needs Procurement + Market).
    let finance: DocumentArtifact | null = null;
    if (teams.has("finance")) {
      if (procurement && market) {
        finance = await runStage("finance");
      } else {
        emit({
          type: "artifact.error",
          kind: "finance",
          message:
            "Finance skipped — Procurement and Market Analysis are both required upstream.",
        });
      }
    }

    // Wave 4 — Presentation (aggregates everything; runs even if some upstream failed, so long as at least one artifact exists).
    if (teams.has("presentation")) {
      const anyUpstream = market || procedure || procurement || ip || finance;
      if (anyUpstream) {
        await runStage("presentation");
      } else {
        emit({
          type: "artifact.error",
          kind: "presentation",
          message:
            "Presentation skipped — no upstream artifacts were produced.",
        });
      }
    }

    session.status = "completed";
    await persistArtifacts();
    emit({ type: "session.completed", session });
    return session;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    session.status = "error";
    session.error = message;
    await persistArtifacts();
    emit({ type: "session.error", message });
    throw err;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function firstNonEmptyLine(s: string): string {
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  const s = cleaned.slice(start);
  for (let end = s.length; end > 0; end--) {
    try {
      return JSON.parse(s.slice(0, end)) as T;
    } catch {
      /* keep trimming */
    }
  }
  return null;
}

function normalizeQuestions(raw: unknown[]): ClarifyQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ClarifyQuestion[] = [];
  const ALLOWED_CATEGORIES: ClarifyQuestion["category"][] = [
    "product",
    "industry",
    "scale",
    "geography",
    "budget",
    "timeline",
    "regulatory",
    "constraints",
    "risks",
    "other",
  ];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const question = String(rec.question ?? "").trim();
    if (!question) continue;
    const id = String(rec.id ?? "") || `q${out.length + 1}`;
    const importance = ["high", "medium", "low"].includes(String(rec.importance))
      ? (rec.importance as ClarifyQuestion["importance"])
      : "medium";
    const rawCategory = String(rec.category);
    const category = (ALLOWED_CATEGORIES as string[]).includes(rawCategory)
      ? (rawCategory as ClarifyQuestion["category"])
      : "other";
    out.push({
      id,
      question,
      whyItMatters: String(rec.whyItMatters ?? "").trim(),
      hint: rec.hint ? String(rec.hint).trim() : undefined,
      importance,
      category,
    });
  }
  return out;
}
