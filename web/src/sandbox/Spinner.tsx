/**
 * Sandbox primitive: tiny spinning loader.
 */
export function Spinner() {
  return (
    <div
      data-testid="spinner"
      className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin"
    />
  );
}
