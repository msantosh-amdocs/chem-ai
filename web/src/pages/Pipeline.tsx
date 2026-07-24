import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Markdown, Spinner, StatusPill } from "../sandbox";
import {
  SpecialistAvatar,
  PipelineNode,
  DebateRounds,
  PIPELINE_WAVES,
  canonicalKindOrder,
  computeLiveDuration,
  derivePipelineNodeStatus,
  formatDuration,
  isProcessKindActive,
} from "../business";
import {
  useCurrentSession,
  useHistoryAverages,
  useLive,
  useConnectorActions,
  type DocumentArtifact,
  type SpecialistSnapshot,
  type StageTeamSnapshot,
  type DocumentKind,
  type StageCost,
} from "../connector";

export function PipelinePage() {
  const currentSession = useCurrentSession();
  const live = useLive();
  const averages = useHistoryAverages();
  const { setTab, regenerate } = useConnectorActions();

  // Which artifact's debate trail is currently expanded. Only one at a
  // time — the user opens it explicitly by clicking a tile, which
  // matches the "hide verbose by default" ask.
  const [openKind, setOpenKind] = useState<DocumentKind | null>(null);

  // Live wall-clock tick for the current-run duration and any in-flight
  // per-team tiles. We only spin an interval while there's something
  // still running (or an unfinished session) so completed sessions
  // don't waste render budget.
  const [now, setNow] = useState<number>(() => Date.now());
  const sessionRunning =
    currentSession?.status === "refining" ||
    currentSession?.status === "locked" ||
    currentSession?.status === "generating" ||
    live.running ||
    live.concepting;
  useEffect(() => {
    if (!sessionRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sessionRunning]);

  const teamByKind = useMemo(
    () =>
      new Map<DocumentKind, StageTeamSnapshot>(
        (currentSession?.specialists.teams ?? []).map((t) => [t.kind, t]),
      ),
    [currentSession],
  );
  const artByKind = useMemo(
    () =>
      new Map<DocumentKind, DocumentArtifact>(
        (currentSession?.artifacts ?? []).map((a) => [a.kind, a]),
      ),
    [currentSession],
  );

  // Progress computation — must be a hook, so it runs on every render
  // regardless of whether currentSession is null. We just no-op if it is.
  // We exclude the inactive process kind (procedure vs semiconductor)
  // from the total so a run where §2 Industry picked one of them
  // doesn't get stuck at "6 of 7 done" forever.
  const progress = useMemo(() => {
    if (!currentSession) return { pct: 0, done: 0, total: 0, running: 0, errored: 0 };
    const industry = currentSession.industry;
    const teams = currentSession.specialists.teams.filter((t) =>
      isProcessKindActive(t.kind, industry),
    );
    const total = teams.length;
    let done = 0;
    let running = 0;
    let errored = 0;
    for (const t of teams) {
      const a = artByKind.get(t.kind);
      if (live.errors[t.kind]) errored++;
      else if (live.done.has(t.kind) || (a?.content && !a.error)) done++;
      else if (live.generating.has(t.kind)) running++;
    }
    // Give half credit for running artifacts so the bar visibly advances
    // as soon as a wave starts, even before its first round completes.
    const weighted = done + errored + running * 0.5;
    const pct = total === 0 ? 0 : Math.min(100, Math.round((weighted / total) * 100));
    return { pct, done, total, running, errored };
  }, [currentSession, artByKind, live.done, live.generating, live.errors]);

  if (!currentSession) {
    return (
      <div className="max-w-[900px] mx-auto text-center py-16 text-slate-500">
        No session started yet.
      </div>
    );
  }

  const costs = currentSession.costs;
  const durations = currentSession.durations;
  const showProgress =
    currentSession.status === "generating" ||
    currentSession.status === "locked" ||
    currentSession.status === "completed" ||
    live.running ||
    live.concepting;

  // Elapsed for the run headline — prefer the server-stamped total once
  // it's set (terminal state), otherwise wall-clock against the tick.
  const runElapsedMs =
    durations?.totalMs ??
    computeLiveDuration(currentSession.createdAt, currentSession.endedAt ?? null, now);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-slate-900">Pipeline</h1>
          <p className="text-slate-600 mt-1">
            Each department debates its artifact until they reach{" "}
            <span className="font-semibold">{currentSession.settings.threshold}%</span>{" "}
            agreement
            {currentSession.settings.terminationPolicy === "threshold_only"
              ? " (no round cap)"
              : ` (or ${currentSession.settings.maxRounds} rounds)`}
            . Click any tile to open its debate trail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentSession.status === "completed" && (
            <>
              <button className="btn btn-ghost" onClick={regenerate}>
                ↻ Regenerate
              </button>
              <button className="btn btn-primary" onClick={() => setTab("session-documents")}>
                Read documents →
              </button>
            </>
          )}
        </div>
      </div>

      {showProgress && (
        <ProgressBar
          pct={progress.pct}
          done={progress.done}
          running={progress.running}
          errored={progress.errored}
          total={progress.total}
          status={currentSession.status}
          totalUsd={costs?.total.estimatedUsd ?? 0}
          totalCalls={costs?.total.llmCalls ?? 0}
          usageComplete={costs?.usageComplete ?? true}
          elapsedMs={runElapsedMs}
          averageMs={averages?.session?.avgMs}
          averageSamples={averages?.session?.samples}
          live={sessionRunning}
        />
      )}

      <ConceptCard />

      <section>
        <h2 className="font-display text-xl text-slate-900 mb-3">Dependency pipeline</h2>
        <div className="card p-6 overflow-x-auto">
          <div className="flex items-stretch gap-4 min-w-fit">
            {PIPELINE_WAVES.map((wave, i) => (
              <div key={i} className="flex items-stretch gap-3">
                <div className="flex flex-col gap-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium text-center">
                    Wave {i + 1}
                  </div>
                  <div className="flex flex-col gap-3">
                    {wave.map((kind) => {
                      const team = teamByKind.get(kind);
                      const artifact = artByKind.get(kind);
                      const status = derivePipelineNodeStatus({
                        kind,
                        team,
                        artifact,
                        liveGenerating: live.generating,
                        liveDone: live.done,
                        liveErrors: live.errors,
                        industry: currentSession.industry,
                      });
                      // Live duration: server-stamped when the stage
                      // finished, otherwise wall-clock against the tick.
                      const stageMs =
                        artifact?.durationMs ??
                        computeLiveDuration(
                          artifact?.startedAt,
                          artifact?.endedAt,
                          now,
                        );
                      const teamAvg = averages?.perTeam?.[kind];
                      return (
                        <PipelineNode
                          key={kind}
                          kind={kind}
                          team={team}
                          artifact={artifact}
                          status={status}
                          maxRounds={currentSession.settings.maxRounds}
                          activeMembers={live.activeMembers[kind]}
                          error={live.errors[kind]}
                          cost={costs?.perTeam[kind]}
                          durationMs={stageMs}
                          averageMs={teamAvg?.avgMs}
                          averageSamples={teamAvg?.samples}
                          selected={openKind === kind}
                          onOpen={() =>
                            setOpenKind((prev) => (prev === kind ? null : kind))
                          }
                        />
                      );
                    })}
                  </div>
                </div>
                {i < PIPELINE_WAVES.length - 1 && (
                  <div className="self-center text-slate-300 text-2xl px-1">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*
        Live debate is opt-in — a tile has to be clicked. This replaces the
        old always-visible list of every stage's debate panel, which was
        overwhelming while a run was in flight.
      */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl text-slate-900">Live debate</h2>
          {openKind && (
            <button
              className="text-xs text-slate-500 hover:text-slate-800 underline"
              onClick={() => setOpenKind(null)}
            >
              Close debate view
            </button>
          )}
        </div>
        {openKind ? (
          (() => {
            const artifact = artByKind.get(openKind);
            const team = teamByKind.get(openKind);
            if (!team) {
              return (
                <div className="card p-6 text-center text-slate-500">
                  Team not configured.
                </div>
              );
            }
            if (!artifact) {
              return (
                <div className="card p-6 text-center text-slate-500">
                  This department hasn't started yet. Debate will appear here once it does.
                </div>
              );
            }
            return (
              <StageDebatePanel
                artifact={artifact}
                team={team}
                activeMembers={live.activeMembers[openKind]}
                threshold={currentSession.settings.threshold}
                error={artifact.error ?? live.errors[openKind]}
              />
            );
          })()
        ) : currentSession.artifacts.length === 0 && !live.concepting && !live.running ? (
          <div className="card p-6 text-center text-slate-500 text-sm">
            Nothing running yet.
          </div>
        ) : (
          <div className="card p-6 text-center text-slate-500 text-sm">
            {[...currentSession.artifacts]
              .sort((a, b) => canonicalKindOrder(a.kind) - canonicalKindOrder(b.kind))
              .filter((a) => a.rounds.length || a.streaming || a.error)
              .length > 0
              ? "Click any tile above to expand its debate — verbose output is hidden by default."
              : live.concepting
                ? "Writing the refined concept…"
                : "Waiting on the first wave to kick off."}
          </div>
        )}
      </section>
    </div>
  );
}

function ProgressBar({
  pct,
  done,
  running,
  errored,
  total,
  status,
  totalUsd,
  totalCalls,
  usageComplete,
  elapsedMs,
  averageMs,
  averageSamples,
  live,
}: {
  pct: number;
  done: number;
  running: number;
  errored: number;
  total: number;
  status: string;
  totalUsd: number;
  totalCalls: number;
  usageComplete: boolean;
  elapsedMs: number | null;
  averageMs?: number;
  averageSamples?: number;
  /** Whether the run is still in flight (drives the "…" ticker). */
  live: boolean;
}) {
  const bar =
    status === "completed"
      ? "bg-emerald-500"
      : errored > 0
        ? "bg-amber-500"
        : "bg-indigo-500";
  const elapsedTitle =
    elapsedMs !== null
      ? (live ? "Running for " : "Total run time ") +
        formatDuration(elapsedMs) +
        (averageMs
          ? ` · typical ${formatDuration(averageMs)} across ${averageSamples} completed run${averageSamples === 1 ? "" : "s"}`
          : "")
      : "";
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-2 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">
            {status === "completed"
              ? "Pipeline complete"
              : status === "generating"
                ? "Generating artifacts…"
                : status === "locked"
                  ? "Warming up…"
                  : "Running"}
          </span>
          <span className="text-xs text-slate-500">
            {done}/{total} done
            {running > 0 && ` · ${running} in flight`}
            {errored > 0 && ` · ${errored} errored`}
          </span>
        </div>
        <div className="text-xs text-slate-600 flex items-center gap-3">
          {elapsedMs !== null && (
            <span title={elapsedTitle}>
              {live ? "Elapsed" : "Ran for"}{" "}
              <span className="font-mono text-slate-800">
                {formatDuration(elapsedMs)}
                {live && <span className="text-amber-600">…</span>}
              </span>
              {averageMs && (
                <span className="text-slate-400">
                  {" "}
                  / avg {formatDuration(averageMs)}
                </span>
              )}
            </span>
          )}
          <span className="font-mono">{pct}%</span>
          {totalCalls > 0 && (
            <span className="text-slate-500">
              est. spend{" "}
              <span className="font-mono text-slate-800">
                ${totalUsd.toFixed(totalUsd < 1 ? 4 : 2)}
              </span>{" "}
              across {totalCalls} call{totalCalls === 1 ? "" : "s"}
              {!usageComplete && " (partial)"}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 rounded bg-slate-200 overflow-hidden">
        <div
          className={clsx("h-full rounded transition-all", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ConceptCard() {
  const currentSession = useCurrentSession();
  const live = useLive();
  if (!currentSession) return null;

  if (!currentSession.refinedIdea) {
    if (live.concepting) {
      return (
        <div className="card p-5 flex items-center gap-3 text-slate-600">
          <Spinner /> {currentSession.specialists.analyst.name} is writing the Refined Concept…
        </div>
      );
    }
    return null;
  }

  return (
    <details className="card p-4">
      <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900">
        <span>Refined concept</span>
        <span className="text-xs text-slate-500">
          (by {currentSession.specialists.analyst.name} — shared input to every team)
        </span>
      </summary>
      <div className="mt-3">
        <Markdown source={currentSession.refinedIdea.content} />
      </div>
    </details>
  );
}

function StageDebatePanel({
  artifact,
  team,
  activeMembers,
  threshold,
  error,
}: {
  artifact: DocumentArtifact;
  team: StageTeamSnapshot;
  activeMembers?: string[];
  threshold: number;
  error?: string;
}) {
  const activeSet = new Set(activeMembers ?? []);
  const memberById = new Map<string, SpecialistSnapshot>(
    team.members.map((m) => [m.id, m]),
  );
  const leadId = team.members[0]?.id;
  const lead = leadId ? memberById.get(leadId) : undefined;

  return (
    <div className="card overflow-hidden">
      <div
        className={clsx(
          "px-5 py-3 border-b flex items-center gap-3",
          lead?.accent.bg,
          lead?.accent.border,
        )}
      >
        {lead && <SpecialistAvatar persona={lead} size="sm" />}
        <div className="flex-1 min-w-0">
          <div className={clsx("font-semibold text-sm", lead?.accent.text)}>
            {artifact.title}
          </div>
          <div className="text-xs text-slate-600 truncate">
            {team.members.length}-member team ·{" "}
            {team.members.map((m) => m.name).join(" · ")}
          </div>
        </div>
        <StatusPill
          status={
            error
              ? "error"
              : artifact.streaming
                ? "running"
                : artifact.content
                  ? "done"
                  : "queued"
          }
        />
      </div>

      {error ? (
        <div className="p-5">
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {error}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {artifact.rounds.length > 0 && (
            <div className="px-5 py-4">
              <DebateRounds
                artifact={artifact}
                team={team}
                threshold={threshold}
                activeMembers={activeMembers}
              />
            </div>
          )}

          {artifact.content ? (
            <div className="p-5">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
                Final artifact — by {lead?.name ?? artifact.producedBy}
              </div>
              <Markdown source={artifact.content} />
            </div>
          ) : artifact.streaming ? (
            <div className="p-5 flex items-center gap-3 text-slate-500 text-sm">
              <Spinner />{" "}
              {activeSet.size > 0
                ? `${Array.from(activeSet)
                    .map((id) => memberById.get(id)?.name ?? id)
                    .join(", ")} drafting…`
                : "Debate in progress…"}
            </div>
          ) : (
            <div className="p-5 text-slate-500 text-sm italic">Queued.</div>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export so the type is available for downstream callers if needed.
export type { StageCost };
