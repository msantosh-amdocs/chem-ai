import clsx from "clsx";

export type PillStatus =
  | "disabled"
  | "queued"
  | "running"
  | "awaiting_clarification"
  | "awaiting_approval"
  | "done"
  | "error"
  | "skipped";

interface Props {
  status: PillStatus;
  /** Optional custom label — defaults to a lowercase status keyword. */
  label?: string;
}

/**
 * Sandbox primitive: coloured status chip used across the pipeline UI.
 * The two `awaiting_*` variants are visually distinct from `running`
 * so the user can tell at a glance which stage is paused for their
 * input vs which is actively burning tokens.
 */
export function StatusPill({ status, label }: Props) {
  const style: Record<PillStatus, string> = {
    disabled: "bg-slate-100 text-slate-500",
    queued: "bg-slate-100 text-slate-600",
    running: "bg-amber-100 text-amber-800",
    awaiting_clarification: "bg-amber-100 text-amber-900 border border-amber-300",
    awaiting_approval: "bg-indigo-100 text-indigo-900 border border-indigo-300",
    done: "bg-emerald-100 text-emerald-800",
    error: "bg-rose-100 text-rose-800",
    skipped: "bg-slate-100 text-slate-500 italic",
  };
  const defaultLabel: Record<PillStatus, string> = {
    disabled: "off",
    queued: "queued",
    running: "running",
    awaiting_clarification: "needs answer",
    awaiting_approval: "needs approval",
    done: "done",
    error: "error",
    skipped: "n/a",
  };
  return (
    <span
      data-testid="status-pill"
      data-status={status}
      className={clsx(
        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1",
        style[status],
      )}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
      {(status === "awaiting_clarification" || status === "awaiting_approval") && (
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
      )}
      {label ?? defaultLabel[status]}
    </span>
  );
}
