import clsx from "clsx";
import type { Tab } from "../connector";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "new", label: "New Idea" },
  { id: "refine", label: "Refine" },
  { id: "pipeline", label: "Pipeline" },
  { id: "docs", label: "Documents" },
  { id: "specialists", label: "Specialists" },
  { id: "history", label: "History" },
];

interface Props {
  tab: Tab;
  onSelectTab: (t: Tab) => void;
  hasSession: boolean;
  hasRefinedIdea: boolean;
  running: boolean;
  refining: boolean;
  sdkConnected: boolean;
}

/**
 * Business component: sticky top-nav. Prop-driven so the container decides
 * which store slices to pass in — makes the nav testable without a store mock.
 */
export function TopNav({
  tab,
  onSelectTab,
  hasSession,
  hasRefinedIdea,
  running,
  refining,
  sdkConnected,
}: Props) {
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-6">
        <button
          onClick={() => onSelectTab("new")}
          className="flex items-center gap-2 group"
          title="Market Research Group"
        >
          <Logo />
          <div className="leading-tight text-left">
            <div className="font-display font-semibold text-slate-900">
              Market Research Group
            </div>
            <div className="text-[11px] text-slate-500 -mt-0.5">
              A factory idea in. A market-research pack out.
            </div>
          </div>
        </button>

        <nav className="flex items-center gap-1 ml-4 flex-1 flex-wrap" aria-label="Primary">
          {TABS.map((t) => {
            const disabled =
              (t.id === "refine" && !hasSession) ||
              (t.id === "pipeline" && !hasSession) ||
              (t.id === "docs" && !hasRefinedIdea);
            return (
              <button
                key={t.id}
                onClick={() => onSelectTab(t.id)}
                disabled={disabled}
                aria-current={tab === t.id ? "page" : undefined}
                className={clsx(
                  "tab",
                  tab === t.id && "tab-active",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
                )}
              >
                {t.label}
                {t.id === "pipeline" && running && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
                {t.id === "refine" && refining && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="text-xs text-slate-500 hidden sm:block">
          {sdkConnected ? (
            <span className="text-emerald-600" data-testid="sdk-status">
              ● SDK connected
            </span>
          ) : (
            <span className="text-amber-600" data-testid="sdk-status">
              ● SDK key missing
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <rect width="40" height="40" rx="10" fill="#0f172a" />
      <rect x="10" y="10" width="16" height="20" rx="2" fill="#14b8a6" />
      <rect x="14" y="12" width="16" height="20" rx="2" fill="#6366f1" opacity="0.9" />
      <rect x="18" y="14" width="16" height="20" rx="2" fill="#f59e0b" opacity="0.85" />
    </svg>
  );
}
