import { describe, it, expect } from "vitest";
import {
  DEFAULT_TAB,
  canonicalUrlForTab,
  isHelpTab,
  isSessionTab,
  pathMatchesTab,
  pathToRoute,
  pathToTab,
  routeToPath,
  tabToPath,
  type Route,
  type SessionTab,
  type StaticTab,
} from "../paths";

describe("connector/paths", () => {
  describe("pathToRoute — static routes", () => {
    it.each([
      ["/", "dashboard"],
      ["", "dashboard"],
      ["/dashboard", "dashboard"],
      ["/new", "new-idea"],
      ["/help/team", "help-team"],
      ["/help/settings", "help-settings"],
      ["/help/how-it-works", "help-how-it-works"],
    ] as Array<[string, StaticTab]>)("resolves %s → %s", (path, tab) => {
      const route = pathToRoute(path);
      expect(route.kind).toBe("static");
      if (route.kind === "static") expect(route.tab).toBe(tab);
    });

    it("tolerates trailing slashes on any known static path", () => {
      const r = pathToRoute("/help/settings/");
      expect(r).toEqual({ kind: "static", tab: "help-settings" });
    });

    it("is case-insensitive for static paths", () => {
      const r = pathToRoute("/Help/Team");
      expect(r).toEqual({ kind: "static", tab: "help-team" });
    });

    it("falls back to dashboard for an unknown path", () => {
      expect(pathToRoute("/nope")).toEqual({ kind: "static", tab: "dashboard" });
      expect(pathToRoute("/help/nope")).toEqual({
        kind: "static",
        tab: "dashboard",
      });
    });
  });

  describe("pathToRoute — session routes", () => {
    it.each([
      ["/session/abc123/refine", "session-refine"],
      ["/session/abc123/pipeline", "session-pipeline"],
      ["/session/abc123/documents", "session-documents"],
    ] as Array<[string, SessionTab]>)(
      "resolves %s → session tab %s",
      (path, tab) => {
        const r = pathToRoute(path);
        expect(r).toEqual({ kind: "session", tab, sessionId: "abc123" });
      },
    );

    it("accepts hyphens and underscores in session ids AND preserves case", () => {
      const r = pathToRoute("/session/s_1234-abcd-EF/refine");
      expect(r).toEqual({
        kind: "session",
        tab: "session-refine",
        sessionId: "s_1234-abcd-EF",
      });
    });

    it("preserves a nanoid-style mixed-case session id verbatim", () => {
      const r = pathToRoute("/session/Vkv9DW92Br88kgo9j9YC1/pipeline");
      expect(r).toEqual({
        kind: "session",
        tab: "session-pipeline",
        sessionId: "Vkv9DW92Br88kgo9j9YC1",
      });
    });

    it("rejects a bogus sub-slug and falls back to dashboard", () => {
      expect(pathToRoute("/session/abc123/hack")).toEqual({
        kind: "static",
        tab: "dashboard",
      });
    });

    it("rejects a traversal-style session id and falls back", () => {
      // `/session/../foo/refine` would normalise weirdly if we let it
      // through — assert we don't.
      expect(pathToRoute("/session/../refine")).toEqual({
        kind: "static",
        tab: "dashboard",
      });
    });

    it("rejects a session id shorter than 4 chars", () => {
      expect(pathToRoute("/session/abc/refine")).toEqual({
        kind: "static",
        tab: "dashboard",
      });
    });
  });

  describe("routeToPath", () => {
    it("round-trips every static route", () => {
      const statics: StaticTab[] = [
        "dashboard",
        "new-idea",
        "help-team",
        "help-settings",
        "help-how-it-works",
      ];
      for (const t of statics) {
        const path = routeToPath({ kind: "static", tab: t });
        expect(pathToRoute(path)).toEqual({ kind: "static", tab: t });
      }
    });

    it("round-trips a session route", () => {
      const route: Route = {
        kind: "session",
        tab: "session-pipeline",
        sessionId: "sess1234",
      };
      const path = routeToPath(route);
      expect(path).toBe("/session/sess1234/pipeline");
      expect(pathToRoute(path)).toEqual(route);
    });
  });

  describe("canonicalUrlForTab", () => {
    it("returns the static path for a static tab (ignoring sessionId)", () => {
      expect(canonicalUrlForTab("dashboard", null)).toBe("/dashboard");
      expect(canonicalUrlForTab("help-settings", "s1234")).toBe("/help/settings");
    });

    it("returns null when a session tab has no session id yet", () => {
      expect(canonicalUrlForTab("session-refine", null)).toBeNull();
      expect(canonicalUrlForTab("session-pipeline", "")).toBeNull();
    });

    it("returns the /session/:id/sub path when a session id is present", () => {
      expect(canonicalUrlForTab("session-refine", "s1234")).toBe(
        "/session/s1234/refine",
      );
      expect(canonicalUrlForTab("session-documents", "abc-1234")).toBe(
        "/session/abc-1234/documents",
      );
    });
  });

  describe("pathMatchesTab", () => {
    it("returns true when a static path resolves to the tab", () => {
      expect(pathMatchesTab("/dashboard", "dashboard", null)).toBe(true);
      expect(pathMatchesTab("/help/team", "help-team", null)).toBe(true);
      // sessionId is irrelevant for static tabs.
      expect(pathMatchesTab("/help/team", "help-team", "unused")).toBe(true);
    });

    it("returns false when the path resolves to a different tab", () => {
      expect(pathMatchesTab("/dashboard", "help-team", null)).toBe(false);
    });

    it("returns true when a session path matches BOTH tab and id", () => {
      expect(
        pathMatchesTab("/session/s1234/refine", "session-refine", "s1234"),
      ).toBe(true);
    });

    it("returns false when the session tab matches but the id differs", () => {
      expect(
        pathMatchesTab("/session/s1234/refine", "session-refine", "other"),
      ).toBe(false);
    });
  });

  describe("type guards", () => {
    it("isSessionTab identifies session tabs only", () => {
      expect(isSessionTab("session-refine")).toBe(true);
      expect(isSessionTab("session-pipeline")).toBe(true);
      expect(isSessionTab("session-documents")).toBe(true);
      expect(isSessionTab("dashboard")).toBe(false);
      expect(isSessionTab("help-team")).toBe(false);
    });

    it("isHelpTab identifies help submenu tabs only", () => {
      expect(isHelpTab("help-team")).toBe(true);
      expect(isHelpTab("help-settings")).toBe(true);
      expect(isHelpTab("help-how-it-works")).toBe(true);
      expect(isHelpTab("dashboard")).toBe(false);
      expect(isHelpTab("session-refine")).toBe(false);
    });
  });

  describe("misc", () => {
    it("DEFAULT_TAB is dashboard", () => {
      expect(DEFAULT_TAB).toBe("dashboard");
    });

    it("pathToTab throws away the session id", () => {
      expect(pathToTab("/session/s1234/refine")).toBe("session-refine");
      expect(pathToTab("/dashboard")).toBe("dashboard");
    });

    it("tabToPath maps only static tabs", () => {
      expect(tabToPath("dashboard")).toBe("/dashboard");
      expect(tabToPath("help-team")).toBe("/help/team");
      expect(tabToPath("new-idea")).toBe("/new");
    });
  });
});
