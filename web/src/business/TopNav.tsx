import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Tab } from "../connector";

/**
 * Two-level top navigation:
 *   - Level 1 (always visible): Dashboard, Help (opens a dropdown).
 *   - Help dropdown: My Team, Settings, How it works.
 *   - A "+ New" button sits on the right for quick idea entry from anywhere.
 *
 * Session-scoped sub-tabs (Refinement / Pipeline / Documents) live inside
 * `SessionShell`, not here — the top nav stays constant regardless of the
 * session context so the two hierarchies never fight for space.
 */

interface HelpItem {
  id: Extract<Tab, "help-team" | "help-settings" | "help-how-it-works">;
  label: string;
}

const HELP_ITEMS: HelpItem[] = [
  { id: "help-team", label: "My Team" },
  { id: "help-settings", label: "Settings" },
  { id: "help-how-it-works", label: "How it works" },
];

interface Props {
  tab: Tab;
  onSelectTab: (t: Tab) => void;
  /** `true` when a session is currently loaded — used to decide whether the
   *  "Session" breadcrumb should be shown in the header. */
  hasSession: boolean;
  /** `true` when the session pipeline is actively running (streaming). */
  running: boolean;
  /** `true` while the Analyst is running a refinement round. */
  refining: boolean;
  /** `true` when the Cursor SDK reports as connected. */
  sdkConnected: boolean;
}

export function TopNav({
  tab,
  onSelectTab,
  hasSession,
  running,
  refining,
  sdkConnected,
}: Props) {
  const isHelpTab =
    tab === "help-team" || tab === "help-settings" || tab === "help-how-it-works";
  const isSessionTab = tab.startsWith("session-");

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => onSelectTab("dashboard")}
          className="flex items-center gap-2 group"
          title="Chem AI — Dashboard"
        >
          <Logo />
          <div className="leading-tight text-left">
            <div className="font-display font-semibold text-slate-900">Chem AI</div>
            <div className="text-[11px] text-slate-500 -mt-0.5">
              A factory idea in. A market-research pack out.
            </div>
          </div>
        </button>

        <nav
          className="flex items-center gap-1 ml-4 flex-1"
          aria-label="Primary"
        >
          <TopTabButton
            active={tab === "dashboard"}
            onClick={() => onSelectTab("dashboard")}
            label="Dashboard"
            pulse={running || refining}
          />
          <HelpMenu
            active={isHelpTab}
            currentTab={tab}
            onSelect={(id) => onSelectTab(id)}
          />
          {isSessionTab && hasSession && (
            <span
              className="ml-3 text-xs text-slate-500 hidden md:inline-flex items-center gap-2"
              aria-label="Current section"
            >
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-medium">Session</span>
            </span>
          )}
        </nav>

        <button
          onClick={() => onSelectTab("new-idea")}
          className="btn btn-primary text-sm hidden sm:inline-flex"
          data-testid="topnav-new-idea"
          title="Start a new idea"
        >
          + New
        </button>

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

/** A single top-level tab button. Extracted so styling stays consistent
 *  between Dashboard and the Help trigger. */
function TopTabButton({
  active,
  onClick,
  label,
  pulse,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  pulse?: boolean;
} & Partial<React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx("tab", active && "tab-active")}
      {...rest}
    >
      {label}
      {pulse && (
        <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
    </button>
  );
}

/**
 * The "Help" dropdown. Behaves like a menubar item:
 *   - Click to open, click again (or click outside, or press Esc) to close.
 *   - Selecting an item closes the menu and dispatches `onSelect`.
 *   - Focus is not trapped — this is a simple menu, not a modal. Keyboard
 *     users can Tab through the items naturally.
 *
 * Rolled by hand rather than pulled from a library so we avoid the
 * bundle weight (radix-ui, headless-ui, etc.) for a single dropdown.
 */
function HelpMenu({
  active,
  currentTab,
  onSelect,
}: {
  active: boolean;
  currentTab: Tab;
  onSelect: (id: HelpItem["id"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        className={clsx("tab flex items-center gap-1", active && "tab-active")}
        data-testid="topnav-help"
      >
        Help
        <span
          className={clsx(
            "text-[10px] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+4px)] min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-40"
        >
          {HELP_ITEMS.map((item) => {
            const isCurrent = item.id === currentTab;
            return (
              <button
                key={item.id}
                role="menuitem"
                className={clsx(
                  "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50",
                  isCurrent && "bg-slate-100 text-slate-900 font-medium",
                )}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.id);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <rect width="40" height="40" rx="10" fill="#0f172a" />
      <rect x="10" y="10" width="16" height="20" rx="2" fill="#14b8a6" />
      <rect x="14" y="12" width="16" height="20" rx="2" fill="#6366f1" opacity="0.9" />
      <rect x="18" y="14" width="16" height="20" rx="2" fill="#f59e0b" opacity="0.85" />
    </svg>
  );
}
