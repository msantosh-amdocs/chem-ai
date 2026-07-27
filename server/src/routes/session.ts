import { Router, type Request, type Response } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { z } from "zod";
import { detectKind, extractText } from "../parsers/index.js";
import {
  advancePipeline,
  approveArtifact,
  createSession,
  lockAndProduceConcept,
  resetArtifacts,
  reviseArtifact,
  runRefinementRound,
  startGeneration,
  submitClarifications,
  type SessionEvent,
} from "../agents/orchestrator.js";
import { emit, subscribe } from "../agents/bus.js";
import { history } from "../store/history.js";
import type {
  ArchitectureSession,
  ClarificationAnswer,
  ClarifyAnswer,
  DocumentKind,
  UploadedDoc,
} from "../types.js";

export const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

/* ────────────────────────────────────────────────────────────────────────── *
 * Validation
 * ────────────────────────────────────────────────────────────────────────── */

const accentSchema = z
  .object({
    text: z.string(),
    bg: z.string(),
    border: z.string(),
    solid: z.string(),
    ring: z.string(),
  })
  .partial()
  .transform((v) => ({
    text: v.text ?? "text-slate-700",
    bg: v.bg ?? "bg-slate-50",
    border: v.border ?? "border-slate-200",
    solid: v.solid ?? "bg-slate-500",
    ring: v.ring ?? "ring-slate-200",
  }));

const specialistSchema = z.object({
  id: z.string().min(1),
  role: z.enum([
    "analyst",
    "market_analyst",
    "process_engineer",
    "semiconductor_engineer",
    "procurement_specialist",
    "finance_analyst",
    "ip_analyst",
    "presenter",
  ]),
  produces: z
    .enum([
      "market",
      "procedure",
      "semiconductor",
      "procurement",
      "ip",
      "finance",
      "presentation",
    ])
    .optional(),
  name: z.string().trim().min(1).max(60),
  tagline: z.string().max(120).default(""),
  roleDescription: z.string().min(1),
  tone: z.string().min(1),
  model: z.string().min(1),
  params: z.record(z.string()).default({}),
  avatarId: z.string().default("initials"),
  accent: accentSchema,
});

const teamSchema = z.object({
  kind: z.enum([
    "market",
    "procedure",
    "semiconductor",
    "procurement",
    "ip",
    "finance",
    "presentation",
  ]),
  minMembers: z.number().int().min(1).max(10),
  members: z.array(specialistSchema).min(1).max(6),
});

const specialistsPayloadSchema = z.object({
  analyst: specialistSchema.refine((s) => s.role === "analyst", {
    message: "analyst must have role 'analyst'",
  }),
  teams: z.array(teamSchema).min(1),
});

const settingsSchema = z.object({
  threshold: z.number().int().min(50).max(100).default(95),
  maxRounds: z.number().int().min(2).max(8).default(4),
  terminationPolicy: z
    .enum(["threshold_or_max", "threshold_only", "max_only"])
    .default("threshold_or_max"),
});

const startBodySchema = z.object({
  idea: z.string().trim().min(10, "idea must be at least 10 characters"),
  specialists: z.string().min(2),
  settings: z.string().optional(),
});

const answersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answer: z.string().default(""),
      }),
    )
    .default([]),
});

/* ────────────────────────────────────────────────────────────────────────── *
 * Session-level parsed-document cache
 * ────────────────────────────────────────────────────────────────────────── */

const docTexts = new Map<string, { filename: string; text: string }[]>();

/**
 * Interactive sessions can sit for a long time between user approvals,
 * so we keep the parsed doc cache alive for the full duration of the
 * pipeline and only drop it after a terminal event (completed / error
 * / cancelled). If the process restarts before that, the docs are
 * gone — regenerate would then run without them, which is degraded
 * but not catastrophic (they're intended as extra context, not the
 * source of truth).
 */
function scheduleDocCleanupAfterTerminal(sessionId: string): void {
  // Wait 5 minutes past the terminal event before dropping the cache —
  // long enough for a quick "regenerate" click, short enough that
  // abandoned sessions don't leak memory indefinitely.
  setTimeout(() => docTexts.delete(sessionId), 5 * 60 * 1000).unref?.();
}

