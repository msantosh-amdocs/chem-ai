/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabRouting } from "../useTabRouting";
import { useStore } from "../store";

function setPathname(pathname: string): void {
  window.history.replaceState({}, "", pathname);
}

describe("useTabRouting", () => {
  const initialStoreState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialStoreState, true);
    setPathname("/");
  });

  afterEach(() => {
    setPathname("/");
    vi.restoreAllMocks();
  });

  it("canonicalises the root pathname on mount", () => {
    setPathname("/");
    useStore.setState({ tab: "dashboard" });
    renderHook(() => useTabRouting());
    expect(window.location.pathname).toBe("/dashboard");
  });

  it("canonicalises unknown paths to /dashboard on mount", () => {
    setPathname("/nope");
    useStore.setState({ tab: "dashboard" });
    renderHook(() => useTabRouting());
    expect(window.location.pathname).toBe("/dashboard");
  });

  it("leaves a known static pathname untouched on mount", () => {
    setPathname("/help/settings");
    useStore.setState({ tab: "help-settings" });
    const spy = vi.spyOn(window.history, "pushState");
    renderHook(() => useTabRouting());
    expect(window.location.pathname).toBe("/help/settings");
    expect(spy).not.toHaveBeenCalled();
  });

  it("pushState-updates the URL when a static tab changes", () => {
    setPathname("/dashboard");
    useStore.setState({ tab: "dashboard" });
    renderHook(() => useTabRouting());
    const spy = vi.spyOn(window.history, "pushState");
    act(() => {
      useStore.getState().setTab("help-team");
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/help/team");
  });

  it("does NOT push when the pathname already matches the tab", () => {
    setPathname("/help/team");
    useStore.setState({ tab: "help-team" });
    renderHook(() => useTabRouting());
    const spy = vi.spyOn(window.history, "pushState");
    act(() => {
      useStore.getState().setTab("help-team");
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("waits for a session id before pushing a session URL", () => {
    setPathname("/dashboard");
    useStore.setState({ tab: "dashboard", currentSession: null });
    renderHook(() => useTabRouting());
    const spy = vi.spyOn(window.history, "pushState");
    // Flip to a session tab BEFORE the session id is available — the
    // hook should defer pushState until the id shows up.
    act(() => {
      useStore.getState().setTab("session-refine");
    });
    expect(spy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/dashboard");
  });

  it("pushes /session/:id/refine once both tab and session id are set", () => {
    setPathname("/dashboard");
    useStore.setState({ tab: "dashboard", currentSession: null });
    renderHook(() => useTabRouting());
    act(() => {
      // Simulate `startSession` setting both fields.
      useStore.setState({
        tab: "session-refine",
        currentSession: {
          id: "sess1234",
        } as never,
      });
    });
    expect(window.location.pathname).toBe("/session/sess1234/refine");
  });

  it("re-syncs the store on browser back/forward (popstate) — static tabs", () => {
    setPathname("/dashboard");
    useStore.setState({ tab: "dashboard" });
    renderHook(() => useTabRouting());
    setPathname("/help/settings");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(useStore.getState().tab).toBe("help-settings");
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
