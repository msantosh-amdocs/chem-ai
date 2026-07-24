import { useEffect } from "react";
import { useSetTab, useTab } from "./hooks";
import { pathMatchesTab, pathToTab, tabToPath } from "./paths";

/**
 * Two-way sync between `store.tab` and `window.location.pathname`, without
 * dragging in a full router library.
 *
 * The initial hydration is handled at module load time inside `store.ts`
 * (`computeInitialTab`), so this hook only has to worry about:
 *
 *   1. Canonicalising the URL on first mount — root (`/`) and unknown
 *      paths (`/nope`) get `replaceState`d to the canonical path of the
 *      resolved tab so the address bar always shows the tab name.
 *   2. Pushing history entries when the store's `tab` changes (tab
 *      clicks, auto-advance on session status, deep-link programmatic
 *      navigation, …).
 *   3. Listening for browser back/forward (`popstate`) and mirroring the
 *      new pathname back into the store.
 *
 * We only touch history when the pathname actually needs to change, so
 * repeated `setTab(sameTab)` never spams history entries.
 */
export function useTabRouting(): void {
  const tab = useTab();
  const setTab = useSetTab();

  // One-shot: normalise the URL to the canonical path of whatever tab
  // the store hydrated to. Uses `replaceState` (not `pushState`) so we
  // don't leave a phantom "/" entry in the user's back stack.
  useEffect(() => {
    const canonical = tabToPath(pathToTab(window.location.pathname));
    if (window.location.pathname !== canonical) {
      window.history.replaceState({}, "", canonical);
    }
    // Empty dep array: this fires exactly once on mount. StrictMode's
    // double-invoke is a no-op the second time (the URL already
    // matches after the first replaceState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back / forward → mirror the new pathname into the store.
  useEffect(() => {
    const onPop = () => setTab(pathToTab(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setTab]);

  // Store → URL: pushState when the store's `tab` diverges from the
  // current pathname. Skips the initial render (the URL was seeded from
  // the same pathname, so `pathMatchesTab` is already true).
  useEffect(() => {
    if (pathMatchesTab(window.location.pathname, tab)) return;
    window.history.pushState({}, "", tabToPath(tab));
  }, [tab]);
}
