import { useMemo, type MouseEvent } from "react";
import clsx from "clsx";
import { SpecialistAvatar } from "./SpecialistAvatar";
import { Spinner, StatusPill } from "../sandbox";
import type { PipelineNodeStatus } from "./pipeline";
import { formatCompactDuration, formatDuration } from "./duration";
import { KIND_LABELS, KIND_SHORT, type DocumentKind } from "../connector/personas";
import type {
  DocumentArtifact,
  StageCost,
  StageTeamSnapshot,
} from "../connector/types";

interface Props {
  kind: DocumentKind;
  team: StageTeamSnapshot | undefined;
  artifact: DocumentArtifact | undefined;
  status: PipelineNodeStatus;
  maxRounds: number;
  activeMembers?: string[];
  error?: string;
  /** Per-team token + USD rollup surfaced under the tile. */
  cost?: StageCost;
  /**
   * Wall-clock duration for this team, in ms. Either the server-stamped
   * `durationMs` (once the stage finished) or a live delta computed by
   * the caller from `startedAt` to `Date.now()` while streaming.
   */
  durationMs?: number | null;
  /** Cross-history average duration for this team (ms). */
  averageMs?: number;
  averageSamples?: number;
  /** Highlight when this tile's debate is expanded on the Pipeline page. */
  selected?: boolean;
  /** Called when the tile is clicked — parent decides what to reveal. */
  onOpen?: () => void;
  /**
   * If set, render a Retry button on the tile (used for errored /
   * cancelled stages). Clicking it fires the callback WITHOUT
   * triggering the tile's `onOpen` (event propagation is stopped).
   */
  onRetry?: () => void;
  /** Show a spinner + disable the Retry button while a retry is in flight. */
  retryBusy?: boolean;
}

/**
 * Business component: a single tile in the pipeline DAG showing team,
 * progress, and (once a round is complete) average agreement.
 */
