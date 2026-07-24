import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  useHistoryList,
  useHistoryAverages,
  useConnectorActions,
  useStore,
  KIND_SHORT,
  KIND_LABELS,
  type DocumentKind,
  type HistoryAverages,
  type HistorySummary,
  type SessionStatus,
  type StageCost,
} from "../connector";
import { formatCompactDuration, formatDuration } from "../business";

/** Canonical wave order used to iterate every possible department kind. */
const ALL_KINDS: DocumentKind[] = [
  "market",
  "procedure",
  "semiconductor",
  "procurement",
  "ip",
  "finance",
  "presentation",
];

/**
 * The Dashboard is the app's home page. It replaces the old History
 * tab and provides:
 *   1. Top-level KPI cards (total / running / completed / total spend).
 *   2. A 14-day activity strip (runs per day, colour-coded by status).
 *   3. A cost-by-department horizontal bar chart, aggregated across
 *      every session in local history.
 *   4. A "typical durations" strip (session + per-team averages).
 *   5. The full list of sessions with filter, "Open" button (which
 *      navigates to the session's Refinement / Pipeline / Documents
 *      sub-view), and destructive controls (delete / clear all).
 *
 * All charts are inline SVG — no chart library dependency — because
 * the shapes are simple and the app already draws inline SVG for the
 * How-It-Works flowcharts. Colours match the surrounding Tailwind
 * palette (indigo / emerald / amber / rose).
 */