/** Fire-and-forget wrapper around a pipeline action that emits + logs errors. */
function runInBackground(
  sessionId: string,
  action: () => Promise<void>,
  label: string,
): void {
  void (async () => {
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} failed:`, err);
      const failEvent: SessionEvent = { type: "session.error", message };
      emit(sessionId, failEvent);
    }
  })();
}

/* ────────────────────────────────────────────────────────────────────────── *
 * POST /session/start
 * ────────────────────────────────────────────────────────────────────────── */

router.post(
  "/session/start",
  upload.array("documents"),
  async (req: Request, res: Response, next) => {
    try {
      const body = startBodySchema.parse(req.body);
      const specialists = specialistsPayloadSchema.parse(JSON.parse(body.specialists));
      const settings = settingsSchema.parse(
        body.settings ? JSON.parse(body.settings) : {},
      );

      // Enforce team hygiene: kinds unique, member ids unique across all
      // teams, per-team min members honored, every producer declares its
      // artifact kind matching the team.
      const kinds = new Set<DocumentKind>();
      const allMemberIds = new Set<string>();
      for (const t of specialists.teams) {
        if (kinds.has(t.kind)) {
          return res.status(400).json({ error: `duplicate team for artifact '${t.kind}'` });
        }
        kinds.add(t.kind);
        if (t.members.length < t.minMembers) {
          return res.status(400).json({
            error: `team '${t.kind}' needs at least ${t.minMembers} member(s); got ${t.members.length}`,
          });
        }
        for (const m of t.members) {
          if (allMemberIds.has(m.id)) {
            return res.status(400).json({
              error: `duplicate member id '${m.id}' across teams — each specialist needs a unique id`,
            });
          }
          allMemberIds.add(m.id);
          if (m.produces && m.produces !== t.kind) {
            return res.status(400).json({
              error: `member '${m.name}' produces '${m.produces}' but is on the '${t.kind}' team`,
            });
          }
        }
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const documents: UploadedDoc[] = [];
      const parsed: { filename: string; text: string }[] = [];
      for (const f of files) {
        const kind = detectKind(f.originalname, f.mimetype);
        let text = "";
        try {
          text = await extractText(f.buffer, kind);
        } catch (err) {
          return res
            .status(400)
            .json({ error: `Failed to parse ${f.originalname}: ${(err as Error).message}` });
        }
        documents.push({
          id: nanoid(),
          filename: f.originalname,
          kind,
          sizeBytes: f.size,
          chars: text.length,
          uploadedAt: new Date().toISOString(),
        });
        parsed.push({ filename: f.originalname, text });
      }

      const sessionId = nanoid();
      docTexts.set(sessionId, parsed);
      const session = await createSession({
        sessionId,
        idea: body.idea,
        settings,
        specialists,
        documents,
        docTexts: parsed,
      });
      // Watch the bus for terminal events so we can free the parsed-
      // doc cache 5 minutes after the pipeline actually finishes — the
      // interactive approval gates mean we can no longer schedule
      // cleanup from any single route handler.
      const sub = subscribe(sessionId, (e) => {
        if (e.type === "session.completed" || e.type === "session.error") {
          scheduleDocCleanupAfterTerminal(sessionId);
          sub.close();
        }
      });
      emit(sessionId, { type: "session", session });

      res.json({ sessionId, session });
    } catch (err) {
      next(err);
    }
  },
);

/* ────────────────────────────────────────────────────────────────────────── *
 * POST /session/:id/refine
 * ────────────────────────────────────────────────────────────────────────── */

router.post("/session/:id/refine", async (req: Request, res: Response, next) => {
  try {
    const sessionId = req.params.id;
    const session = await requireSession(sessionId, res);
    if (!session) return;
    if (session.status !== "refining") {
      return res.status(400).json({ error: `session is ${session.status}, not refining` });
    }

    const body = answersSchema.parse(req.body ?? {});
    const answers: ClarifyAnswer[] = body.answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
    }));

    const round = await runRefinementRound(
      { session, latestAnswers: answers, docTexts: docTexts.get(sessionId) ?? [] },
      (e) => emit(sessionId, e),
    );

    res.json({ round, session });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────────────── *
 * POST /session/:id/lock
 * ────────────────────────────────────────────────────────────────────────── */

const lockSchema = answersSchema.extend({
  autoGenerate: z.boolean().default(true),
});

router.post("/session/:id/lock", async (req: Request, res: Response, next) => {
  try {
    const sessionId = req.params.id;
    const session = await requireSession(sessionId, res);
    if (!session) return;
    if (session.status !== "refining" && session.status !== "locked") {
      return res.status(400).json({ error: `cannot lock a ${session.status} session` });
    }

    const body = lockSchema.parse(req.body ?? {});
    const answers: ClarifyAnswer[] = body.answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
    }));

    await lockAndProduceConcept(
      { session, latestAnswers: answers, docTexts: docTexts.get(sessionId) ?? [] },
      (e) => emit(sessionId, e),
    );

    if (body.autoGenerate) {
      // Interactive pipeline: kick off the first department. The driver
      // stops after each stage until the user approves; subsequent
      // stages start via the /approve endpoint below.
      runInBackground(
        sessionId,
        () =>
          startGeneration(
            { session, docTexts: docTexts.get(sessionId) ?? [] },
            (e) => emit(sessionId, e),
          ),
        "startGeneration",
      );
    }

    res.json({ session });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────────────── *
 * POST /session/:id/generate — full regenerate (discards prior approvals)
 * ────────────────────────────────────────────────────────────────────────── */

router.post("/session/:id/generate", async (req: Request, res: Response, next) => {
  try {
    const sessionId = req.params.id;
    const session = await requireSession(sessionId, res);
    if (!session) return;
    if (!session.refinedIdea) {
      return res.status(400).json({ error: "idea is not locked yet" });
    }

    // A regenerate wipes everything and starts the interactive
    // sequential pipeline again from department #1.
    await resetArtifacts(session);
    runInBackground(
      sessionId,
      () =>
        startGeneration(
          { session, docTexts: docTexts.get(sessionId) ?? [] },
          (e) => emit(sessionId, e),
        ),
      "regenerate",
    );

    res.json({ ok: true, sessionId });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────────────── *
 * Per-department gates
 *   POST /session/:id/stage/:kind/approve
 *   POST /session/:id/stage/:kind/revise      { feedback }
 *   POST /session/:id/stage/:kind/clarify     { answers: [{ requestId, answer }] }
 * ────────────────────────────────────────────────────────────────────────── */

const kindSchema = z.enum([
  "market",
  "procedure",
  "semiconductor",
  "procurement",
  "ip",
  "finance",
  "presentation",
]);

const feedbackSchema = z.object({
  feedback: z.string().trim().min(1, "feedback cannot be empty").max(20_000),
});

const clarificationsSchema = z.object({
  answers: z
    .array(
      z.object({
        requestId: z.string().min(1),
        answer: z.string().default(""),
      }),
    )
    .default([]),
});

router.post(
  "/session/:id/stage/:kind/approve",
  async (req: Request, res: Response, next) => {
    try {
      const sessionId = req.params.id;
      const kind = kindSchema.parse(req.params.kind);
      const session = await requireSession(sessionId, res);
      if (!session) return;
      // Approval is the pipeline's "unblock" signal — auto-advance to the
      // next department in the background so the API stays responsive.
      const docs = docTexts.get(sessionId) ?? [];
      // We run approveArtifact synchronously up to the point where it
      // records the approval on disk, then let the pipeline advance in
      // the background. That way the HTTP response reflects the new
      // artifact state immediately.
      await approveArtifact(session, kind, docs, (e) => emit(sessionId, e));
      res.json({ ok: true, session });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/session/:id/stage/:kind/revise",
  async (req: Request, res: Response, next) => {
    try {
      const sessionId = req.params.id;
      const kind = kindSchema.parse(req.params.kind);
      const body = feedbackSchema.parse(req.body ?? {});
      const session = await requireSession(sessionId, res);
      if (!session) return;
      const docs = docTexts.get(sessionId) ?? [];
      // Kick off the revision run in the background — running rounds
      // takes long enough that we do NOT want to block the HTTP
      // response. The client will pick up the fresh artifact.started
      // event via SSE.
      runInBackground(
        sessionId,
        () => reviseArtifact(session, kind, body.feedback, docs, (e) => emit(sessionId, e)),
        "reviseArtifact",
      );
      res.json({ ok: true, sessionId });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/session/:id/stage/:kind/clarify",
  async (req: Request, res: Response, next) => {
    try {
      const sessionId = req.params.id;
      const kind = kindSchema.parse(req.params.kind);
      const body = clarificationsSchema.parse(req.body ?? {});
      const session = await requireSession(sessionId, res);
      if (!session) return;
      const docs = docTexts.get(sessionId) ?? [];
      const answers: ClarificationAnswer[] = body.answers.map((a) => ({
        requestId: a.requestId,
        answer: a.answer,
        answeredAt: new Date().toISOString(),
      }));
      runInBackground(
        sessionId,
        () => submitClarifications(session, kind, answers, docs, (e) => emit(sessionId, e)),
        "submitClarifications",
      );
      res.json({ ok: true, sessionId });
    } catch (err) {
      next(err);
    }
  },
);

/* ────────────────────────────────────────────────────────────────────────── *
 * GET /session/:id/stream — SSE
 * ────────────────────────────────────────────────────────────────────────── */

router.get("/session/:id/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const write = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  const sub = subscribe(req.params.id, (e) => write(e));
  for (const e of sub.replay) write(e);

  if (sub.done) {
    write({ type: "stream.end" });
    clearInterval(heartbeat);
    sub.close();
    res.end();
    return;
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    sub.close();
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

async function requireSession(
  id: string,
  res: Response,
): Promise<ArchitectureSession | null> {
  const s = await history.get(id);
  if (!s) {
    res.status(404).json({ error: "session not found" });
    return null;
  }
  return s;
}
