import { Router, type Request, type Response } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { z } from "zod";
import { detectKind, extractText } from "../parsers/index.js";
import {
  createSession,
  lockAndProduceConcept,
  runGeneration,
  runRefinementRound,
} from "../agents/orchestrator.js";
import { emit, subscribe } from "../agents/bus.js";
import { history } from "../store/history.js";
import type {
  ArchitectureSession,
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

function scheduleDocCleanup(sessionId: string, delayMs = 30 * 60 * 1000): void {
  setTimeout(() => docTexts.delete(sessionId), delayMs).unref?.();
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
      void (async () => {
        try {
          await runGeneration(
            { session, docTexts: docTexts.get(sessionId) ?? [] },
            (e) => emit(sessionId, e),
          );
        } catch (err) {
          console.error("generation failed", err);
        } finally {
          scheduleDocCleanup(sessionId);
        }
      })();
    }

    res.json({ session });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────────────── *
 * POST /session/:id/generate
 * ────────────────────────────────────────────────────────────────────────── */

router.post("/session/:id/generate", async (req: Request, res: Response, next) => {
  try {
    const sessionId = req.params.id;
    const session = await requireSession(sessionId, res);
    if (!session) return;
    if (!session.refinedIdea) {
      return res.status(400).json({ error: "idea is not locked yet" });
    }

    void (async () => {
      try {
        await runGeneration(
          { session, docTexts: docTexts.get(sessionId) ?? [] },
          (e) => emit(sessionId, e),
        );
      } catch (err) {
        console.error("generation failed", err);
      } finally {
        scheduleDocCleanup(sessionId);
      }
    })();

    res.json({ ok: true, sessionId });
  } catch (err) {
    next(err);
  }
});

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
