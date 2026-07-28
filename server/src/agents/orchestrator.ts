import { nanoid } from "nanoid";
import { promptModel, type PromptResult } from "./llm.js";
import { priceUsage, roundUsd } from "./costs.js";
import { classifyIndustryFromConcept } from "./industry.js";
import {
  refinePrompt,
  refinedConceptPrompt,
  stageInitialPrompt,
  stageReviseAndScorePrompt,
  TITLES,
  type StagePromptContext,
  type UpstreamArtifacts,
} from "./prompts.js";
import { history } from "../store/history.js";
import type {
  ArchitectureSession,
  ArtifactApprovalStatus,
  ClarificationAnswer,
  ClarificationRequest,
  ClarifyAnswer,
  ClarifyQuestion,
  DocumentArtifact,
  DocumentKind,
  GenerationSettings,
  LlmCallCost,
  RefinementRound,
  SessionCosts,
  SessionDurations,
  SessionIndustry,
  Specialist,
  StageCost,
  StageRound,
  StageRoundDraft,
  StageTeam,
  TerminationPolicy,
  UploadedDoc,
  UserRevisionRequest,
} from "../types.js";

/**
 * Hard safety cap on debate rounds when `terminationPolicy === "threshold_only"`.
 * A misconfigured session (e.g. threshold impossibly high) must not spin
 * forever burning credits — this ceiling ensures the loop eventually
 * exits even if agreement never converges.
 */
const HARD_ROUND_CAP = 20;

/* ────────────────────────────────────────────────────────────────────────── *
 * Cancellation
 *
 * The Cursor SDK does not expose an AbortSignal on `Agent.prompt`, so we
 * cannot interrupt a single LLM call mid-flight. What we CAN do is
 * cooperate at every safe checkpoint between calls:
 *
 *   - before scheduling the next stage (`advancePipeline`)
 *   - before starting round 1 (`executeStage`)
 *   - before starting each subsequent round (`runRoundsAfterOne`)
 *   - right after every `Promise.all` of parallel drafts returns
 *
 * At each checkpoint we consult the per-session `AbortController` and
 * throw a `CancelledError` if the user has clicked Stop. The catch
 * blocks in `executeStage` / `resumeStageAfterClarification` recognise
 * the error type and no-op — `cancelSession()` already updated the
 * session + in-flight artifact state and emitted the terminal events,
 * so there is nothing left to do.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Marker error thrown at cooperative cancellation checkpoints. Distinct
 * from generic `Error` so the executeStage/resumeStage catch blocks
 * don't accidentally mark cancellation as a stage error.
 */
class CancelledError extends Error {
  constructor() {
    super("Cancelled by user");
    this.name = "CancelledError";
  }
}

const cancellations = new Map<string, AbortController>();

/** Get (or lazily create) the AbortController for this session. */
function controllerFor(sessionId: string): AbortController {
  let ac = cancellations.get(sessionId);
  if (!ac) {
    ac = new AbortController();
    cancellations.set(sessionId, ac);
  }
  return ac;
}

/** True if the user has hit Stop on this session and we haven't cleared it. */
function isSessionCancelled(sessionId: string): boolean {
  return cancellations.get(sessionId)?.signal.aborted ?? false;
}

/** Cooperative checkpoint — throws `CancelledError` if the user has cancelled. */
function throwIfCancelled(sessionId: string): void {
  if (isSessionCancelled(sessionId)) throw new CancelledError();
}

/**
 * Discard any prior AbortController for this session so a fresh cycle
 * (retry, regenerate, resume) starts with an un-aborted signal. Called
 * from every entry point that kicks the pipeline back into motion.
 */
function resetCancellation(sessionId: string): void {
  cancellations.delete(sessionId);
}

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

function emptyDurations(): SessionDurations {
  return { perTeam: {} };
}

/**
 * Ensure the session has a `durations` object we can mutate in place.
 * Written this way so the field only appears on sessions that have
 * actually accumulated timing data — old sessions on disk never grow a
 * spurious empty object on read.
 */
function ensureDurations(session: ArchitectureSession): SessionDurations {
  if (!session.durations) session.durations = emptyDurations();
  return session.durations;
}

/**
 * Non-negative, integer-millisecond difference between two ISO
 * timestamps. Returns `undefined` if either input is missing/malformed
 * so callers can decide how to render the "not measured yet" state.
 * Clamps to zero rather than emitting negative values, which would
 * otherwise be possible if the machine clock jumps backwards mid-run.
 */
