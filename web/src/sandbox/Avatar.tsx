import clsx from "clsx";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  name: string;
  portraitId?: string;
  solidClass?: string;
  ringClass?: string;
  size?: AvatarSize;
  ring?: boolean;
  className?: string;
}

const SIZE: Record<AvatarSize, string> = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

/**
 * Sandbox primitive: circular avatar with hand-drawn portraits for known
 * `portraitId` values and an initials fallback for everyone else.
 * Pure presentational — no domain knowledge, no store, no side effects.
 */
export function Avatar({
  name,
  portraitId,
  solidClass = "bg-slate-500",
  ringClass = "ring-slate-200",
  size = "md",
  ring,
  className,
}: AvatarProps) {
  return (
    <div
      data-testid="avatar"
      data-portrait={portraitId ?? "initials"}
      className={clsx(
        SIZE[size],
        "rounded-full overflow-hidden shrink-0 shadow-sm",
        ring && `ring-4 ${ringClass}`,
        className,
      )}
      title={name}
    >
      {renderPortrait(portraitId, name, solidClass)}
    </div>
  );
}

function renderPortrait(portraitId: string | undefined, name: string, solid: string) {
  switch (portraitId) {
    case "rohan":
      return <RohanPortrait />;
    case "priya":
      return <PriyaPortrait />;
    case "meera":
      return <MeeraPortrait />;
    case "arjun":
      return <ArjunPortrait />;
    case "vikram":
      return <VikramPortrait />;
    case "kavya":
      return <KavyaPortrait />;
    default:
      return <InitialsPortrait name={name} solidClass={solid} />;
  }
}

