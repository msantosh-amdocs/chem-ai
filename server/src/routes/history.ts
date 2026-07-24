import { Router } from "express";
import { history } from "../store/history.js";
import type {
  ArchitectureSession,
  DocumentArtifact,
  DocumentKind,
  StageTeam,
} from "../types.js";

export const router = Router();

router.get("/history", async (_req, res) => {
  const list = await history.list();
  const summaries: ReturnType<typeof summarize>[] = [];
  for (const s of list) {
    try {
      summaries.push(summarize(s));
    } catch {
      // Skip legacy sessions that don't match the current schema.
    }
  }
  const averages = computeAverages(summaries);
  res.json({ sessions: summaries, averages });
});

router.get("/history/:id", async (req, res) => {
  const s = await history.get(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  res.json({ session: s });
});

router.delete("/history/:id", async (req, res) => {
  await history.remove(req.params.id);
  res.json({ ok: true });
});

router.delete("/history", async (_req, res) => {
  await history.clear();
  res.json({ ok: true });
});

function summarize(s: ArchitectureSession) {
  const specialists = s.specialists ?? { analyst: undefined, teams: [] };
  const analyst = specialists.analyst;
  const teams: StageTeam[] = Array.isArray(specialists.teams) ? specialists.teams : [];
  const artifacts: DocumentArtifact[] = Array.isArray(s.artifacts) ? s.artifacts : [];
  const refinement = Array.isArray(s.refinement) ? s.refinement : [];
  const lastRound = refinement[refinement.length - 1];

  return {
    id: s.id,
    title: s.title ?? "(untitled)",
    idea: s.idea?.slice(0, 240) ?? "",
    createdAt: s.createdAt ?? new Date(0).toISOString(),
    updatedAt: s.updatedAt ?? s.createdAt ?? new Date(0).toISOString(),
    endedAt: s.endedAt ?? null,
    status: s.status ?? "completed",
    refinementRounds: refinement.length,
    completeness: lastRound?.completeness ?? null,
    documents: Array.isArray(s.documents) ? s.documents.length : 0,
    hasRefinedIdea: !!s.refinedIdea,
    settings: s.settings ?? {
      threshold: 95,
      maxRounds: 4,
      terminationPolicy: "threshold_or_max",
    },
    costs: s.costs ?? null,
    durations: s.durations ?? null,
    industry: s.industry ?? null,
    analyst: analyst
      ? { id: analyst.id, name: analyst.name, model: analyst.model }
      : { id: "", name: "?", model: "?" },
    teams: teams.map((t) => ({
      kind: t.kind,
      minMembers: t.minMembers,
      members: t.members.map((m) => ({ id: m.id, name: m.name, model: m.model })),
    })),
    artifacts: artifacts.map((a) => ({
      kind: a.kind,
      title: a.title,
      hasContent: !!a.content && !a.error,
      error: a.error ?? null,
      rounds: Array.isArray(a.rounds) ? a.rounds.length : 0,
      terminatedBy: a.terminatedBy ?? null,
      finalAgreements: a.finalAgreements ?? {},
      startedAt: a.startedAt ?? null,
      endedAt: a.endedAt ?? null,
      durationMs: typeof a.durationMs === "number" ? a.durationMs : null,
    })),
  };
}

/**
 * Response payload for `GET /history.averages` — running averages over
 * every terminal session on disk. Consumers use this to render "your
 * team typically takes ~4m" hints on the Pipeline and History pages.
 * A department only contributes to the average when we have a real
 * `durationMs` for it — a still-running or crashed-before-endedAt
 * stage is skipped so a partial measurement doesn't drag the average.
 */
export interface HistoryAverages {
  /** Per-team average duration in ms and the number of runs it's based on. */
  perTeam: Partial<Record<DocumentKind, { avgMs: number; samples: number }>>;
  /** Average end-to-end session duration for completed runs, in ms. */
  session: { avgMs: number; samples: number } | null;
  /** Average analyst-phase duration, in ms. */
  analyst: { avgMs: number; samples: number } | null;
}

/**
 * Fold the per-session durations into a small "typical time" summary.
 *
 * Errored sessions are included in per-team averages (they still cost
 * wall-clock and are worth surfacing) but excluded from the whole-
 * session average — an early failure would otherwise lie about
 * end-to-end pace.
 */
export function computeAverages(
  summaries: Array<ReturnType<typeof summarize>>,
): HistoryAverages {
  const perTeam: Record<string, { total: number; samples: number }> = {};
  let sessionTotal = 0;
  let sessionSamples = 0;
  let analystTotal = 0;
  let analystSamples = 0;

  for (const s of summaries) {
    const d = s.durations;
    if (!d) continue;
    if (typeof d.totalMs === "number" && s.status === "completed") {
      sessionTotal += d.totalMs;
      sessionSamples += 1;
    }
    if (typeof d.analystMs === "number") {
      analystTotal += d.analystMs;
      analystSamples += 1;
    }
    if (d.perTeam && typeof d.perTeam === "object") {
      for (const [kind, ms] of Object.entries(d.perTeam)) {
        if (typeof ms !== "number") continue;
        const acc = perTeam[kind] ?? { total: 0, samples: 0 };
        acc.total += ms;
        acc.samples += 1;
        perTeam[kind] = acc;
      }
    }
  }

  const perTeamOut: HistoryAverages["perTeam"] = {};
  for (const [kind, { total, samples }] of Object.entries(perTeam)) {
    perTeamOut[kind as DocumentKind] = {
      avgMs: Math.round(total / samples),
      samples,
    };
  }

  return {
    perTeam: perTeamOut,
    session:
      sessionSamples > 0
        ? { avgMs: Math.round(sessionTotal / sessionSamples), samples: sessionSamples }
        : null,
    analyst:
      analystSamples > 0
        ? { avgMs: Math.round(analystTotal / analystSamples), samples: analystSamples }
        : null,
  };
}
