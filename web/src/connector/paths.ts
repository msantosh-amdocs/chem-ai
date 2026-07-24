/**
 * Tab ↔ URL path mapping — the single source of truth for the
 * app's routing. Kept intentionally simple so we don't need to pull in
 * `react-router-dom` for a two-level top-nav.
 *
 * Layout:
 *   /                        → /dashboard  (canonical fallback)
 *   /dashboard               → Dashboard
 *   /new                     → New Idea
 *   /help/team               → My Team           (Help submenu)
 *   /help/settings           → Settings          (Help submenu)
 *   /help/how-it-works       → How it works      (Help submenu)
 *   /session/:id/refine      → Refinement sub-tab of a specific session
 *   /session/:id/pipeline    → Pipeline sub-tab of a specific session
 *   /session/:id/documents   → Documents sub-tab of a specific session
 *
 * The URL is the source of truth for the *tab*; the session's *content*
 * is separately owned by the store via `openSession(id)` — the routing
 * hook is responsible for calling `openSession` when the URL references
 * a session that isn't currently loaded.
 */

import type { Tab } from "./store";

/** Kind of URL a pathname resolves to. Sub-tabs of a session carry the
 *  session id alongside the tab so the URL sync can canonicalise back
 *  to the correct path. */
export type Route =
  | { kind: "static"; tab: StaticTab }
  | { kind: "session"; tab: SessionTab; sessionId: string };

/** Tabs that don't reference a session in the URL. */
export type StaticTab =
  | "dashboard"
  | "new-idea"
  | "help-team"
  | "help-settings"
  | "help-how-it-works";

/** Tabs that live under `/session/:id/…`. */
export type SessionTab =
  | "session-refine"
  | "session-pipeline"
  | "session-documents";

/** Sub-slug used inside `/session/:id/<sub>`. */
export type SessionSub = "refine" | "pipeline" | "documents";

/** Canonical path for each static tab. Always leading-slash, no trailing
 *  slash, lower-case, hyphen-separated. */
const STATIC_PATH: Record<StaticTab, string> = {
  dashboard: "/dashboard",
  "new-idea": "/new",
  "help-team": "/help/team",
  "help-settings": "/help/settings",
  "help-how-it-works": "/help/how-it-works",
};

/** Reverse lookup for static routes — built from `STATIC_PATH` so the
 *  two never drift. */
const PATH_TO_STATIC: Readonly<Record<string, StaticTab>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(STATIC_PATH) as Array<[StaticTab, string]>).map(
      ([tab, path]) => [path, tab],
    ),
  ),
);

/** Map between a session Tab and its short URL slug. */
const SESSION_SUB_TO_TAB: Record<SessionSub, SessionTab> = {
  refine: "session-refine",
  pipeline: "session-pipeline",
  documents: "session-documents",
};
const SESSION_TAB_TO_SUB: Record<SessionTab, SessionSub> = {
  "session-refine": "refine",
  "session-pipeline": "pipeline",
  "session-documents": "documents",
};

/** Tab used when no other tab is resolvable. */
export const DEFAULT_TAB: Tab = "dashboard";

/** Session-id regex — restrictive on purpose so that garbage like
 *  `/session/../foo/refine` can never match. Server-side ids are
 *  nanoid-shaped (letters, digits, `_`, `-`); we mirror that shape
 *  here and preserve case because ids are case-sensitive. */
const SESSION_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** Case-sensitive session route matcher — we can't lowercase the
 *  incoming path because that would destroy the session id. Static
 *  routes get case-insensitive matching separately. */
const SESSION_ROUTE_RE =
  /^\/session\/([A-Za-z0-9_-]+)\/(refine|pipeline|documents)$/;

/** Strip trailing slashes. Case is preserved so a session id like
 *  `Vkv9DW92Br…` survives the round-trip. Empty pathname → `/`. */
function stripTrailing(pathname: string): string {
  const trimmed = (pathname || "/").replace(/\/+$/, "");
  return trimmed || "/";
}

/**
 * Resolve a browser pathname to a `Route`.
 *
 *   - `/` or empty → dashboard
 *   - `/dashboard`, `/new`, `/help/*` → matching static route (case-insensitive)
 *   - `/session/:id/(refine|pipeline|documents)` → session route (id
 *     matched case-sensitively so the server can look it up verbatim)
 *   - anything else → dashboard (caller can decide to bounce)
 */
export function pathToRoute(pathname: string): Route {
  const cleaned = stripTrailing(pathname);
  if (cleaned === "/") return { kind: "static", tab: "dashboard" };

  // Session paths — matched first so that `/session/anything/…`
  // never falls through to the static lookup and gets the wrong
  // dashboard fallback silently.
  const sessionMatch = cleaned.match(SESSION_ROUTE_RE);
  if (sessionMatch) {
    const id = sessionMatch[1]!;
    const sub = sessionMatch[2] as SessionSub;
    if (SESSION_ID_RE.test(id)) {
      return { kind: "session", tab: SESSION_SUB_TO_TAB[sub], sessionId: id };
    }
  }

  const staticTab = PATH_TO_STATIC[cleaned.toLowerCase()];
  if (staticTab) return { kind: "static", tab: staticTab };

  return { kind: "static", tab: "dashboard" };
}

/** Reverse: canonical pathname for a `Route`. */
export function routeToPath(route: Route): string {
  if (route.kind === "static") return STATIC_PATH[route.tab];
  const sub = SESSION_TAB_TO_SUB[route.tab];
  return `/session/${route.sessionId}/${sub}`;
}

/** Convenience: canonical path for a static tab (no session lookup). */
export function tabToPath(tab: StaticTab): string {
  return STATIC_PATH[tab];
}

/**
 * Compute the canonical URL for the store's `(tab, sessionId)` pair.
 * Returns `null` when the pair is *inconsistent* — e.g. `tab` says
 * `session-refine` but there's no session id available. The routing
 * hook uses `null` as a "wait for state to settle" signal so we
 * don't push half-formed URLs like `/session/undefined/refine`.
 */
export function canonicalUrlForTab(
  tab: Tab,
  sessionId: string | null,
): string | null {
  if (isSessionTab(tab)) {
    if (!sessionId) return null;
    return routeToPath({ kind: "session", tab, sessionId });
  }
  return STATIC_PATH[tab];
}

/** Type guard: is this a `session-*` tab? */
export function isSessionTab(tab: Tab): tab is SessionTab {
  return (
    tab === "session-refine" ||
    tab === "session-pipeline" ||
    tab === "session-documents"
  );
}

/** Type guard: is this a `help-*` tab? */
export function isHelpTab(
  tab: Tab,
): tab is "help-team" | "help-settings" | "help-how-it-works" {
  return (
    tab === "help-team" ||
    tab === "help-settings" ||
    tab === "help-how-it-works"
  );
}

/**
 * `true` when the pathname already resolves to the given `(tab,
 * sessionId)` pair — used by the routing hook to skip redundant
 * `pushState` calls.
 */
export function pathMatchesTab(
  pathname: string,
  tab: Tab,
  sessionId: string | null,
): boolean {
  const route = pathToRoute(pathname);
  if (isSessionTab(tab)) {
    return (
      route.kind === "session" &&
      route.tab === tab &&
      route.sessionId === sessionId
    );
  }
  return route.kind === "static" && route.tab === tab;
}

/** Resolve a pathname directly to a `Tab` (throws away session id).
 *  Handy when the caller doesn't care about the session context. */
export function pathToTab(pathname: string): Tab {
  const route = pathToRoute(pathname);
  return route.tab;
}
