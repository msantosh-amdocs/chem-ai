import { Router } from "express";
import { history } from "../store/history.js";
import type { ArchitectureSession, DocumentArtifact, StageTeam } from "../types.js";

export const router = Router();

router.get("/history", async (_req, res) => {
  const list = await history.list();
  const sessions: unknown[] = [];
  for (const s of list) {
    try {
      sessions.push(summarize(s));
    } catch {
      // Skip legacy sessions that don't match the current schema.
    }
  }
  res.json({ sessions });
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
    })),
  };
}
