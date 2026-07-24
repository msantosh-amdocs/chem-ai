import clsx from "clsx";
import type { PropsWithChildren } from "react";
import {
  useConnectorActions,
  useCurrentSession,
  useLive,
  useTab,
  type SessionStatus,
  type Tab,
} from "../connector";

/**
 * Chrome that wraps a session-scoped page (Refinement / Pipeline /
 * Documents):
 *
 *   ┌─ SessionShell ────────────────────────────────────────────┐
 *   │  ← Back to Dashboard   <Session title>       <status pill>│
 *   │  Refinement | Pipeline | Documents                         │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  <page-specific body — passed as children>                 │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The three sub-tabs are ALL WAYS enabled once a session exists — the
 * pages themselves handle the "not applicable yet" empty states (e.g.
 * Documents shows a "pipeline still running…" message before the
 * artifacts land). This keeps the URL round-trip predictable: any
 * bookmark of `/session/:id/refine` opens on refinement, regardless
 * of where the run is in its lifecycle.
 */

interface SessionSubTab {
  id: Extract<Tab, "session-refine" | "session-pipeline" | "session-documents">;
  label: string;
}

const SUB_TABS: SessionSubTab[] = [
  { id: "session-refine", label: "Refinement" },
  { id: "session-pipeline", label: "Pipeline" },
  { id: "session-documents", label: "Documents" },
];

export function SessionShell({ children }: PropsWithChildren) {
  const session = useCurrentSession();
  const live = useLive();
  const { setTab } = useConnectorActions();

  // While a deep link is still fetching, the URL says `/session/:id/…`
  // but `currentSession` isn't populated yet. Render a placeholder
  // rather than the raw child so pages don't flash their empty state.
  if (!session) {
    return (
      <div className="max-w-[900px] mx-auto py-16 text-center text-slate-500">
        Loading session…
      </div>
    );
  }

  // The `tab` isn't reactively read here — the parent decides which
  // child to render. We only need the active id for the sub-nav
  // active-state highlighting, which is derived from the store hook
  // inside `<SessionShellNav>` below.
  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <SessionShellHeader />
      <SessionShellNav
        running={live.running}
        refining={live.refining}
        onSelect={(t) => setTab(t)}
      />
      <div>{children}</div>
    </div>
  );
}

function SessionShellHeader() {
  const session = useCurrentSession()!; // guarded upstream
  const { setTab } = useConnectorActions();

  return (
    <div className="flex items-start justify-between gap-3 flex-wrap border-b border-slate-200 pb-3">
      <div className="min-w-0">
        <button
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
          onClick={() => setTab("dashboard")}
          data-testid="session-back-to-dashboard"
        >
          <span aria-hidden>←</span> Back to Dashboard
        </button>
        <h1 className="font-display text-2xl text-slate-900 mt-1 truncate max-w-[80ch]">
          {session.title || "Untitled session"}
        </h1>
        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{new Date(session.createdAt).toLocaleString()}</span>
          <StatusPill status={session.status} />
        </div>
      </div>
    </div>
  );
}

function SessionShellNav({
  running,
  refining,
  onSelect,
}: {
  running: boolean;
  refining: boolean;
  onSelect: (t: SessionSubTab["id"]) => void;
}) {
  // We read the active tab reactively so this component re-renders when
  // the store flips (e.g. auto-nav after `concept.started`).
  const active = useCurrentSubTab();
  return (
    <nav
      className="flex items-center gap-1 border-b border-slate-200 -mt-2"
      aria-label="Session"
    >
      {SUB_TABS.map((s) => {
        const isActive = s.id === active;
        const pulse =
          (s.id === "session-refine" && refining) ||
          (s.id === "session-pipeline" && running);
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            aria-current={isActive ? "page" : undefined}
            data-testid={`session-nav-${s.id}`}
            className={clsx(
              "px-3 py-2 text-sm rounded-t-md border-b-2 transition-colors",
              isActive
                ? "border-indigo-500 text-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {s.label}
            {pulse && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse align-middle" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** Reactive helper — reads the store's `tab` only when we want a
 *  session sub-tab. Any other tab collapses to "session-refine" for
 *  the purpose of the sub-nav highlight (shouldn't happen in practice
 *  because App.tsx only renders SessionShell when tab starts with
 *  `session-`). */
function useCurrentSubTab(): SessionSubTab["id"] {
  const tab: Tab = useTab();
  if (
    tab === "session-refine" ||
    tab === "session-pipeline" ||
    tab === "session-documents"
  ) {
    return tab;
  }
  return "session-refine";
}

function StatusPill({ status }: { status: SessionStatus }) {
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