export function DashboardPage() {
  const historyList = useHistoryList();
  const averages = useHistoryAverages();
  const {
    loadHistory,
    openSession,
    deleteSession,
    clearHistory,
    setTab,
  } = useConnectorActions();

  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filtered = useMemo(() => filterHistory(historyList, query), [historyList, query]);
  const stats = useMemo(() => summarizeHistory(historyList), [historyList]);

  const startNewIdea = () => {
    // Blow away any lingering session state so /new opens as a clean
    // form even if the user hopped here from the middle of a session.
    useStore.setState({ currentSession: null });
    setTab("new-idea");
  };

  return (
    <div className="max-w-[1300px] mx-auto space-y-8">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">
            {historyList.length === 0
              ? "No runs yet — start your first idea below."
              : `${stats.totalRuns} run${stats.totalRuns === 1 ? "" : "s"} on this machine · ${stats.completedRuns} completed, ${stats.runningRuns} in progress.`}
          </p>
        </div>
        <button
          className="btn btn-primary text-base px-6 shrink-0"
          onClick={startNewIdea}
          data-testid="dashboard-new-idea-cta"
        >
          + Start new idea
        </button>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <section
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        aria-label="Key metrics"
      >
        <KpiCard
          label="Total runs"
          value={stats.totalRuns.toString()}
          hint={stats.errorRuns > 0 ? `${stats.errorRuns} errored` : undefined}
          tone="slate"
        />
        <KpiCard
          label="In progress"
          value={stats.runningRuns.toString()}
          hint={stats.runningRuns > 0 ? "live" : "idle"}
          tone={stats.runningRuns > 0 ? "amber" : "slate"}
        />
        <KpiCard
          label="Completed"
          value={stats.completedRuns.toString()}
          hint={
            stats.totalRuns > 0
              ? `${Math.round((stats.completedRuns / stats.totalRuns) * 100)}% success`
              : undefined
          }
          tone="emerald"
        />
        <KpiCard
          label="Estimated spend"
          value={formatUsd(stats.totalCostUsd)}
          hint={
            stats.totalLlmCalls > 0
              ? `${stats.totalLlmCalls.toLocaleString()} LLM calls`
              : undefined
          }
          tone="indigo"
        />
      </section>

      {/* ── Charts row ───────────────────────────────────────────── */}
      {historyList.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityChart runs={stats.perDay} />
          <CostByTeamChart perTeam={stats.costPerTeam} />
        </div>
      )}

      {/* ── Averages strip ────────────────────────────────────────── */}
      {averages && hasAnyAverageData(averages) && (
        <AveragesPanel averages={averages} />
      )}

      {/* ── Runs list ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-xl text-slate-900">Runs</h2>
            <p className="text-xs text-slate-500">
              Click any run to open its Refinement, Pipeline, and Documents.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {historyList.length > 0 && (
              <input
                className="field text-sm w-72"
                placeholder="Filter by title or idea…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter runs"
              />
            )}
            {historyList.length > 0 && (
              <button
                className="btn btn-ghost text-sm text-rose-600"
                onClick={() => {
                  if (confirm("Delete all history? This can't be undone."))
                    void clearHistory();
                }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {historyList.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">
            No sessions yet. Click <span className="font-medium">Start new idea</span>{" "}
            to kick off your first factory feasibility run.
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">
            No sessions matched "{query}".
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <RunRow
                key={s.id}
                session={s}
                onOpen={() => void openSession(s.id)}
                onDelete={() => {
                  if (confirm(`Delete "${s.title}"?`)) void deleteSession(s.id);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Data reducers — pure, exported for unit testing.
 * ──────────────────────────────────────────────────────────────── */

export interface DailyBucket {
  /** ISO date (YYYY-MM-DD) — bucket key in local time. */
  date: string;
  total: number;
  completed: number;
  running: number;
  errored: number;
}

export interface DashboardStats {
  totalRuns: number;
  completedRuns: number;
  runningRuns: number;
  errorRuns: number;
  totalCostUsd: number;
  totalLlmCalls: number;
  costPerTeam: Array<{ kind: DocumentKind; usd: number; llmCalls: number }>;
  perDay: DailyBucket[];
}

/** Summarise the entire history list into one KPI/chart-ready object. */
export function summarizeHistory(list: HistorySummary[]): DashboardStats {
  let completed = 0;
  let running = 0;
  let errored = 0;
  let totalUsd = 0;
  let totalLlm = 0;
  const teamAgg: Partial<Record<DocumentKind, { usd: number; llmCalls: number }>> = {};

  for (const s of list) {
    if (s.status === "completed") completed++;
    else if (
      s.status === "refining" ||
      s.status === "locked" ||
      s.status === "generating"
    )
      running++;
    if (s.status === "error") errored++;
    if (s.costs) {
      totalUsd += s.costs.total.estimatedUsd;
      totalLlm += s.costs.total.llmCalls;
      const perTeam = s.costs.perTeam ?? {};
      for (const kind of ALL_KINDS) {
        const c: StageCost | undefined = perTeam[kind];
        if (!c || c.llmCalls === 0) continue;
        const agg = teamAgg[kind] ?? { usd: 0, llmCalls: 0 };
        agg.usd += c.estimatedUsd;
        agg.llmCalls += c.llmCalls;
        teamAgg[kind] = agg;
      }
    }
  }

  const costPerTeam = ALL_KINDS
    .map((kind) => ({
      kind,
      usd: teamAgg[kind]?.usd ?? 0,
      llmCalls: teamAgg[kind]?.llmCalls ?? 0,
    }))
    .filter((r) => r.llmCalls > 0)
    .sort((a, b) => b.usd - a.usd);

  const perDay = bucketByDay(list, 14);

  return {
    totalRuns: list.length,
    completedRuns: completed,
    runningRuns: running,
    errorRuns: errored,
    totalCostUsd: totalUsd,
    totalLlmCalls: totalLlm,
    costPerTeam,
    perDay,
  };
}

/**
 * Bucket sessions by `createdAt` local-day for the trailing N days
 * (inclusive of today). Buckets are always returned in chronological
 * order and always exactly N long — days with zero runs still appear
 * so the chart doesn't visually skip weekends.
 */
export function bucketByDay(list: HistorySummary[], days: number): DailyBucket[] {
  const now = new Date();
  const buckets: DailyBucket[] = [];
  const byKey = new Map<string, DailyBucket>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = toLocalDateKey(d);
    const bucket: DailyBucket = {
      date: key,
      total: 0,
      completed: 0,
      running: 0,
      errored: 0,
    };
    buckets.push(bucket);
    byKey.set(key, bucket);
  }

  for (const s of list) {
    if (!s.createdAt) continue;
    const created = new Date(s.createdAt);
    const key = toLocalDateKey(created);
    const bucket = byKey.get(key);
    if (!bucket) continue;
    bucket.total++;
    if (s.status === "completed") bucket.completed++;
    else if (
      s.status === "refining" ||
      s.status === "locked" ||
      s.status === "generating"
    )
      bucket.running++;
    if (s.status === "error") bucket.errored++;
  }

  return buckets;
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** True when at least one of the averages fields carries data. */
export function hasAnyAverageData(a: HistoryAverages): boolean {
  if (a.session && a.session.samples > 0) return true;
  if (a.analyst && a.analyst.samples > 0) return true;
  return Object.values(a.perTeam ?? {}).some((v) => v && v.samples > 0);
}

/** Case-insensitive search across title, idea, and short kind codes. */
export function filterHistory(list: HistorySummary[], q: string): HistorySummary[] {
  const query = q.trim().toLowerCase();
  if (!query) return list;
  return list.filter((s) => {
    if (s.title.toLowerCase().includes(query)) return true;
    if (s.idea.toLowerCase().includes(query)) return true;
    for (const a of s.artifacts) {
      if (KIND_SHORT[a.kind as DocumentKind].toLowerCase().includes(query))
        return true;
    }
    return false;
  });
}

/* ──────────────────────────────────────────────────────────────────
 * View components (private to this page).
 * ──────────────────────────────────────────────────────────────── */

type Tone = "slate" | "amber" | "emerald" | "indigo" | "rose";
const TONE_CLASSES: Record<Tone, { bg: string; text: string; accent: string }> = {
  slate: { bg: "bg-white", text: "text-slate-900", accent: "text-slate-500" },
  amber: { bg: "bg-amber-50", text: "text-amber-900", accent: "text-amber-600" },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-900",
    accent: "text-emerald-600",
  },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-900", accent: "text-indigo-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-900", accent: "text-rose-600" },
};

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: Tone;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div
      className={clsx(
        "card p-4",
        t.bg,
        tone !== "slate" && "border-transparent",
      )}
    >
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </div>
      <div className={clsx("mt-1 font-display text-2xl", t.text)}>{value}</div>
      {hint && <div className={clsx("text-xs mt-0.5", t.accent)}>{hint}</div>}
    </div>
  );
}

