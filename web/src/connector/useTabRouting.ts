import { useEffect } from "react";
import { useStore } from "./store";
import {
  canonicalUrlForTab,
  isSessionTab,
  pathMatchesTab,
  pathToRoute,
  routeToPath,
} from "./paths";

/**
 * Two-way sync between the store (`tab` + `currentSession?.id`) and
 * `window.location.pathname`, without dragging in a full router library.
 *
 * The initial hydration is handled at module load time inside `store.ts`
 * (`computeInitialTab`), so this hook only has to worry about:
 *
 *   1. On first mount: canonicalise the URL to the route the store
 *      hydrated to. Root (`/`) and unknown paths (`/nope`) get
 *      `replaceState`d to the canonical path of the resolved tab so
 *      the address bar always shows a tab name. Deep links to
 *      `/session/:id/…` also trigger `openSession(id)` if that
 *      session isn't already loaded, so a bookmark/link opens the
 *      right session on refresh.
 *   2. When the store's `(tab, currentSessionId)` pair changes,
 *      `pushState` the canonical URL — but only when it actually
 *      needs to change, so repeated `setTab(sameTab)` is a no-op.
 *   3. `popstate` (browser back/forward) → mirror the new pathname
 *      into the store, again loading the session lazily if the URL
 *      points to a different one than the store currently holds.
 *
 * The store → URL effect is guarded by `canonicalUrlForTab` returning
 * `null` when the state is *inconsistent* (e.g. `tab` is `session-*`
 * but there's no session id yet). Returning `null` means "wait until
 * the state settles" — this avoids pushing half-formed URLs like
 * `/session/undefined/refine` during the brief window between
 * `startSession` setting the tab and the server returning the id.
 */
export function useTabRouting(): void {
  const tab = useStore((s) => s.tab);
  const currentSessionId = useStore((s) => s.currentSession?.id ?? null);
  const setTab = useStore((s) => s.setTab);

  // One-shot: normalise the URL and hydrate the session if the deep
  // link references one. `getState()` (not the reactive hook) is used
  // inside the callbacks so `popstate` handlers see fresh state.
  useEffect(() => {
    const applyFromUrl = () => {
      const route = pathToRoute(window.location.pathname);
      const state = useStore.getState();

      state.setTab(route.tab);
      if (route.kind === "session") {
        if (state.currentSession?.id !== route.sessionId) {
          // Fire and forget — openSession internally sets currentSession
          // *and* re-derives the auto-nav tab based on session status,
          // which is fine because it'll match the tab we already set
          // (or transition to a more accurate one).
          void state.openSession(route.sessionId).catch((err) => {
            console.warn("Deep-link openSession failed:", err);
            // Bounce to dashboard so the user isn't stuck on a broken URL.
            state.setTab("dashboard");
            window.history.replaceState({}, "", "/dashboard");
          });
        }
      }
    };

    // Canonicalise on mount if the URL isn't already canonical.
    const initialRoute = pathToRoute(window.location.pathname);
    const canonicalInitial = routeToPath(initialRoute);
    if (window.location.pathname !== canonicalInitial) {
      window.history.replaceState({}, "", canonicalInitial);
    }
    // If the mount URL was a session deep link, we need to hydrate the
    // session in the store even though `computeInitialTab` at store
    // load time only set the tab — the session content still has to
    // be fetched from the server.
    if (initialRoute.kind === "session") {
      applyFromUrl();
    }

    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, [setTab]);

  // Store → URL sync: whenever `tab` or `currentSessionId` changes,
  // update the URL if it doesn't already reflect the new state.
  useEffect(() => {
    const target = canonicalUrlForTab(tab, currentSessionId);
    // `null` = state is inconsistent (session-* tab with no session
    // id) — wait for the next state tick. This is a normal transient
    // during `startSession` between the tab-flip and the server
    // returning the id.
    if (target === null) return;
    if (pathMatchesTab(window.location.pathname, tab, currentSessionId)) return;
    window.history.pushState({}, "", target);
  }, [tab, currentSessionId]);
}

/** Re-export path helpers a caller might want at the same layer. */
export { isSessionTab };
