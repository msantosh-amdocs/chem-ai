import { useMemo } from "react";
import clsx from "clsx";
import { Avatar } from "../sandbox";
import { ACCENT_PALETTES, type SpecialistPersona } from "../connector/personas";
import type { SdkModel } from "../connector/types";

const AVATAR_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "initials", label: "Initials" },
  { id: "rohan", label: "Rohan" },
  { id: "priya", label: "Priya" },
  { id: "meera", label: "Meera" },
  { id: "arjun", label: "Arjun" },
  { id: "vikram", label: "Vikram" },
  { id: "kavya", label: "Kavya" },
];

interface Props {
  persona: SpecialistPersona;
  models: SdkModel[];
  onChange: (patch: Partial<SpecialistPersona>) => void;
  onRemove?: () => void;
  removable?: boolean;
  roleLabel: string;
}

/**
 * Business component: full editor for a SpecialistPersona. Prop-driven — the
 * caller (page/container) owns state and persistence.
 */
export function SpecialistEditor({
  persona,
  models,
  onChange,
  onRemove,
  removable,
  roleLabel,
}: Props) {
  const selectedModel = models.find((m) => m.id === persona.model);
  const paramDefs = useMemo(() => selectedModel?.parameters ?? [], [selectedModel]);

  const groupedModels = useMemo(() => {
    const map = new Map<string, SdkModel[]>();
    for (const m of models) {
      const fam = modelFamily(m.id);
      const arr = map.get(fam) ?? [];
      arr.push(m);
      map.set(fam, arr);
    }
    const order = ["claude", "gpt", "gemini", "grok", "composer", "other"];
    return Array.from(map.entries()).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [models]);

  return (
    <div className={`card p-5 border-t-4 ${persona.accent.border.replace("border-", "border-t-")}`}>
      <div className="flex items-start gap-4">
        <Avatar
          name={persona.name}
          portraitId={persona.avatarId}
          solidClass={persona.accent.solid}
          ringClass={persona.accent.ring}
          size="xl"
          ring
        />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>{roleLabel}</span>
            {removable && onRemove && (
              <button
                className="text-rose-500 hover:text-rose-700 text-xs normal-case font-medium"
                onClick={() => {
                  if (confirm(`Remove ${persona.name}? You'll skip their artifact in the next run.`))
                    onRemove();
                }}
                title="Remove this specialist"
              >
                Remove
              </button>
            )}
          </div>
          <input
            className={`w-full text-2xl font-display font-semibold bg-transparent border-none outline-none px-0 py-0 focus:ring-0 ${persona.accent.text}`}
            value={persona.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Specialist name"
            aria-label="Specialist name"
          />
          <input
            className="w-full text-sm text-slate-600 italic bg-transparent border-none outline-none px-0 py-0 focus:ring-0"
            value={persona.tagline}
            onChange={(e) => onChange({ tagline: e.target.value })}
            placeholder="Short tagline"
            aria-label="Specialist tagline"
          />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Avatar">
          <div className="flex flex-wrap gap-2">
            {AVATAR_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onChange({ avatarId: id })}
                className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${
                  persona.avatarId === id
                    ? `${persona.accent.border} ring-2 ${persona.accent.ring}`
                    : "border-slate-200 hover:border-slate-400"
                }`}
                title={label}
                aria-label={`Use ${label} avatar`}
              >
                <Avatar
                  name={persona.name}
                  portraitId={id}
                  solidClass={persona.accent.solid}
                  ringClass={persona.accent.ring}
                  size="md"
                />
              </button>
            ))}
          </div>
        </Field>

        <Field label="Accent color">
          <div className="flex flex-wrap gap-1.5">
            {ACCENT_PALETTES.map((p) => {
              const active = persona.accent.solid === p.accent.solid;
              return (
                <button
                  key={p.id}
                  onClick={() => onChange({ accent: p.accent })}
                  className={clsx(
                    "w-8 h-8 rounded-full transition-transform",
                    p.accent.solid,
                    active ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "hover:scale-105",
                  )}
                  title={p.label}
                  aria-label={`Accent ${p.label}`}
                />
              );
            })}
          </div>
        </Field>

        <Field label="Model">
          <select
            className="field font-mono text-xs"
            value={persona.model}
            onChange={(e) => onChange({ model: e.target.value, params: {} })}
            aria-label="Model"
          >
            {!selectedModel && (
              <option value={persona.model}>{persona.model} (custom)</option>
            )}
            {groupedModels.map(([family, list]) => (
              <optgroup key={family} label={familyLabel(family)}>
                {list.map((m) => (
                  <option key={m.id} value={m.id} title={m.description}>
                    {m.displayName ? `${m.displayName} — ${m.id}` : m.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedModel?.description && (
            <p className="text-xs text-slate-500 mt-1">{selectedModel.description}</p>
          )}
        </Field>

        {paramDefs.length > 0 ? (
          <Field label="Model parameters">
            <div className="grid grid-cols-2 gap-2">
              {paramDefs.map((p) => (
                <div key={p.id}>
                  <label className="text-[11px] text-slate-500 mb-0.5 block">
                    {p.displayName ?? p.id}
                  </label>
                  <select
                    className="field text-xs"
                    value={persona.params[p.id] ?? ""}
                    onChange={(e) => {
                      const next = { ...persona.params };
                      if (e.target.value) next[p.id] = e.target.value;
                      else delete next[p.id];
                      onChange({ params: next });
                    }}
                  >
                    <option value="">(default)</option>
                    {p.values.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.displayName ?? v.value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Field>
        ) : (
          <p className="text-xs text-slate-500">
            {selectedModel
              ? "This model exposes no tunable parameters."
              : "Select a listed model to see its parameters."}
          </p>
        )}

        <Field label="Role description">
          <textarea
            className="field text-sm min-h-[100px] resize-y"
            value={persona.roleDescription}
            onChange={(e) => onChange({ roleDescription: e.target.value })}
            aria-label="Role description"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Injected into the system prompt.
          </p>
        </Field>

        <Field label="Voice & tone">
          <textarea
            className="field text-sm min-h-[90px] resize-y"
            value={persona.tone}
            onChange={(e) => onChange({ tone: e.target.value })}
            aria-label="Voice and tone"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function modelFamily(id: string): string {
  if (id.startsWith("claude")) return "claude";
  if (id.startsWith("gpt")) return "gpt";
  if (id.startsWith("gemini")) return "gemini";
  if (id.startsWith("grok")) return "grok";
  if (id.startsWith("composer")) return "composer";
  return "other";
}

function familyLabel(fam: string): string {
  return (
    {
      claude: "Claude (Anthropic)",
      gpt: "GPT (OpenAI)",
      gemini: "Gemini (Google)",
      grok: "Grok (xAI)",
      composer: "Composer (Cursor)",
      other: "Other",
    }[fam] ?? fam
  );
}