function diffMs(from: string | undefined, to: string | undefined): number | undefined {
  if (!from || !to) return undefined;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.max(0, Math.round(b - a));
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
      /**
       * 1-indexed revision cycle. 1 = first pass. > 1 = re-run because
       * the user requested a revision on the previous cycle's artifact.
       */
      revisionCycle: number;
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
  /**
   * Department paused after round 1 because ≥ 1 member asked the user
   * for clarification. The debate resumes once the user answers via
   * `answerClarifications()`.
   */
  | {
      type: "artifact.clarification.requested";
      kind: DocumentKind;
      requests: ClarificationRequest[];
    }
  /** User answered the clarifications; the department is resuming debate. */
  | {
      type: "artifact.clarification.answered";
      kind: DocumentKind;
      answers: ClarificationAnswer[];
    }
  /**
   * Debate finished converging (or hit maxRounds); the artifact is now
   * awaiting user approval before the pipeline advances to the next
   * department.
   */
  | {
      type: "artifact.awaiting_approval";
      kind: DocumentKind;
      artifact: DocumentArtifact;
    }
  /** User hit Approve on an awaiting_approval artifact. */
  | { type: "artifact.approved"; kind: DocumentKind; artifact: DocumentArtifact }
  /**
   * User clicked Revise with feedback; a fresh debate run will restart
   * shortly (an `artifact.started` event with the new revisionCycle).
   */
  | {
      type: "artifact.revising";
      kind: DocumentKind;
      feedback: string;
      revisionCycle: number;
    }
  | { type: "artifact.completed"; artifact: DocumentArtifact }
  | { type: "artifact.error"; kind: DocumentKind; message: string }
  /**
   * User clicked Retry on an errored stage. A fresh `artifact.started`
   * event will follow once `executeStage` restarts the debate. The
   * client uses this to clear the "errored" tile state before the
   * (slightly later) started event arrives.
   */
  | { type: "artifact.retrying"; kind: DocumentKind; revisionCycle: number }
  | { type: "session.completed"; session: ArchitectureSession }
  /**
   * User clicked Stop. The session is now `cancelled`; any stage that
   * was mid-flight has been marked `error: "Cancelled by user"` so it
   * can be retried individually. The last LLM call (if one was in
   * flight) will still complete in the background, but its result is
   * discarded at the next cancellation checkpoint.
   */
  | { type: "session.cancelled"; session: ArchitectureSession }
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

  // Determine which industry this run is scoped to (used by
  // `runGeneration` to pick between the Procedure and Semiconductor
  // Manufacturing departments in Wave 1). Best-effort classification —
  // if it comes back "other" the orchestrator falls back to the safe
  // default (Procedure).
  session.industry = classifyIndustryFromConcept(content);

  // Analyst duration = wall-clock from the first refinement round's
  // `createdAt` to the moment the refined concept was finalised. We
  // deliberately anchor on the first refinement round rather than
  // `session.createdAt` so the "waiting for the user to click Start
  // refinement" gap doesn't inflate the analyst timing.
  const firstRound = session.refinement[0];
  const analystMs = diffMs(firstRound?.createdAt, session.refinedIdea.createdAt);
  if (analystMs !== undefined) {
    ensureDurations(session).analystMs = analystMs;
  }

  await history.upsert(session);
  emit({ type: "concept.completed", refinedIdea: content });
  return session;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Department debate — one artifact per department, converge on agreement.
 *
 * Round 1: every member writes their own initial draft independently AND
 *   may optionally raise clarifying questions for the user (via a
 *   `<CLARIFICATIONS>…</CLARIFICATIONS>` prefix). If any questions come
 *   back, the debate halts after round 1 until the user answers, then
 *   continues from round 2.
 * Rounds 2..maxRounds: every member sees teammates' latest drafts and
 *   produces (critique, revised draft, self-scored agreement 0-100).
 * Terminate when every score ≥ threshold OR we hit maxRounds.
 * The lead (index 0) member's final draft is the artifact of record.
 *
 * After the debate finishes converging, the artifact is set to
 * `awaiting_approval` and the pipeline pauses until the user either
 * Approves (unblocks the next stage) or Revises (kicks a fresh cycle
 * on this same stage with the user's feedback injected into the
 * prompts).
 * ────────────────────────────────────────────────────────────────────────── */

interface ReviseResult {
  critique: string;
  revised: string;
  agreement: number;
}

/**
 * Result of the `<CLARIFICATIONS>` block parsing plus the pruned
 * markdown draft. Round 1 members are permitted to prefix their reply
 * with a delimited JSON list of clarifying questions — we peel it off
 * before treating the rest of the response as the actual draft.
 */
interface ExtractedRound1 {
  draft: string;
  clarifications: Array<{ question: string; whyItMatters?: string }>;
}

function extractRound1(raw: string): ExtractedRound1 {
  const match = raw.match(/<CLARIFICATIONS>([\s\S]*?)<\/CLARIFICATIONS>/i);
  if (!match) return { draft: raw.trim(), clarifications: [] };
  const body = match[1]!.trim();
  const draft = (raw.slice(0, match.index) + raw.slice(match.index! + match[0]!.length))
    .trim();
  const clarifications: Array<{ question: string; whyItMatters?: string }> = [];
  try {
    // Accept either a bare JSON array or a fenced ```json``` block.
    const cleaned = body.replace(/```json/gi, "```").replace(/```/g, "").trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const question = String(rec.question ?? "").trim();
        if (!question) continue;
        const whyItMatters = rec.whyItMatters
          ? String(rec.whyItMatters).trim() || undefined
          : undefined;
        clarifications.push({ question, whyItMatters });
      }
    }
  } catch {
    /* If parsing fails, drop the block silently — the draft still stands. */
  }
  return { draft, clarifications };
}

/**
 * Pending or resolved clarifications for a single stage, packaged into
 * the `{ question, answer }` shape prompts expect.
 */
function resolvedClarificationPairs(
  artifact: DocumentArtifact,
): Array<{ question: string; answer: string }> {
  const requests = artifact.clarifications ?? [];
  const answers = artifact.clarificationAnswers ?? [];
  const byId = new Map(answers.map((a) => [a.requestId, a]));
  const out: Array<{ question: string; answer: string }> = [];
  for (const r of requests) {
    const a = byId.get(r.id);
    if (a) out.push({ question: r.question, answer: a.answer });
  }
  return out;
}

/**
 * Build the `StagePromptContext` we pass into `stageInitialPrompt` /
 * `stageReviseAndScorePrompt` from what's already on the artifact.
 * Returns `undefined` when there's genuinely nothing to inject (keeps
 * the prompts identical to their pre-approval-gate shape for
 * first-pass, no-clarification cases).
 */