function Portrait({
  bg,
  bg2,
  jacket,
  skin,
  children,
}: {
  bg: string;
  bg2: string;
  jacket: string;
  skin: string;
  children: React.ReactNode;
}) {
  return (
    <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id={`bg-${bg}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={bg} />
          <stop offset="1" stopColor={bg2} />
        </linearGradient>
        <radialGradient id={`skin-${skin}`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor={lighten(skin)} />
          <stop offset="1" stopColor={skin} />
        </radialGradient>
      </defs>
      <rect width="96" height="96" fill={`url(#bg-${bg})`} />
      <path d="M8 96 C 16 74, 34 66, 48 66 C 62 66, 80 74, 88 96 Z" fill={jacket} />
      <rect x="42" y="58" width="12" height="10" rx="2" fill={skin} opacity="0.85" />
      <ellipse cx="48" cy="42" rx="18" ry="22" fill={`url(#skin-${skin})`} />
      {children}
    </svg>
  );
}

function lighten(hex: string): string {
  return hex === "#d19669"
    ? "#f4c9a0"
    : hex === "#d9a878"
      ? "#f7d9b8"
      : hex === "#c68b62"
        ? "#efc9a5"
        : hex === "#b47b52"
          ? "#e5b78e"
          : "#f0d5b5";
}

function RohanPortrait() {
  return (
    <Portrait bg="#eef2ff" bg2="#c7d2fe" jacket="#1e1b4b" skin="#d9a878">
      <path
        d="M32 34 C 32 20, 44 16, 48 16 C 52 16, 64 20, 64 34 C 60 30, 56 30, 48 30 C 40 30, 36 30, 32 34 Z"
        fill="#111827"
      />
      <circle cx="41" cy="45" r="5" fill="none" stroke="#111827" strokeWidth="1.5" />
      <circle cx="55" cy="45" r="5" fill="none" stroke="#111827" strokeWidth="1.5" />
      <line x1="46" y1="45" x2="50" y2="45" stroke="#111827" strokeWidth="1.5" />
      <circle cx="41" cy="45" r="1.4" fill="#111827" />
      <circle cx="55" cy="45" r="1.4" fill="#111827" />
      <path d="M48 47 L 46 54 L 49 55" stroke="#8b6b48" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M44 59 Q 48 60, 52 59" stroke="#5b3a2a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </Portrait>
  );
}

function PriyaPortrait() {
  return (
    <Portrait bg="#ecfdf5" bg2="#a7f3d0" jacket="#065f46" skin="#d19669">
      <path
        d="M28 34 C 28 18, 40 12, 48 12 C 56 12, 68 18, 68 36 L 66 46 C 63 40, 58 38, 48 38 C 38 38, 33 40, 30 46 L 28 34 Z"
        fill="#1f2937"
      />
      <path d="M28 34 C 26 44, 28 52, 30 56" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M68 34 C 70 44, 68 52, 66 56" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="48" r="1.5" fill="#065f46" />
      <circle cx="66" cy="48" r="1.5" fill="#065f46" />
      <path d="M38 41 Q 42 39, 46 41" stroke="#1f2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M50 41 Q 54 39, 58 41" stroke="#1f2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="45" r="1.6" fill="#111827" />
      <circle cx="54" cy="45" r="1.6" fill="#111827" />
      <path d="M48 47 L 46 54 L 49 55" stroke="#8b5a37" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M44 60 Q 48 62, 52 60" stroke="#a30a4a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </Portrait>
  );
}

function MeeraPortrait() {
  return (
    <Portrait bg="#fffbeb" bg2="#fde68a" jacket="#b45309" skin="#c68b62">
      <path
        d="M24 44 C 22 26, 34 12, 48 12 C 62 12, 74 26, 72 44 L 68 60 C 64 46, 58 38, 48 38 C 38 38, 32 46, 28 60 L 24 44 Z"
        fill="#3f2513"
      />
      <path d="M26 44 L 22 74" stroke="#3f2513" strokeWidth="4" strokeLinecap="round" />
      <path d="M70 44 L 74 74" stroke="#3f2513" strokeWidth="4" strokeLinecap="round" />
      <path d="M38 41 Q 42 38, 46 41" stroke="#3f2513" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <path d="M50 41 Q 54 38, 58 41" stroke="#3f2513" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="45" r="1.7" fill="#3f2513" />
      <circle cx="54" cy="45" r="1.7" fill="#3f2513" />
      <path d="M48 47 L 46 54 L 50 54" stroke="#8b5a37" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M43 60 L 53 60" stroke="#3f2513" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="48" cy="30" r="1.4" fill="#b91c1c" />
    </Portrait>
  );
}

function ArjunPortrait() {
  return (
    <Portrait bg="#ecfeff" bg2="#a5f3fc" jacket="#155e75" skin="#d9a878">
      <path
        d="M32 36 C 30 22, 44 14, 48 14 C 56 14, 66 22, 66 36 C 60 30, 54 30, 50 34 C 46 30, 40 32, 32 36 Z"
        fill="#0f172a"
      />
      <rect x="36" y="41" width="10" height="7" rx="1" fill="none" stroke="#0f172a" strokeWidth="1.4" />
      <rect x="50" y="41" width="10" height="7" rx="1" fill="none" stroke="#0f172a" strokeWidth="1.4" />
      <line x1="46" y1="44" x2="50" y2="44" stroke="#0f172a" strokeWidth="1.4" />
      <circle cx="41" cy="44.5" r="1.3" fill="#0f172a" />
      <circle cx="55" cy="44.5" r="1.3" fill="#0f172a" />
      <path d="M48 48 L 46 54 L 49 55" stroke="#8b6b48" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M44 60 Q 48 61, 52 60" stroke="#4b3a2a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </Portrait>
  );
}

function VikramPortrait() {
  return (
    <Portrait bg="#faf5ff" bg2="#ddd6fe" jacket="#4c1d95" skin="#b47b52">
      <path
        d="M30 34 C 30 20, 42 14, 48 14 C 54 14, 66 20, 66 34 C 60 30, 54 30, 48 30 C 42 30, 36 30, 30 34 Z"
        fill="#0f0a1e"
      />
      <path
        d="M34 52 C 36 62, 42 66, 48 66 C 54 66, 60 62, 62 52 C 58 56, 54 58, 48 58 C 42 58, 38 56, 34 52 Z"
        fill="#0f0a1e"
      />
      <path d="M38 41 Q 42 39, 46 41" stroke="#0f0a1e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M50 41 Q 54 39, 58 41" stroke="#0f0a1e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="45" r="1.6" fill="#0f0a1e" />
      <circle cx="54" cy="45" r="1.6" fill="#0f0a1e" />
      <path d="M48 47 L 46 53 L 49 54" stroke="#7b4a2a" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M44 55 Q 48 57, 52 55" stroke="#0f0a1e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </Portrait>
  );
}

function KavyaPortrait() {
  return (
    <Portrait bg="#fff1f2" bg2="#fecdd3" jacket="#881337" skin="#d19669">
      <path
        d="M30 34 C 30 18, 42 12, 48 12 C 54 12, 66 18, 66 34 C 62 32, 58 32, 48 32 C 38 32, 34 32, 30 34 Z"
        fill="#1f0d14"
      />
      <path d="M64 32 C 74 38, 76 54, 70 62" stroke="#1f0d14" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M38 41 Q 42 39, 46 41" stroke="#1f0d14" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M50 41 Q 54 39, 58 41" stroke="#1f0d14" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="45" r="1.6" fill="#1f0d14" />
      <circle cx="54" cy="45" r="1.6" fill="#1f0d14" />
      <path d="M48 47 L 46 54 L 49 55" stroke="#8b5a37" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M43 60 Q 48 62, 53 60" stroke="#881337" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </Portrait>
  );
}

function InitialsPortrait({ name, solidClass }: { name: string; solidClass: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s[0]!.toUpperCase())
      .slice(0, 2)
      .join("") || "?";
  return (
    <div
      data-testid="avatar-initials"
      className={clsx(
        "w-full h-full flex items-center justify-center text-white font-display font-semibold",
        solidClass,
      )}
      style={{ fontSize: initials.length === 1 ? "1.35em" : "0.95em" }}
    >
      {initials}
    </div>
  );
}