export function PipelineNode({
  kind,
  team,
  artifact,
  status,
  maxRounds,
  activeMembers,
  error,
  cost,
  durationMs,
  averageMs,
  averageSamples,
  selected,
  onOpen,
  onRetry,
  retryBusy,
}: Props) {
  const label = KIND_LABELS[kind];
  const done = status === "done";
  const running = status === "running";
  const disabled = status === "disabled";
  const skipped = status === "skipped";
  const awaitingApproval = status === "awaiting_approval";
  const awaitingClarification = status === "awaiting_clarification";
  const awaiting = awaitingApproval || awaitingClarification;

  const roundsSoFar = artifact?.rounds.length ?? 0;
  const lastRound = artifact?.rounds[artifact.rounds.length - 1];
  const avgAgreement =
    lastRound && lastRound.n > 1
      ? Math.round(
          lastRound.drafts.reduce((a, d) => a + d.agreementWithOthers, 0) /
            Math.max(1, lastRound.drafts.length),
        )
      : null;
  const revisionCount = artifact?.revisionCount ?? 0;
  const pendingClarifications = artifact
    ? (artifact.clarifications ?? []).filter(
        (c) =>
          !(artifact.clarificationAnswers ?? []).some((a) => a.requestId === c.id),
      ).length
    : 0;

  const activeSet = useMemo(() => new Set(activeMembers ?? []), [activeMembers]);

  const bg = disabled
    ? "bg-slate-50 border-dashed border-slate-300"
    : skipped
      ? "bg-slate-50 border-dashed border-slate-300 opacity-70"
      : status === "error"
        ? "bg-rose-50 border-rose-300"
        : done
          ? "bg-emerald-50 border-emerald-300"
          : awaitingClarification
            ? "bg-amber-50 border-amber-400 shadow-pop"
            : awaitingApproval
              ? "bg-indigo-50 border-indigo-400 shadow-pop"
              : running
                ? "bg-amber-50 border-amber-300 shadow-pop"
                : "bg-white border-slate-200";

  // The tile normally renders as a <button> so keyboard users can open
  // its debate trail. But when we're going to render an inline Retry
  // <button> inside, we must NOT nest buttons — fall back to a <div>
  // wrapper and let the trailing "click to view debate →" hint carry
  // the open action instead.
  const clickable = !disabled && !skipped && !!onOpen;
  const asButton = clickable && !onRetry;
  const Wrapper: "button" | "div" = asButton ? "button" : "div";

  return (
    <Wrapper
      type={asButton ? "button" : undefined}
      onClick={asButton ? onOpen : undefined}
      aria-pressed={asButton ? !!selected : undefined}
      title={
        asButton
          ? selected
            ? `Close ${KIND_LABELS[kind]} debate`
            : `Open ${KIND_LABELS[kind]} debate`
          : undefined
      }
      className={clsx(
        "border-2 rounded-xl p-3 w-[260px] transition-all text-left",
        bg,
        asButton && "hover:shadow-pop focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400",
        selected && "ring-2 ring-indigo-500 ring-offset-1",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-slate-900 truncate">
            {KIND_SHORT[kind]}
          </div>
          <div className="text-[11px] text-slate-500 truncate">{label}</div>
        </div>
        <StatusPill status={status} />
      </div>

      {skipped ? (
        <div className="text-xs text-slate-500 italic">
          Not applicable to this run — the analyst classified this project as{" "}
          {kind === "procedure" ? "semiconductor" : "chemical / pharma"},
          so the {kind === "procedure" ? "Semiconductor Manufacturing" : "Procedure"}{" "}
          department handled the process artifact instead.
        </div>
      ) : team ? (
        <>
          <div className="flex -space-x-2 mb-2">
            {team.members.map((m) => {
              const pulsing = activeSet.has(m.id);
              return (
                <div
                  key={m.id}
                  className={clsx(
                    "rounded-full ring-2 ring-white",
                    pulsing && "animate-pulse",
                  )}
                  title={`${m.name}${pulsing ? " — drafting…" : ""}`}
                >
                  <SpecialistAvatar persona={m} size="sm" />
                </div>
              );
            })}
          </div>
          <div className="flex items-baseline justify-between text-[11px] text-slate-500">
            <span>
              {team.members.length} member{team.members.length === 1 ? "" : "s"}
            </span>
            {roundsSoFar > 0 && (
              <span>
                round {roundsSoFar}/{maxRounds}
              </span>
            )}
          </div>
          {avgAgreement !== null && (
            <div className="mt-1.5">
              <div className="flex items-baseline justify-between text-[10px] text-slate-500 mb-0.5">
                <span>avg agreement</span>
                <span className="font-mono">{avgAgreement}%</span>
              </div>
              <div className="h-1.5 rounded bg-slate-200 overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded transition-all",
                    avgAgreement >= 95
                      ? "bg-emerald-500"
                      : avgAgreement >= 80
                        ? "bg-lime-500"
                        : avgAgreement >= 60
                          ? "bg-amber-500"
                          : "bg-rose-500",
                  )}
                  style={{ width: `${avgAgreement}%` }}
                />
              </div>
            </div>
          )}
          {done && artifact?.terminatedBy && (
            <div className="mt-1.5 text-[10px] text-slate-500">
              {artifact.terminatedBy === "agreement"
                ? "✓ agreement reached"
                : artifact.terminatedBy === "maxRounds"
                  ? "stopped at max rounds"
                  : "errored"}
            </div>
          )}
          {awaitingApproval && (
            <div className="mt-1.5 text-[10px] text-indigo-800 font-medium">
              Awaiting your Approve / Revise decision
            </div>
          )}
          {awaitingClarification && (
            <div className="mt-1.5 text-[10px] text-amber-800 font-medium">
              {pendingClarifications} question{pendingClarifications === 1 ? "" : "s"} for you
            </div>
          )}
          {revisionCount > 0 && !awaiting && (
            <div className="mt-1 text-[10px] text-slate-500">
              revision {revisionCount}
            </div>
          )}
          {cost && cost.llmCalls > 0 && (
            <div className="mt-1 text-[10px] text-slate-500 flex items-baseline justify-between gap-1">
              <span>est. cost</span>
              <span className="font-mono text-slate-700">
                ${cost.estimatedUsd.toFixed(cost.estimatedUsd < 1 ? 4 : 2)}
                <span className="text-slate-400 font-normal">
                  {" "}
                  · {(cost.totalTokens / 1000).toFixed(1)}k tok
                </span>
              </span>
            </div>
          )}
          {durationMs != null && (
            <div
              className="mt-1 text-[10px] text-slate-500 flex items-baseline justify-between gap-1"
              title={
                (running ? "Running for " : "Took ") +
                formatDuration(durationMs) +
                (averageMs
                  ? ` · team avg ${formatDuration(averageMs)} across ${averageSamples} run${averageSamples === 1 ? "" : "s"}`
                  : "")
              }
            >
              <span>{running ? "elapsed" : "duration"}</span>
              <span className="font-mono text-slate-700">
                {formatCompactDuration(durationMs)}
                {running && <span className="text-amber-600">…</span>}
                {averageMs && (
                  <span className="text-slate-400 font-normal">
                    {" "}
                    / avg {formatCompactDuration(averageMs)}
                  </span>
                )}
              </span>
            </div>
          )}
          {status === "error" && (error || artifact?.error) && (
            <div
              className="mt-1.5 text-[11px] text-rose-800 bg-rose-100/70 border border-rose-200 rounded px-2 py-1"
              title={error ?? artifact?.error}
            >
              <span className="font-medium">Failed:</span>{" "}
              <span className="line-clamp-2">{error ?? artifact?.error}</span>
            </div>
          )}
          {onRetry && (
            <div className="mt-2">
              <button
                type="button"
                className="w-full text-xs font-medium rounded-md px-2 py-1.5 border border-rose-300 bg-white text-rose-800 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                  // Don't ALSO trigger the tile-open handler on the
                  // parent button — retry is its own action.
                  e.stopPropagation();
                  onRetry();
                }}
                disabled={retryBusy}
                title="Re-run this department; prior revision + clarification history is preserved"
              >
                {retryBusy ? (
                  <>
                    <Spinner /> Retrying…
                  </>
                ) : (
                  <>↻ Retry stage</>
                )}
              </button>
            </div>
          )}
          {clickable && (
            asButton ? (
              // Tile IS a <button> — the whole card is clickable, so a
              // static hint suffices.
              <div className="mt-1 text-[10px] text-slate-400">
                {selected ? "▼ debate open" : "click to view debate →"}
              </div>
            ) : (
              // Tile is a <div> (because we're rendering a nested Retry
              // <button>). Provide an explicit inline button so the
              // debate is still keyboard-reachable.
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen?.();
                }}
                className="mt-1 text-[10px] text-slate-500 hover:text-slate-900 underline focus:outline-none focus:ring-2 focus:ring-slate-400 rounded"
              >
                {selected ? "▼ debate open" : "click to view debate →"}
              </button>
            )
          )}
        </>
      ) : (
        <div className="text-xs text-slate-500 italic">team not configured</div>
      )}
    </Wrapper>
  );
}
