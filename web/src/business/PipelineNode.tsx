import { useMemo } from "react";
import clsx from "clsx";
import { SpecialistAvatar } from "./SpecialistAvatar";
import { StatusPill } from "../sandbox";
import type { PipelineNodeStatus } from "./pipeline";
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
  /** Highlight when this tile's debate is expanded on the Pipeline page. */
  selected?: boolean;
  /** Called when the tile is clicked — parent decides what to reveal. */
  onOpen?: () => void;
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
  cost,
  selected,
  onOpen,
}: Props) {
  const label = KIND_LABELS[kind];
  const done = status === "done";
  const running = status === "running";
  const disabled = status === "disabled";

  const roundsSoFar = artifact?.rounds.length ?? 0;
  const lastRound = artifact?.rounds[artifact.rounds.length - 1];
  const avgAgreement =
    lastRound && lastRound.n > 1
      ? Math.round(
          lastRound.drafts.reduce((a, d) => a + d.agreementWithOthers, 0) /
            Math.max(1, lastRound.drafts.length),
        )
      : null;

  const activeSet = useMemo(() => new Set(activeMembers ?? []), [activeMembers]);

  const bg = disabled
    ? "bg-slate-50 border-dashed border-slate-300"
    : status === "error"
      ? "bg-rose-50 border-rose-300"
      : done
        ? "bg-emerald-50 border-emerald-300"
        : running
          ? "bg-amber-50 border-amber-300 shadow-pop"
          : "bg-white border-slate-200";

  const clickable = !disabled && !!onOpen;
  const Wrapper: "button" | "div" = clickable ? "button" : "div";

  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={clickable ? onOpen : undefined}
      aria-pressed={clickable ? !!selected : undefined}
      title={
        clickable
          ? selected
            ? `Close ${KIND_LABELS[kind]} debate`
            : `Open ${KIND_LABELS[kind]} debate`
          : undefined
      }
      className={clsx(
        "border-2 rounded-xl p-3 w-[260px] transition-all text-left",
        bg,
        clickable && "hover:shadow-pop focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400",
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

      {team ? (
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
          {clickable && (
            <div className="mt-1 text-[10px] text-slate-400">
              {selected ? "▼ debate open" : "click to view debate →"}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-slate-500 italic">team not configured</div>
      )}
    </Wrapper>
  );
}
