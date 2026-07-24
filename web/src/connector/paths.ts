/**
 * Tab ↔ URL path mapping — the single source of truth for the
 * app's routing. Kept intentionally simple so we don't need to pull in
 * `react-router-dom` for a single-level top-nav.
 *
 * URL slugs favour readability over strict `Tab`-id parity: e.g. the
 * internal `docs` tab is exposed as `/documents`, and `specialists`
 * (labelled "My Team" in the UI) becomes `/team`. Slugs are all lower
 * case, hyphen-separated, and never contain trailing slashes.
 */

import type { Tab } from "./store";

/** Human-facing path for each tab. Include the leading `/`. */
export const TAB_TO_PATH: Record<Tab, string> = {
  new: "/new",
  refine: "/refine",
  pipeline: "/pipeline",
  docs: "/documents",
  specialists: "/team",
  settings: "/settings",
  history: "/history",
  help: "/how-it-works",
};

/** Reverse lookup: pathname → Tab. Built from `TAB_TO_PATH` so the two
 *  never drift. */
export const PATH_TO_TAB: Readonly<Record<string, Tab>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(TAB_TO_PATH) as Array<[Tab, string]>).map(([tab, path]) => [
      path,
      tab,
    ]),
  ),
);

/** Fallback tab used when the URL doesn't match any known route (root,
 *  bookmarks of removed tabs, typos, etc.). */
export const DEFAULT_TAB: Tab = "new";

/**
 * Resolve a browser pathname to a `Tab`.
 *
 * Behaviour:
 *   - `/` (root) or an empty string → `DEFAULT_TAB`
 *   - trailing slash is tolerated (`/refine/` → `refine`)
 *   - case-insensitive match (`/Refine` → `refine`)
 *   - unknown paths → `DEFAULT_TAB` (caller can decide to bounce the URL)
 */
export function pathToTab(pathname: string): Tab {
  const cleaned =
    (pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
  if (cleaned === "/") return DEFAULT_TAB;
  return PATH_TO_TAB[cleaned] ?? DEFAULT_TAB;
}

/** Reverse: return the canonical pathname for a given tab. */
export function tabToPath(tab: Tab): string {
  return TAB_TO_PATH[tab];
}

/**
 * `true` when the caller's pathname already matches the tab's canonical
 * form (including root ↔ default handling). Used by the routing hook to
 * decide whether it needs to `pushState`, avoiding redundant history
 * entries when the store re-fires the same tab.
 */
export function pathMatchesTab(pathname: string, tab: Tab): boolean {
  return pathToTab(pathname) === tab;
}