/**
 * Simple SVG bar chart of runs per day. Bars are stacked by status
 * (green = completed, amber = still running, rose = errored, slate =
 * uncategorised).
 */
function ActivityChart({ runs }: { runs: DailyBucket[] }) {
  const max = Math.max(1, ...runs.map((r) => r.total));
  const width = 480;
  const height = 130;
  const barWidth = width / runs.length - 4;
  return (
    <div className="card p-4">
      <h3 className="font-display text-sm text-slate-900">Activity — last 14 days</h3>
      <p className="text-xs text-slate-500 mb-3">Runs started per day.</p>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {/* baseline */}
        <line
          x1={0}
          x2={width}
          y1={height - 20}
          y2={height - 20}
          stroke="#e2e8f0"
        />
        {runs.map((r, i) => {
          const x = i * (barWidth + 4) + 2;
          const barTop = height - 20;
          const totalH = (r.total / max) * (height - 30);
          const completedH = (r.completed / max) * (height - 30);
          const erroredH = (r.errored / max) * (height - 30);
          const runningH = (r.running / max) * (height - 30);
          const otherH = Math.max(0, totalH - completedH - erroredH - runningH);
          let y = barTop;
          const segs: React.ReactElement[] = [];
          if (completedH > 0) {
            y -= completedH;
            segs.push(
              <rect
                key="c"
                x={x}
                y={y}
                width={barWidth}
                height={completedH}
                fill="#10b981"
              />,
            );
          }
          if (runningH > 0) {
            y -= runningH;
            segs.push(
              <rect
                key="r"
                x={x}
                y={y}
                width={barWidth}
                height={runningH}
                fill="#f59e0b"
              />,
            );
          }
          if (erroredH > 0) {
            y -= erroredH;
            segs.push(
              <rect
                key="e"
                x={x}
                y={y}
                width={barWidth}
                height={erroredH}
                fill="#f43f5e"
              />,
            );
          }
          if (otherH > 0) {
            y -= otherH;
            segs.push(
              <rect
                key="o"
                x={x}
                y={y}
                width={barWidth}
                height={otherH}
                fill="#cbd5e1"
              />,
            );
          }
          // day-of-month label every 2 days to avoid clutter
          const showLabel = i % 2 === 0 || i === runs.length - 1;
          const day = r.date.slice(8);
          return (
            <g key={r.date}>
              <title>{`${r.date}: ${r.total} run${r.total === 1 ? "" : "s"}`}</title>
              {segs}
              {showLabel && (
                <text
                  x={x + barWidth / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#94a3b8"
                >
                  {day}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
        <LegendSwatch color="#10b981" label="Completed" />
        <LegendSwatch color="#f59e0b" label="Running" />
        <LegendSwatch color="#f43f5e" label="Errored" />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/** Horizontal bar chart of aggregate cost per department. */
function CostByTeamChart({
  perTeam,
}: {
  perTeam: DashboardStats["costPerTeam"];
}) {
  const max = Math.max(0.0001, ...perTeam.map((r) => r.usd));
  return (
    <div className="card p-4">
      <h3 className="font-display text-sm text-slate-900">Spend by department</h3>
      <p className="text-xs text-slate-500 mb-3">
        Sum of LLM cost across every completed and in-flight run.
      </p>
      {perTeam.length === 0 ? (
        <div className="text-xs text-slate-500 py-6 text-center">
          No costed runs yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {perTeam.map((r) => {
            const pct = (r.usd / max) * 100;
            return (
              <div key={r.kind} className="flex items-center gap-2 text-xs">
                <span className="w-28 text-slate-700 shrink-0">
                  {KIND_LABELS[r.kind]}
                </span>
                <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden relative">
                  <div
                    className="h-full bg-indigo-400"
                    style={{ width: `${pct}%` }}
                    title={`${r.llmCalls} calls · ${formatUsd(r.usd)}`}
                  />
                </div>
                <span className="w-16 text-right font-mono text-slate-800 tabular-nums">
                  {formatUsd(r.usd)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AveragesPanel({ averages }: { averages: HistoryAverages }) {
  const teamEntries = (
    Object.entries(averages.perTeam ?? {}) as Array<
      [DocumentKind, { avgMs: number; samples: number }]
    >
  )
    .filter(([, v]) => v && v.samples > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
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
            <span className="text-slate-400"> ({averages.session.samples})</span>
          </span>
        )}
        {averages.analyst && (
          <span title={`Averaged over ${averages.analyst.samples} completed run(s)`}>
            Analyst{" "}
            <span className="font-mono text-slate-800">
              {formatDuration(averages.analyst.avgMs)}
            </span>
            <span className="text-slate-400"> ({averages.analyst.samples})</span>
          </span>
        )}
      </div>
      {teamEntries.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {teamEntries.map(([kind, agg]) => (
            <span
              key={kind}
              className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700"
              title={`Averaged over ${agg.samples} run(s)`}
            >
              {KIND_SHORT[kind]}{" "}
              <span className="font-mono">{formatCompactDuration(agg.avgMs)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusChip({ status }: { status: SessionStatus }) {
  const style: Record<SessionStatus, string> = {
    refining: "bg-slate-100 text-slate-700",
    locked: "bg-indigo-100 text-indigo-800",
    generating: "bg-amber-100 text-amber-800",
    completed: "bg-emerald-100 text-emerald-800",
    error: "bg-rose-100 text-rose-800",
    cancelled: "bg-slate-100 text-slate-500",
  };
  return (
    <span
      className={clsx(
        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium",
        style[status],
      )}
    >
      {status}
    </span>
  );
}

/**
 * A single row in the "Runs" list. Compact by design — the full
 * detail (artifacts, durations, per-team spend) is reachable by
 * clicking Open, which navigates to the session's Refinement /
 * Pipeline / Documents view.
 */
function RunRow({
  session,
  onOpen,
  onDelete,
}: {
  session: HistorySummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const cost = session.costs?.total;
  return (
    <div className="card p-3 flex items-center gap-3 hover:border-slate-300 transition-colors">
      <button
        className="flex-1 min-w-0 text-left"
        onClick={onOpen}
        aria-label={`Open ${session.title}`}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-display text-base text-slate-900 truncate">
            {session.title}
          </div>
          <StatusChip status={session.status} />
        </div>
        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{new Date(session.createdAt).toLocaleString()}</span>
          {session.refinementRounds > 0 && (
            <>
              <span>·</span>
              <span>
                {session.refinementRounds} round
                {session.refinementRounds === 1 ? "" : "s"}
              </span>
            </>
          )}
          {session.completeness !== null && (
            <>
              <span>·</span>
              <span>{session.completeness}% complete</span>
            </>
          )}
          {session.durations?.totalMs != null && (
            <>
              <span>·</span>
              <span className="font-mono tabular-nums text-slate-700">
                {formatCompactDuration(session.durations.totalMs)}
              </span>
            </>
          )}
          {cost && cost.llmCalls > 0 && (
            <>
              <span>·</span>
              <span className="font-mono tabular-nums text-slate-700">
                {formatUsd(cost.estimatedUsd)}
              </span>
            </>
          )}
        </div>
        <p className="text-xs text-slate-600 mt-1 line-clamp-1">{session.idea}</p>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <button className="btn btn-primary text-xs" onClick={onOpen}>
          Open
        </button>
        <button
          className="text-xs text-rose-500 hover:text-rose-700"
          onClick={onDelete}
          aria-label={`Delete ${session.title}`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** Compact USD formatter — 4 decimals below $1, 2 above. */
function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd < 1) return `$${usd.toFixed(4)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString()}`;
}
