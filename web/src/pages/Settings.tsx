import { useGenSettings, useConnectorActions } from "../connector";
import type { TerminationPolicy } from "../connector";

/**
 * Global run-time settings for every new session. Persisted to
 * `localStorage` via `connector/settings.ts`; changing these only affects
 * future sessions (existing sessions carry their own snapshot).
 *
 * Historically these lived on the "My Team" page next to the specialist
 * roster, but they're conceptually orthogonal to who's on the team, and
 * they gained a third knob (termination policy) that deserves its own
 * home with room to explain each option.
 */
export function SettingsPage() {
  const genSettings = useGenSettings();
  const { updateGenSettings, resetGenSettings } = useConnectorActions();
  const policy: TerminationPolicy =
    genSettings.terminationPolicy ?? "threshold_or_max";

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-slate-900">Settings</h1>
          <p className="text-slate-600 mt-1">
            How every specialist department should run its debate. Applied to{" "}
            <span className="font-semibold">new sessions only</span> — sessions already
            in flight keep the settings they were started with.
          </p>
        </div>
        <button
          className="text-xs text-slate-500 hover:text-slate-800 underline shrink-0"
          onClick={() => {
            if (confirm("Reset settings to defaults?")) resetGenSettings();
          }}
        >
          Reset to defaults
        </button>
      </div>

      <section className="card p-5 space-y-6">
        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-sm font-semibold text-slate-900">
              Agreement threshold
            </label>
            <span className="text-sm font-mono text-slate-700">
              {genSettings.threshold}%
            </span>
          </div>
          <input
            type="range"
            min={50}
            max={100}
            step={1}
            value={genSettings.threshold}
            onChange={(e) => updateGenSettings({ threshold: Number(e.target.value) })}
            className="w-full mt-1 accent-indigo-600"
            aria-label="Agreement threshold"
          />
          <p className="text-xs text-slate-500 mt-1">
            How aligned every member's revised draft must be with their teammates'
            latest drafts before the department can move on. Default 95%.
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-sm font-semibold text-slate-900">Max rounds</label>
            <span className="text-sm font-mono text-slate-700">
              {genSettings.maxRounds}
            </span>
          </div>
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={genSettings.maxRounds}
            onChange={(e) => updateGenSettings({ maxRounds: Number(e.target.value) })}
            className="w-full mt-1 accent-indigo-600"
            aria-label="Max rounds"
          />
          <p className="text-xs text-slate-500 mt-1">
            Upper bound on debate rounds per department. Ignored when the
            termination policy is <em>Run until threshold</em>. Default 4.
          </p>
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <div>
          <h2 className="font-display text-lg text-slate-900">Termination policy</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Controls how the debate loop combines the threshold and max-rounds knobs
            above. Pick the mode that matches how you'd rather trade off quality
            versus cost.
          </p>
        </div>
        <div className="space-y-2">
          <PolicyOption
            id="threshold_or_max"
            active={policy === "threshold_or_max"}
            title="Stop at threshold or max rounds (default)"
            description="Stop as soon as either condition is met, whichever comes first. Fast when the team converges early; still bounded when it doesn't. Recommended for most runs."
            onSelect={() => updateGenSettings({ terminationPolicy: "threshold_or_max" })}
          />
          <PolicyOption
            id="max_only"
            active={policy === "max_only"}
            title="Always run max rounds (ignore threshold)"
            description="Debate always runs the full number of rounds, even after early convergence. Useful when you want a deeper debate trail or explicit final-round dissent. Uses the most credits."
            onSelect={() => updateGenSettings({ terminationPolicy: "max_only" })}
          />
          <PolicyOption
            id="threshold_only"
            active={policy === "threshold_only"}
            title="Run until threshold (no round cap)"
            description="Keep debating until every member's self-scored agreement crosses the threshold — max rounds is ignored (a hard safety cap of 20 rounds still applies to prevent runaway spend). Highest quality on convergent problems; risky when the threshold is too high to reach."
            onSelect={() => updateGenSettings({ terminationPolicy: "threshold_only" })}
          />
        </div>
      </section>

      <section className="card p-5 bg-slate-50">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
          Current settings summary
        </div>
        <ul className="text-sm text-slate-700 space-y-1">
          <li>
            <span className="font-mono text-slate-500">threshold</span>{" "}
            <span className="font-mono">{genSettings.threshold}%</span>
          </li>
          <li>
            <span className="font-mono text-slate-500">maxRounds</span>{" "}
            <span className="font-mono">{genSettings.maxRounds}</span>
          </li>
          <li>
            <span className="font-mono text-slate-500">terminationPolicy</span>{" "}
            <span className="font-mono">{policy}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function PolicyOption({
  id,
  active,
  title,
  description,
  onSelect,
}: {
  id: TerminationPolicy;
  active: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={
        "w-full text-left p-3 rounded-lg border-2 transition-colors " +
        (active
          ? "border-indigo-500 bg-indigo-50"
          : "border-slate-200 bg-white hover:border-slate-400")
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            "mt-1 inline-block w-4 h-4 rounded-full border-2 shrink-0 " +
            (active
              ? "border-indigo-600 bg-indigo-600 ring-2 ring-indigo-200"
              : "border-slate-400 bg-white")
          }
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-600 mt-0.5">{description}</div>
          <div className="text-[10px] font-mono text-slate-400 mt-1">{id}</div>
        </div>
      </div>
    </button>
  );
}
