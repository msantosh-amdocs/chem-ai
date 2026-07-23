import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  useHistoryList,
  useConnectorActions,
  KIND_SHORT,
  type DocumentKind,
  type SessionStatus,
  type HistorySummary,
  type SessionCosts,
  type StageCost,
} from "../connector";

type ArtifactSummary = HistorySummary["artifacts"][number];

export function HistoryPage() {
  const historyList = useHistoryList();
  const { loadHistory, openSession, deleteSession, clearHistory } = useConnectorActions();

  const [query, setQuery] = useState("");

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
}: {
  artifact: ArtifactSummary;
  cost?: StageCost;
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
    </span>
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
