import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  useHistoryList,
  useHistoryAverages,
  useConnectorActions,
  KIND_SHORT,
  KIND_LABELS,
  type DocumentKind,
  type HistoryAverages,
  type SessionStatus,
  type HistorySummary,
  type SessionCosts,
  type StageCost,
} from "../connector";
import {
  formatCompactDuration,
  formatDuration,
  computeLiveDuration,
} from "../business";

type ArtifactSummary = HistorySummary["artifacts"][number];

export function HistoryPage() {
  const historyList = useHistoryList();
  const averages = useHistoryAverages();
  const { loadHistory, openSession, deleteSession, clearHistory } = useConnectorActions();

  const [query, setQuery] = useState("");
  // A 1Hz tick so still-running sessions render a live-updating duration
  // in the row header and on their in-flight artifact chips. Only starts
  // running when there is at least one non-terminal session on screen so
  // completed-only history pages don't waste render cycles.
  const anyRunning = historyList.some(
    (s) =>
      s.status === "refining" ||
      s.status === "locked" ||
      s.status === "generating",
  );
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filtered = useMemo(() => filterHistory(historyList, query), [historyList, query]);

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-slate-900">History</h1>
          <p className="text-slate-600 mt-1">
            {historyList.length} past session{historyList.length === 1 ? "" : "s"} on this machine.
          </p>
        </div>
        {historyList.length > 0 && (
          <button
            className="btn btn-ghost text-sm text-rose-600"
            onClick={() => {
              if (confirm("Delete all history? This can't be undone.")) void clearHistory();
            }}
          >
            Clear history
          </button>
        )}
      </div>

      {historyList.length > 0 && (
        <input
          className="field text-sm max-w-md"
          placeholder="Filter by title or idea…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter history"
        />
      )}

      {averages && hasAnyAverageData(averages) && (
        <AveragesPanel averages={averages} />
      )}

      {historyList.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No sessions yet. Start a new idea to see it here.
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No sessions matched "{query}".
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const totalMembers = s.teams.reduce((n, t) => n + t.members.length, 0);
            const runDurationMs = computeSessionDurationMs(s, now);
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <button
                        className="font-display text-lg text-slate-900 hover:text-slate-700 truncate max-w-[70ch]"
                        onClick={() => openSession(s.id)}
                      >
                        {s.title}
                      </button>
                      <StatusChip status={s.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>{new Date(s.createdAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>
                        {s.refinementRounds} refinement round
                        {s.refinementRounds === 1 ? "" : "s"}
                      </span>
                      {s.completeness !== null && (
                        <>
                          <span>·</span>
                          <span>Completeness {s.completeness}%</span>
                        </>
                      )}
                      <span>·</span>
                      <span>
                        {totalMembers} specialist{totalMembers === 1 ? "" : "s"} in{" "}
                        {s.teams.length} team{s.teams.length === 1 ? "" : "s"}
                      </span>
                      <span>·</span>
                      <span>
                        Threshold {s.settings.threshold}%, max {s.settings.maxRounds} rounds
                        {s.settings.terminationPolicy &&
                          s.settings.terminationPolicy !== "threshold_or_max" && (
                            <span className="text-slate-400">
                              {" "}
                              ({s.settings.terminationPolicy})
                            </span>
                          )}
                      </span>
                      <span>·</span>
                      <span>
                        {s.documents} document{s.documents === 1 ? "" : "s"}
                      </span>
                      {runDurationMs !== null && (
                        <>
                          <span>·</span>
                          <DurationBadge
                            ms={runDurationMs}
                            live={isSessionRunning(s)}
                            averageMs={averages?.session?.avgMs}
                            averageSamples={averages?.session?.samples}
                            label="Run"
                          />
                        </>
                      )}
                      {s.costs && s.costs.total.llmCalls > 0 && (
                        <>
                          <span>·</span>
                          <CostBadge costs={s.costs} />
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 mt-2 line-clamp-2">{s.idea}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {s.artifacts.length === 0 ? (
                        <span className="text-xs text-slate-500 italic">
                          No artifacts yet
                        </span>
                      ) : (
                        s.artifacts.map((a) => (
                          <ArtifactChip
                            key={a.kind}
                            artifact={a}
                            cost={s.costs?.perTeam?.[a.kind]}
                            teamAverageMs={averages?.perTeam?.[a.kind]?.avgMs}
                            teamAverageSamples={averages?.perTeam?.[a.kind]?.samples}
                            now={now}
                          />
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      className="btn btn-primary text-sm"
                      onClick={() => openSession(s.id)}
                    >
                      Open
                    </button>
                    <button
                      className="text-xs text-rose-500 hover:text-rose-700"
                      onClick={() => {
                        if (confirm(`Delete "${s.title}"?`)) void deleteSession(s.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Pure helper: case-insensitive filter across title, idea, and short kind
 * codes. Exported for unit testing.
 */
export function filterHistory(list: HistorySummary[], q: string): HistorySummary[] {
  const query = q.trim().toLowerCase();
  if (!query) return list;
  return list.filter((s) => {
    if (s.title.toLowerCase().includes(query)) return true;
    if (s.idea.toLowerCase().includes(query)) return true;
    for (const a of s.artifacts) {
      if (KIND_SHORT[a.kind as DocumentKind].toLowerCase().includes(query)) return true;
    }
    return false;
  });
}

function StatusChip({ status }: { status: SessionStatus }) {
  const style = {
    refining: "bg-slate-100 text-slate-700",
    locked: "bg-indigo-100 text-indigo-800",
    generating: "bg-amber-100 text-amber-800",
    completed: "bg-emerald-100 text-emerald-800",
    error: "bg-rose-100 text-rose-800",
    cancelled: "bg-slate-100 text-slate-500",
  }[status];
  return (
    <span
      className={clsx(
        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium",
        style,
      )}
    >
      {status}
    </span>
  );
}

function ArtifactChip({
  artifact,
  cost,
  teamAverageMs,
  teamAverageSamples,
  now,
}: {
  artifact: ArtifactSummary;
  cost?: StageCost;
  /** Cross-history average duration for this team (ms). */
  teamAverageMs?: number;
  teamAverageSamples?: number;
  /** Injected wall-clock for computing in-flight durations. */
  now: number;
}) {
  const { kind, hasContent, error, rounds, terminatedBy } = artifact;
  const style = error
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : hasContent
      ? terminatedBy === "agreement"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-500 border-slate-200";
  const suffix = error
    ? " · error"
    : hasContent
      ? terminatedBy === "agreement"
        ? ` · ✓ r${rounds}`
        : ` · r${rounds}/max`
      : "";
  const costSuffix =
    cost && cost.llmCalls > 0
      ? ` · $${cost.estimatedUsd.toFixed(cost.estimatedUsd < 1 ? 4 : 2)}`
      : "";

  // Prefer the server-computed durationMs (present once the stage
  // finished). While the stage is still running the server keeps
  // sending `startedAt` without `endedAt`, so we fall back to a
  // wall-clock delta against `now` to render a live ticker.
  const live = !!artifact.startedAt && !artifact.endedAt && !error;
  const durationMs =
    artifact.durationMs ??
    computeLiveDuration(artifact.startedAt, artifact.endedAt, now);
  const durationSuffix =
    durationMs !== null && durationMs !== undefined
      ? ` · ${formatCompactDuration(durationMs)}${live ? "…" : ""}`
      : "";

  const title = [
    error
      ? error
      : hasContent
        ? terminatedBy === "agreement"
          ? `Converged after ${rounds} round(s)`
          : `Stopped at ${rounds} round(s) (max rounds)`
        : "Not produced yet",
    cost && cost.llmCalls > 0
      ? `Estimated spend $${cost.estimatedUsd.toFixed(4)} across ${cost.llmCalls} call(s) · ${cost.totalTokens.toLocaleString()} tokens`
      : "",
    durationMs !== null && durationMs !== undefined
      ? `${live ? "Running for " : "Took "}${formatDuration(durationMs)}` +
        (teamAverageMs
          ? ` · team avg ${formatDuration(teamAverageMs)} over ${teamAverageSamples} run${teamAverageSamples === 1 ? "" : "s"}`
          : "")
      : "",
  ]
    .filter(Boolean)
    .join(" — ");
  return (
    <span
      className={clsx(
        "text-[10px] px-2 py-0.5 rounded-full border font-medium",
        style,
      )}
      title={title}
    >
      {KIND_SHORT[kind]}
      {suffix}
      {costSuffix}
      {durationSuffix}
    </span>
  );
}

/**
 * Small inline duration chip used in the session-header meta row.
 * Displays a compact "3m 24s" style value and, if we have a global
 * average to compare against, whispers "avg 4m 12s" in the tooltip so
 * a user can spot slow runs at a glance without a second UI element.
 */
function DurationBadge({
  ms,
  live,
  averageMs,
  averageSamples,
  label,
}: {
  ms: number;
  live: boolean;
  averageMs?: number;
  averageSamples?: number;
  label: string;
}) {
  const value = formatDuration(ms);
  const title =
    (live ? `${label} still running — ` : `${label} took `) +
    formatDuration(ms) +
    (averageMs
      ? ` · typical ${formatDuration(averageMs)} across ${averageSamples} completed run${averageSamples === 1 ? "" : "s"}`
      : "");
  return (
    <span className="text-slate-600" title={title}>
      {label}{" "}
      <span className="font-mono text-slate-800">
        {value}
        {live && <span className="text-amber-600">…</span>}
      </span>
    </span>
  );
}

/**
 * Header strip on the History page showing "typical" durations pulled
 * from every terminal session on disk. Purely informational — helps
 * calibrate expectations before starting a new run and makes it
 * obvious when an in-flight run is running unusually slow.
 */
function AveragesPanel({ averages }: { averages: HistoryAverages }) {
  const teamEntries = (Object.entries(averages.perTeam) as Array<
    [DocumentKind, { avgMs: number; samples: number }]
  >).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <section
      className="card p-3 text-xs text-slate-600 flex flex-col gap-2"
      aria-label="Typical durations"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium text-slate-800">Typical duration</span>
        {averages.session && (
          <span title={`Averaged over ${averages.session.samples} completed run(s)`}>
            Full run{" "}
            <span className="font-mono text-slate-800">
              {formatDuration(averages.session.avgMs)}
            </span>
            <span className="text-slate-400">
              {" "}
              ({averages.session.samples})
            </span>
          </span>
        )}
        {averages.analyst && (
          <span title={`Averaged over ${averages.analyst.samples} completed run(s)`}>
            Analyst{" "}
            <span className="font-mono text-slate-800">
              {formatDuration(averages.analyst.avgMs)}
            </span>
            <span className="text-slate-400">
              {" "}
              ({averages.analyst.samples})
            </span>
          </span>
        )}
      </div>
      {teamEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {teamEntries.map(([kind, agg]) => (
            <span
              key={kind}
              className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700"
              title={`Averaged over ${agg.samples} run(s)`}
            >
              {KIND_LABELS[kind]}:{" "}
              <span className="font-mono text-slate-900">
                {formatDuration(agg.avgMs)}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Pure helper — did any of the three duration channels get populated?
 * We suppress the AveragesPanel on brand-new installs where nothing has
 * been measured yet so the user isn't confronted with an empty widget.
 */
export function hasAnyAverageData(a: HistoryAverages): boolean {
  if (a.session || a.analyst) return true;
  for (const v of Object.values(a.perTeam)) {
    if (v && v.samples > 0) return true;
  }
  return false;
}

/**
 * Duration for a single session in the list — prefers the server-stamped
 * `durations.totalMs`, falls back to `endedAt - createdAt`, and finally
 * to a live wall-clock ticker for still-running sessions.
 */
export function computeSessionDurationMs(
  s: HistorySummary,
  now: number,
): number | null {
  if (s.durations?.totalMs != null) return s.durations.totalMs;
  if (s.endedAt) return computeLiveDuration(s.createdAt, s.endedAt, now);
  if (isSessionRunning(s)) return computeLiveDuration(s.createdAt, null, now);
  return null;
}

/** Sessions in a non-terminal state should show a live duration counter. */
export function isSessionRunning(s: HistorySummary): boolean {
  return (
    s.status === "refining" ||
    s.status === "locked" ||
    s.status === "generating"
  );
}

function CostBadge({ costs }: { costs: SessionCosts }) {
  const { estimatedUsd, totalTokens, llmCalls } = costs.total;
  const partial = !costs.usageComplete;
  return (
    <span
      className="text-slate-600"
      title={
        `Estimated total spend $${estimatedUsd.toFixed(4)} across ${llmCalls} LLM ` +
        `call(s) · ${totalTokens.toLocaleString()} tokens` +
        (partial ? " · some calls did not report usage; this is a lower bound" : "")
      }
    >
      est.{" "}
      <span className="font-mono text-slate-800">
        ${estimatedUsd.toFixed(estimatedUsd < 1 ? 4 : 2)}
      </span>
      {partial && <span className="text-amber-600"> (partial)</span>}
    </span>
  );
}
