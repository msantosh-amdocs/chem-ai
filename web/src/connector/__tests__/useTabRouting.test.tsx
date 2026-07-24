/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabRouting } from "../useTabRouting";
import { useStore } from "../store";

/**
 * Rewrite `window.location.pathname` for jsdom. `history.replaceState`
 * is the closest analogue to a real navigation.
 */
function setPathname(pathname: string): void {
  window.history.replaceState({}, "", pathname);
}

describe("useTabRouting", () => {
  // Snapshot the store so mutations from one test don't bleed into the next.
  const initialStoreState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialStoreState, true);
    setPathname("/");
  });

  afterEach(() => {
    setPathname("/");
    vi.restoreAllMocks();
  });

  it("canonicalises the root pathname to the default tab's path on mount", () => {
    setPathname("/");
    // Sim: store was seeded with `computeInitialTab` at module load time,
    // which — for `/` — would have returned the default tab. We mirror
    // that state here so the hook sees the same starting condition.
    useStore.setState({ tab: "new" });
    renderHook(() => useTabRouting());
    // replaceState — no back-stack entry, just an address-bar rewrite.
    expect(window.location.pathname).toBe("/new");
  });

  it("canonicalises unknown paths to the default tab's path on mount", () => {
    setPathname("/nope");
    useStore.setState({ tab: "new" });
    renderHook(() => useTabRouting());
    expect(window.location.pathname).toBe("/new");
  });

  it("leaves a known pathname untouched on mount", () => {
    setPathname("/refine");
    useStore.setState({ tab: "refine" });
    const spy = vi.spyOn(window.history, "pushState");
    renderHook(() => useTabRouting());
    expect(window.location.pathname).toBe("/refine");
    expect(spy).not.toHaveBeenCalled();
  });

  it("pushState-updates the URL when the store tab changes", () => {
    setPathname("/new");
    useStore.setState({ tab: "new" });
    renderHook(() => useTabRouting());
    const spy = vi.spyOn(window.history, "pushState");
    act(() => {
      useStore.getState().setTab("pipeline");
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/pipeline");
  });

  it("does NOT push a new history entry when the URL already matches the tab", () => {
    setPathname("/documents");
    useStore.setState({ tab: "docs" });
    renderHook(() => useTabRouting());
    const spy = vi.spyOn(window.history, "pushState");
    act(() => {
      useStore.getState().setTab("docs");
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("re-syncs the store on browser back/forward (popstate)", () => {
    setPathname("/new");
    useStore.setState({ tab: "new" });
    renderHook(() => useTabRouting());
    expect(useStore.getState().tab).toBe("new");

    setPathname("/history");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(useStore.getState().tab).toBe("history");
  });

  it("removes its popstate listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useTabRouting());
    expect(addSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});