function buildStageContext(artifact: DocumentArtifact | undefined): StagePromptContext | undefined {
  if (!artifact) return undefined;
  const feedback = artifact.revisions?.[artifact.revisions.length - 1]?.feedback;
  const clarifications = resolvedClarificationPairs(artifact);
  const revisionCycle = (artifact.revisionCount ?? 0) + 1;
  if (!feedback && clarifications.length === 0 && revisionCycle === 1) {
    return undefined;
  }
  return {
    userFeedback: feedback,
    prevArtifact: feedback ? artifact.content : undefined,
    clarifications,
    revisionCycle,
  };
}

function ensureUpstreamMap(session: ArchitectureSession): Map<DocumentKind, DocumentArtifact> {
  const map = new Map<DocumentKind, DocumentArtifact>();
  for (const a of session.artifacts) map.set(a.kind, a);
  return map;
}

function upstreamFor(session: ArchitectureSession): UpstreamArtifacts {
  const m = ensureUpstreamMap(session);
  return {
    market: m.get("market"),
    procedure: m.get("procedure"),
    semiconductor: m.get("semiconductor"),
    procurement: m.get("procurement"),
    ip: m.get("ip"),
    finance: m.get("finance"),
  };
}

/** Replace (or append) an artifact on the session in place. */
function upsertArtifact(session: ArchitectureSession, artifact: DocumentArtifact): void {
  const idx = session.artifacts.findIndex((a) => a.kind === artifact.kind);
  if (idx >= 0) session.artifacts[idx] = artifact;
  else session.artifacts.push(artifact);
}

/** Sort artifacts into canonical order in place. */
function reorderArtifacts(session: ArchitectureSession): void {
  const rank = (k: DocumentKind) => ORDER.indexOf(k);
  session.artifacts.sort((a, b) => rank(a.kind) - rank(b.kind));
}

/**
 * Run round 1 for a stage: initial drafts + optional clarification
 * requests. Persists the round to the artifact and returns whichever
 * `nextStep` the caller should take:
 *   - `"paused"` — the artifact was updated with pending clarifications
 *     and the debate is halted; caller should NOT proceed to round 2.
 *   - `"continue"` — no clarifications, safe to keep debating.
 */
async function runRound1(
  session: ArchitectureSession,
  team: StageTeam,
  refinedConcept: string,
  upstream: UpstreamArtifacts,
  docTexts: { filename: string; text: string }[],
  artifact: DocumentArtifact,
  emit: Emit,
): Promise<{ nextStep: "paused" | "continue" }> {
  const promptCtx = buildStageContext(artifact);
  emit({
    type: "artifact.round.started",
    kind: team.kind,
    n: 1,
    memberIds: team.members.map((m) => m.id),
  });
  const round1Started = new Date().toISOString();
  const drafts: StageRoundDraft[] = [];
  const allClarifications: ClarificationRequest[] = [];

  // Members STILL fan out in parallel within a round — they can't see
  // each other's current-round drafts anyway, so serializing them
  // wouldn't change any output, only slow things down. Sequentiality
  // is enforced ACROSS departments (see `advancePipeline`), which is
  // what the "one at a time" contract with the user requires.
  throwIfCancelled(session.id);
  const raws = await Promise.all(
    team.members.map(async (m) => {
      const teammates = team.members.filter((x) => x.id !== m.id);
      const { system, user } = stageInitialPrompt(
        m,
        teammates,
        team.kind,
        refinedConcept,
        upstream,
        docTexts,
        promptCtx,
      );
      const { text } = await tracedPrompt(
        session,
        { kind: "team", team: team.kind },
        m.model,
        user,
        system,
        m.params,
      );
      return { member: m, raw: text };
    }),
  );
  // The LLM call above cannot be interrupted mid-flight (SDK has no
  // AbortSignal); we cooperate at the next safe point instead. If the
  // user hit Stop while round 1 was running, discard the returned
  // drafts and bail — `cancelSession()` has already recorded the
  // "Cancelled by user" error on the artifact.
  throwIfCancelled(session.id);

  for (const { member, raw } of raws) {
    const { draft, clarifications } = extractRound1(raw);
    drafts.push({
      memberId: member.id,
      content: draft || raw.trim(),
      agreementWithOthers: 0,
      createdAt: new Date().toISOString(),
    });
    for (const c of clarifications) {
      allClarifications.push({
        id: nanoid(8),
        kind: team.kind,
        memberId: member.id,
        round: 1,
        question: c.question,
        whyItMatters: c.whyItMatters,
        askedAt: new Date().toISOString(),
      });
    }
  }

  const round: StageRound = {
    n: 1,
    drafts,
    startedAt: round1Started,
    endedAt: new Date().toISOString(),
  };
  artifact.rounds = [round];
  emit({
    type: "artifact.round.completed",
    kind: team.kind,
    round,
    converged: false,
  });

  if (allClarifications.length > 0) {
    artifact.clarifications = [
      ...(artifact.clarifications ?? []),
      ...allClarifications,
    ];
    artifact.approvalStatus = "awaiting_clarification";
    emit({
      type: "artifact.clarification.requested",
      kind: team.kind,
      requests: allClarifications,
    });
    return { nextStep: "paused" };
  }
  return { nextStep: "continue" };
}

/**
 * Run rounds 2..maxRounds until convergence or the round cap. Assumes
 * round 1 (and any clarifications) already lives on `artifact.rounds`.
 * Terminates the debate by updating `artifact` in place with the final
 * lead draft, agreements, and termination reason.
 */
