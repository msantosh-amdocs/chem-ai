interface Props {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
}

/**
 * Sandbox primitive: circular 0-100 completeness dial. Colour bands:
 * red < 60 < amber < 85 < emerald.
 */
export function CompletenessDial({
  value,
  size = 74,
  stroke = 8,
  label = "Completeness",
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  const color = clamped >= 85 ? "#059669" : clamped >= 60 ? "#d97706" : "#dc2626";

  return (
    <div className="flex flex-col items-center shrink-0" data-testid="completeness-dial">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 400ms ease" }}
            data-testid="completeness-dial-fill"
            data-band={clamped >= 85 ? "good" : clamped >= 60 ? "warn" : "bad"}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-lg font-semibold" style={{ color }}>
            {clamped}
          </div>
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
    </div>
  );
}
