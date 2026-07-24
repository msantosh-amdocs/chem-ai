import clsx from "clsx";

export type PillStatus =
  | "disabled"
  | "queued"
  | "running"
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
 */
export function StatusPill({ status, label }: Props) {
  const style = {
    disabled: "bg-slate-100 text-slate-500",
    queued: "bg-slate-100 text-slate-600",
    running: "bg-amber-100 text-amber-800",
    done: "bg-emerald-100 text-emerald-800",
    error: "bg-rose-100 text-rose-800",
    skipped: "bg-slate-100 text-slate-500 italic",
  }[status];
  const defaultLabel = {
    disabled: "off",
    queued: "queued",
    running: "running",
    done: "done",
    error: "error",
    skipped: "n/a",
  }[status];
  return (
    <span
      data-testid="status-pill"
      data-status={status}
      className={clsx(
        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1",
        style,
      )}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
      {label ?? defaultLabel}
    </span>
  );
}