async function runRoundsAfterOne(
  session: ArchitectureSession,
  team: StageTeam,
  refinedConcept: string,
  upstream: UpstreamArtifacts,
  docTexts: { filename: string; text: string }[],
  settings: GenerationSettings,
  artifact: DocumentArtifact,
  emit: Emit,
): Promise<void> {
  const lead = team.members[0]!;
  const policy: TerminationPolicy = settings.terminationPolicy ?? "threshold_or_max";
  const effectiveMaxRounds =
    policy === "threshold_only" ? HARD_ROUND_CAP : Math.max(1, settings.maxRounds);
  const promptCtx = buildStageContext(artifact);

  let terminatedBy: "agreement" | "maxRounds" = "maxRounds";
  const rounds = artifact.rounds;

  for (let n = 2; n <= effectiveMaxRounds; n++) {
    throwIfCancelled(session.id);
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
          promptCtx,
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
    // Cooperative cancel checkpoint: if the user hit Stop during this
    // round we drop the drafts on the floor and bail out. cancelSession()
    // has already marked the artifact + session.
    throwIfCancelled(session.id);
    const converged = drafts.every((d) => d.agreementWithOthers >= settings.threshold);
    const round: StageRound = { n, drafts, startedAt, endedAt: new Date().toISOString() };
    rounds.push(round);
    emit({
      type: "artifact.round.completed",
      kind: team.kind,
      round,
      converged,
    });
    if (converged && policy !== "max_only") {
      terminatedBy = "agreement";
      break;
    }
  }

  const finalRound = rounds[rounds.length - 1]!;
  const finalAgreements: Record<string, number> = {};
  for (const d of finalRound.drafts) finalAgreements[d.memberId] = d.agreementWithOthers;
  const leadDraft =
    finalRound.drafts.find((d) => d.memberId === lead.id) ?? finalRound.drafts[0]!;
  artifact.content = leadDraft.content;
  artifact.producedBy = lead.id;
  artifact.terminatedBy = terminatedBy;
  artifact.finalAgreements = finalAgreements;
  artifact.streaming = false;
  artifact.endedAt = new Date().toISOString();
  artifact.durationMs = diffMs(artifact.startedAt, artifact.endedAt);
  if (artifact.durationMs !== undefined) {
    ensureDurations(session).perTeam[team.kind] = artifact.durationMs;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Pipeline — sequential, per-department user-approval gated:
 *
 *   RefinedIdea
 *     └── Market Analysis          ← await user Approve
 *          └── Procedure OR
 *              Semiconductor Mfg   ← await user Approve
 *              (chosen by session.industry — the other is skipped)
 *               └── Procurement    ← await user Approve
 *                    └── IP        ← await user Approve
 *                         └── Finance      ← await user Approve
 *                              └── Presentation  ← await user Approve
 *
 * Only ONE department runs at a time. After every department finishes
 * its internal debate, the pipeline halts with the artifact in
 * `awaiting_approval` and does not advance until the user calls
 * `approveArtifact()` (or `reviseArtifact()` to re-run with feedback).
 * Departments may also halt mid-run for user clarifications; see
 * `submitClarifications()`.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Canonical linear order used for rendering AND for the sequential
 * driver's "what to do next" logic. Both `procedure` and
 * `semiconductor` appear here so the client can render a stable
 * topology, but only ONE of them actually runs per session — see
 * `processKindFor(session.industry)`.
 */
const ORDER: DocumentKind[] = [
  "market",
  "procedure",
  "semiconductor",
  "procurement",
  "ip",
  "finance",
  "presentation",
];

/**
 * Decide which of `procedure` / `semiconductor` is the "process
 * artifact" for a given session. Semiconductor projects use the
 * Semiconductor Manufacturing department (silicon → wafer fab →
 * packaging); everything else uses Procedure (chemical / pharma
 * routes of synthesis). Exported for testing.
 */
export function processKindFor(industry: SessionIndustry | undefined): DocumentKind {
  return industry === "semiconductor" ? "semiconductor" : "procedure";
}

/**
 * The strictly-sequential order the driver will actually execute for
 * this session — one department at a time. The inactive process kind
 * (procedure vs semiconductor) is dropped entirely.
 */
export function sequentialOrderFor(session: ArchitectureSession): DocumentKind[] {
  const processKind = processKindFor(session.industry);
  const skipped: DocumentKind = processKind === "procedure" ? "semiconductor" : "procedure";
  return ORDER.filter((k) => k !== skipped);
}

/**
 * True iff a department is considered "done" — either fully approved
 * or errored and won't be retried. Used by `advancePipeline` to find
 * the next stage to work on.
 */
function isStageSettled(a: DocumentArtifact | undefined): boolean {
  if (!a) return false;
  return a.approvalStatus === "approved" || !!a.error;
}

/**
 * True while a department is holding the pipeline open — either mid-
 * debate, waiting on clarifications, or waiting on approval. The
 * driver refuses to schedule a new stage while any prior stage is in
 * one of these transitional states.
 */
function isStageBusyOrWaiting(a: DocumentArtifact | undefined): boolean {
  if (!a) return false;
  return (
    a.approvalStatus === "generating" ||
    a.approvalStatus === "awaiting_clarification" ||
    a.approvalStatus === "awaiting_approval" ||
    a.approvalStatus === "revising"
  );
}

/**
 * The next department that needs work (either to be started for the
 * first time, or to be resumed after clarifications). Returns
 * `undefined` when every configured department is settled — that's
 * the pipeline-complete signal.
 */
function nextEligibleStage(
  session: ArchitectureSession,
): { kind: DocumentKind; resume: boolean } | undefined {
  const teams = new Map<DocumentKind, StageTeam>();
  for (const t of session.specialists.teams) teams.set(t.kind, t);
  const artByKind = ensureUpstreamMap(session);
  const order = sequentialOrderFor(session);
  for (const kind of order) {
    if (!teams.has(kind)) continue;
    const a = artByKind.get(kind);
    if (isStageSettled(a)) continue;
    if (a && a.approvalStatus === "awaiting_clarification") {
      // Waiting on the user — do not auto-run.
      return undefined;
    }
    if (a && a.approvalStatus === "awaiting_approval") {
      // Waiting on the user — do not auto-run.
      return undefined;
    }
    // Either brand-new (not_started) or `revising`: needs a fresh run.
    return { kind, resume: false };
  }
  return undefined;
}

/** Persist the session in place with the update timestamp bumped. */
async function persistSession(session: ArchitectureSession): Promise<void> {
  reorderArtifacts(session);
  session.updatedAt = new Date().toISOString();
  await history.upsert(session);
}

/**
 * Prepare (or reset) the artifact record for a fresh debate cycle on
 * this stage. Preserves user-facing history — revisions, prior
 * clarifications+answers, cumulative revisionCount — while clearing
 * the mutable per-cycle fields (rounds, content, terminatedBy) so the
 * new debate starts clean.
 */
function beginStageArtifact(
  session: ArchitectureSession,
  team: StageTeam,
  cycleN: number,
): DocumentArtifact {
  const prev = session.artifacts.find((a) => a.kind === team.kind);
  const lead = team.members[0]!;
  const startedAt = new Date().toISOString();
  const artifact: DocumentArtifact = {
    kind: team.kind,
    title: TITLES[team.kind],
    content: "",
    producedBy: lead.id,
    createdAt: startedAt,
    streaming: true,
    rounds: [],
    finalAgreements: {},
    startedAt,
    approvalStatus: "generating",
    revisions: prev?.revisions ?? [],
    revisionCount: cycleN - 1,
    clarifications: prev?.clarifications ?? [],
    clarificationAnswers: prev?.clarificationAnswers ?? [],
  };
  upsertArtifact(session, artifact);
  return artifact;
}

/**
 * Roll the artifact into `awaiting_approval` after the debate has
 * ended, save, and emit the corresponding events. The pipeline then
 * pauses until the user calls approve/revise.
 */
async function finalizeForApproval(
  session: ArchitectureSession,
  artifact: DocumentArtifact,
  emit: Emit,
): Promise<void> {
  artifact.approvalStatus = "awaiting_approval";
  artifact.streaming = false;
  session.status = "awaiting_user";
  await persistSession(session);
  emit({ type: "artifact.completed", artifact });
  emit({ type: "artifact.awaiting_approval", kind: artifact.kind, artifact });
}

/**
 * Handle a stage error: record it on the artifact, mark session
 * `awaiting_user` (so the client can render the failure and the user
 * can choose to skip / retry), and emit `artifact.error`. We do NOT
 * mark the whole session as errored — a single failed department
 * shouldn't abort the entire run when downstream departments can
 * still run.
 */
async function failStage(
  session: ArchitectureSession,
  team: StageTeam,
  artifact: DocumentArtifact,
  message: string,
  emit: Emit,
): Promise<void> {
  artifact.error = message;
  artifact.approvalStatus = "error";
  artifact.streaming = false;
  artifact.endedAt = new Date().toISOString();
  artifact.durationMs = diffMs(artifact.startedAt, artifact.endedAt);
  artifact.terminatedBy = "error";
  if (artifact.durationMs !== undefined) {
    ensureDurations(session).perTeam[team.kind] = artifact.durationMs;
  }
  session.status = "awaiting_user";
  await persistSession(session);
  emit({ type: "artifact.error", kind: team.kind, message });
}

/**
 * Run one department end-to-end (or as far as it can go before it
 * needs user input). Handles both fresh cycles and revision cycles —
 * `beginStageArtifact` gets called and everything runs from round 1.
 * If round 1 yields clarifications the function returns immediately
 * (paused); the caller must wait for the user to answer via
 * `submitClarifications()`.
 */
async function executeStage(
  session: ArchitectureSession,
  kind: DocumentKind,
  docTexts: { filename: string; text: string }[],
  emit: Emit,
): Promise<void> {
  if (!session.refinedIdea) {
    throw new Error("Cannot generate artifacts before the idea is locked.");
  }
  const team = session.specialists.teams.find((t) => t.kind === kind);
  if (!team) {
    // The team was configured off — nothing to do; the driver will
    // simply skip past it on the next iteration.
    return;
  }
  if (team.members.length < team.minMembers) {
    throw new Error(
      `Team for ${TITLES[team.kind]} needs at least ${team.minMembers} member(s); got ${team.members.length}.`,
    );
  }

  const cycleN = (session.artifacts.find((a) => a.kind === kind)?.revisionCount ?? 0) + 1;
  const artifact = beginStageArtifact(session, team, cycleN);
  session.status = "generating";
  await persistSession(session);
  emit({
    type: "artifact.started",
    kind,
    memberIds: team.members.map((m) => m.id),
    leadId: team.members[0]!.id,
    title: TITLES[kind],
    revisionCycle: cycleN,
  });

  try {
    const refinedConcept = session.refinedIdea.content;
    const upstream = upstreamFor(session);

    const { nextStep } = await runRound1(
      session,
      team,
      refinedConcept,
      upstream,
      docTexts,
      artifact,
      emit,
    );
    await persistSession(session);
    if (nextStep === "paused") {
      // Clarifications block — halt the debate and wait for the user.
      session.status = "awaiting_user";
      await persistSession(session);
      return;
    }
    await runRoundsAfterOne(
      session,
      team,
      refinedConcept,
      upstream,
      docTexts,
      session.settings,
      artifact,
      emit,
    );
    await finalizeForApproval(session, artifact, emit);
  } catch (err) {
    if (err instanceof CancelledError) {
      // cancelSession() already recorded the "Cancelled by user"
      // state on the artifact and emitted session.cancelled. Nothing
      // more to do here — swallow the marker error so the background
      // task exits cleanly.
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await failStage(session, team, artifact, message, emit);
  }
}

/**
 * Resume a stage that was paused for user clarifications: runs rounds
 * 2..N (round 1 drafts already exist on the artifact) and then
 * finalises for approval.
 */
async function resumeStageAfterClarification(
  session: ArchitectureSession,
  kind: DocumentKind,
  docTexts: { filename: string; text: string }[],
  emit: Emit,
): Promise<void> {
  const team = session.specialists.teams.find((t) => t.kind === kind);
  if (!team || !session.refinedIdea) return;
  const artifact = session.artifacts.find((a) => a.kind === kind);
  if (!artifact) return;

  artifact.approvalStatus = "generating";
  artifact.streaming = true;
  session.status = "generating";
  await persistSession(session);

  try {
    await runRoundsAfterOne(
      session,
      team,
      session.refinedIdea.content,
      upstreamFor(session),
      docTexts,
      session.settings,
      artifact,
      emit,
    );
    await finalizeForApproval(session, artifact, emit);
  } catch (err) {
    if (err instanceof CancelledError) return;
    const message = err instanceof Error ? err.message : String(err);
    await failStage(session, team, artifact, message, emit);
  }
}

/** Mark the pipeline complete and emit the terminal session event. */
async function finalizePipeline(
  session: ArchitectureSession,
  emit: Emit,
): Promise<void> {
  session.status = "completed";
  session.endedAt = new Date().toISOString();
  const totalMs = diffMs(session.createdAt, session.endedAt);
  if (totalMs !== undefined) ensureDurations(session).totalMs = totalMs;
  await persistSession(session);
  emit({ type: "session.completed", session });
}

export interface GenerateInput {
  session: ArchitectureSession;
  docTexts: { filename: string; text: string }[];
}

/**
 * Sequential driver. Runs stages one at a time, pausing before each
 * user gate. Safe to call repeatedly:
 *   - If a stage is currently generating, the guard at the top short-
 *     circuits — we never double-schedule.
 *   - If a stage is awaiting_user (clarification or approval), we do
 *     nothing and let the user drive.
 *   - Otherwise we execute the next eligible stage.
 *
 * The pipeline is complete when there's no next stage AND no stage is
 * still transitional — at that point we mark the session done.
 */
export async function advancePipeline(
  input: GenerateInput,
  emit: Emit,
): Promise<void> {
  const { session, docTexts } = input;
  if (!session.refinedIdea) {
    throw new Error("Cannot generate artifacts before the idea is locked.");
  }
  // Cancelled sessions do not auto-advance. The user must call
  // `retryStage()` on the errored stage (which resets the signal) to
  // resume, or `resetArtifacts()` + startGeneration to start over.
  if (isSessionCancelled(session.id) || session.status === "cancelled") {
    return;
  }
  // Guard: refuse to schedule while any stage is currently transitional.
  // This makes the function idempotent — a burst of approval clicks
  // won't spin up parallel departments.
  for (const a of session.artifacts) {
    if (a.approvalStatus === "generating" || a.approvalStatus === "revising") {
      return;
    }
  }
  const next = nextEligibleStage(session);
  if (!next) {
    // If nothing is transitional and nothing is next, the pipeline is
    // fully done — flip to completed if we haven't already.
    const stillPending = session.artifacts.some(
      (a) => a.approvalStatus === "awaiting_approval" || a.approvalStatus === "awaiting_clarification",
    );
    if (!stillPending && session.status !== "completed") {
      await finalizePipeline(session, emit);
    }
    return;
  }
  await executeStage(session, next.kind, docTexts, emit);
  // Auto-advance would be the wrong call here — the just-executed
  // stage either paused for clarifications or paused for approval.
  // In both cases we exit and wait for the user to unblock us.
}

/**
 * Public entry: user hit "Approve" on this stage's artifact. Mark it
 * approved, then auto-advance to the next department. The next call
 * will start executing immediately (auto-advance mode).
 */
export async function approveArtifact(
  session: ArchitectureSession,
  kind: DocumentKind,
  docTexts: { filename: string; text: string }[],
  emit: Emit,
): Promise<void> {
  const artifact = session.artifacts.find((a) => a.kind === kind);
  if (!artifact) throw new Error(`No artifact for ${kind} yet`);
  if (artifact.approvalStatus !== "awaiting_approval") {
    throw new Error(
      `Cannot approve ${TITLES[kind]} — status is ${artifact.approvalStatus ?? "unknown"}, not awaiting_approval.`,
    );
  }
  artifact.approvalStatus = "approved";
  artifact.approvedAt = new Date().toISOString();
  session.status = "generating";
  await persistSession(session);
  emit({ type: "artifact.approved", kind, artifact });
  await advancePipeline({ session, docTexts }, emit);
}

/**
 * Public entry: user hit "Revise" with feedback on this stage's
 * artifact. Record the feedback as a new `UserRevisionRequest`, kick
 * a fresh debate cycle (round 1 → clarifications OR rounds 2..N) on
 * the SAME department with the feedback baked into the prompts, and
 * eventually pause for approval again.
 *
 * Downstream departments that were already approved are NOT
 * automatically re-run — the user can Revise them again after they
 * see the new upstream artifact if desired.
 */
export async function reviseArtifact(
  session: ArchitectureSession,
  kind: DocumentKind,
  feedback: string,
  docTexts: { filename: string; text: string }[],
  emit: Emit,
): Promise<void> {
  const trimmed = feedback.trim();
  if (!trimmed) throw new Error("Revision feedback cannot be empty.");
  const artifact = session.artifacts.find((a) => a.kind === kind);
  if (!artifact) throw new Error(`No artifact for ${kind} yet`);
  if (artifact.approvalStatus !== "awaiting_approval" && artifact.approvalStatus !== "error") {
    throw new Error(
      `Cannot revise ${TITLES[kind]} — status is ${artifact.approvalStatus ?? "unknown"}.`,
    );
  }
  const revisions = artifact.revisions ?? [];
  const nextN = revisions.length + 1;
  const revision: UserRevisionRequest = {
    n: nextN,
    feedback: trimmed,
    requestedAt: new Date().toISOString(),
  };
  artifact.revisions = [...revisions, revision];
  artifact.revisionCount = artifact.revisions.length;
  artifact.approvalStatus = "revising";
  session.status = "generating";
  await persistSession(session);
  emit({ type: "artifact.revising", kind, feedback: trimmed, revisionCycle: nextN + 1 });

  // Kick a fresh cycle for this stage. `executeStage` will reset the
  // artifact's rounds/content while preserving the revision history
  // and any prior clarification Q&A.
  await executeStage(session, kind, docTexts, emit);
}

/**
 * Public entry: user answered the clarifications the department
 * raised after round 1. Store the answers on the artifact, mark the
 * stage back to generating, and resume rounds 2..N.
 *
 * Skipped/blank answers are allowed — the department is instructed
 * (via its prompt) to fall back to a documented assumption when the
 * user declines to answer.
 */
export async function submitClarifications(
  session: ArchitectureSession,
  kind: DocumentKind,
  answers: ClarificationAnswer[],
  docTexts: { filename: string; text: string }[],
  emit: Emit,
): Promise<void> {
  const artifact = session.artifacts.find((a) => a.kind === kind);
  if (!artifact) throw new Error(`No artifact for ${kind} yet`);
  if (artifact.approvalStatus !== "awaiting_clarification") {
    throw new Error(
      `Cannot submit clarifications for ${TITLES[kind]} — status is ${artifact.approvalStatus ?? "unknown"}.`,
    );
  }
  const knownIds = new Set((artifact.clarifications ?? []).map((c) => c.id));
  const filtered = answers.filter((a) => knownIds.has(a.requestId));
  const merged = [
    ...(artifact.clarificationAnswers ?? []).filter(
      (a) => !filtered.some((f) => f.requestId === a.requestId),
    ),
    ...filtered.map((a) => ({
      ...a,
      answeredAt: a.answeredAt || new Date().toISOString(),
    })),
  ];
  artifact.clarificationAnswers = merged;
  await persistSession(session);
  emit({ type: "artifact.clarification.answered", kind, answers: merged });
  await resumeStageAfterClarification(session, kind, docTexts, emit);
}

/**
 * Convenience: kick off the pipeline from scratch (or restart it
 * after a reset). Alias for `advancePipeline` with fresh state — used
 * by the /lock and /generate endpoints. Never throws for individual
 * stage errors; those are captured on the artifact and surfaced via
 * `artifact.error` events.
 */
export async function startGeneration(
  input: GenerateInput,
  emit: Emit,
): Promise<void> {
  const { session } = input;
  // Fresh run — throw away any prior cancel signal so the driver
  // doesn't short-circuit on the very first checkpoint.
  resetCancellation(session.id);
  session.status = "generating";
  await persistSession(session);
  await advancePipeline(input, emit);
}

/**
 * Reset every artifact on the session so a fresh generation run
 * starts clean. Used by /generate to "regenerate everything". The
 * user's approval on any prior artifacts is discarded — a full
 * regenerate implies "start over".
 */
export async function resetArtifacts(session: ArchitectureSession): Promise<void> {
  session.artifacts = [];
  session.status = "locked";
  session.endedAt = undefined;
  if (session.durations) session.durations.perTeam = {};
  resetCancellation(session.id);
  await persistSession(session);
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Stop + Retry
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Public entry: user hit "Stop" while a run was in flight. Cancels the
 * per-session AbortController (so the next cooperative checkpoint
 * bails), marks the session `cancelled`, records "Cancelled by user"
 * on any stage that was mid-flight, and emits `session.cancelled`.
 *
 * The Cursor SDK does not expose an AbortSignal on `Agent.prompt`, so
 * the currently in-flight LLM call (if any) will still complete in
 * the background. Its result is discarded at the next cancellation
 * checkpoint — the artifact state we set here is authoritative.
 *
 * Idempotent — no-op on sessions already in a terminal state.
 */
export async function cancelSession(
  session: ArchitectureSession,
  emit: Emit,
): Promise<void> {
  if (
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "error"
  ) {
    return;
  }
  controllerFor(session.id).abort();

  session.status = "cancelled";
  session.endedAt = new Date().toISOString();
  const totalMs = diffMs(session.createdAt, session.endedAt);
  if (totalMs !== undefined) ensureDurations(session).totalMs = totalMs;

  for (const a of session.artifacts) {
    if (
      a.approvalStatus === "generating" ||
      a.approvalStatus === "revising"
    ) {
      a.approvalStatus = "error";
      a.error = "Cancelled by user";
      a.streaming = false;
      a.endedAt = new Date().toISOString();
      a.durationMs = diffMs(a.startedAt, a.endedAt);
      a.terminatedBy = "error";
      if (a.durationMs !== undefined) {
        ensureDurations(session).perTeam[a.kind] = a.durationMs;
      }
      emit({ type: "artifact.error", kind: a.kind, message: "Cancelled by user" });
    }
  }
  await persistSession(session);
  emit({ type: "session.cancelled", session });
}

/**
 * Public entry: user hit "Retry" on an errored stage (either a real
 * failure or one we cancelled). Discards the fresh cancellation
 * signal, resets the artifact to a fresh cycle (preserving revisions
 * + clarification Q&A so context is not lost), and calls
 * `advancePipeline` — which will pick up this stage next since
 * `not_started` is the top priority in `nextEligibleStage`.
 *
 * If the session was `cancelled`, retrying flips it back to
 * `generating` so downstream stages will continue running once this
 * one succeeds.
 */
export async function retryStage(
  session: ArchitectureSession,
  kind: DocumentKind,
  docTexts: { filename: string; text: string }[],
  emit: Emit,
): Promise<void> {
  const artifact = session.artifacts.find((a) => a.kind === kind);
  if (!artifact) throw new Error(`No artifact for ${kind} yet`);
  if (artifact.approvalStatus !== "error" && !artifact.error) {
    throw new Error(
      `Cannot retry ${TITLES[kind]} — status is ${artifact.approvalStatus ?? "unknown"}, not error.`,
    );
  }
  resetCancellation(session.id);

  // Rehydrate the artifact into a clean pre-generate state. We preserve
  // user-facing history (revisions + clarification Q&A) so the retry
  // still incorporates any prior feedback, but wipe the failed cycle's
  // rounds/content/error so the debate really starts over.
  const revisionCount = artifact.revisionCount ?? 0;
  artifact.approvalStatus = "not_started";
  artifact.error = undefined;
  artifact.content = "";
  artifact.rounds = [];
  artifact.finalAgreements = {};
  artifact.terminatedBy = undefined;
  artifact.startedAt = undefined;
  artifact.endedAt = undefined;
  artifact.durationMs = undefined;
  artifact.streaming = false;

  session.status = "generating";
  // Clear the terminal-run bookkeeping so the session no longer looks
  // done to the client. (endedAt is set on cancel/complete.)
  session.endedAt = undefined;
  if (session.durations) {
    delete session.durations.perTeam[kind];
    session.durations.totalMs = undefined;
  }
  await persistSession(session);
  emit({ type: "artifact.retrying", kind, revisionCycle: revisionCount + 1 });
  await advancePipeline({ session, docTexts }, emit);
}

/**
 * One-shot boot recovery for the "server died mid-run" case.
 *
 * Runs at process start (from `index.ts`) BEFORE the HTTP server accepts
 * traffic. Any session that was persisted with status `generating` is a
 * zombie by definition — no orchestrator is actually running its
 * pipeline anymore. Without this sweep the UI would show the Stop
 * button forever on an idle stage.
 *
 * We mark any in-flight artifact (approvalStatus `generating` or
 * `revising`) as `error` with a distinct "Server restarted" message,
 * flip the owning session to `error`, and record the interruption on
 * `session.error`. The client's Retry button already understands the
 * `error` state and will re-run the stage from scratch (preserving
 * approved upstream stages plus prior revisions + clarification Q&A).
 *
 * Sessions in any other status (`refining`, `locked`, `awaiting_user`,
 * `completed`, `error`, `cancelled`) are left untouched — those states
 * either have no long-running background work, or already reflect a
 * user-driven pause that survives restart cleanly.
 *
 * The in-memory `docTexts` cache is lost across restarts, so a retry
 * of a swept stage runs without the originally uploaded docs. The
 * refined concept and every prior artifact are on disk, so the stage
 * still runs — the degradation is limited to missing uploaded-doc
 * context. This is documented in the README's recovery section.
 *
 * Idempotent — running it twice on the same disk yields the same
 * result (second pass finds no `generating` sessions to touch).
 */
export async function sweepInterruptedSessions(): Promise<{
  scanned: number;
  swept: Array<{ id: string; title: string; kinds: DocumentKind[] }>;
}> {
  const all = await history.list();
  const swept: Array<{ id: string; title: string; kinds: DocumentKind[] }> = [];
  for (const session of all) {
    if (session.status !== "generating") continue;

    const affectedKinds: DocumentKind[] = [];
    const now = new Date().toISOString();
    for (const a of session.artifacts) {
      if (
        a.approvalStatus === "generating" ||
        a.approvalStatus === "revising"
      ) {
        a.approvalStatus = "error";
        a.error = "Server restarted before this step completed. Click Retry to resume.";
        a.streaming = false;
        a.endedAt = now;
        a.durationMs = diffMs(a.startedAt, a.endedAt);
        a.terminatedBy = "error";
        if (a.durationMs !== undefined) {
          ensureDurations(session).perTeam[a.kind] = a.durationMs;
        }
        affectedKinds.push(a.kind);
      }
    }

    session.status = "error";
    session.endedAt = now;
    session.error =
      affectedKinds.length > 0
        ? "Server restarted mid-run. Click Retry on the highlighted stage to resume, or Regenerate to start over."
        : "Server restarted between stages. Click Retry on the next stage or Regenerate to start over.";
    const totalMs = diffMs(session.createdAt, session.endedAt);
    if (totalMs !== undefined) ensureDurations(session).totalMs = totalMs;

    await persistSession(session);
    swept.push({ id: session.id, title: session.title, kinds: affectedKinds });
  }
  return { scanned: all.length, swept };
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
