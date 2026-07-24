import { describe, it, expect } from "vitest";
import {
  DEFAULT_TAB,
  PATH_TO_TAB,
  TAB_TO_PATH,
  pathMatchesTab,
  pathToTab,
  tabToPath,
} from "../paths";
import type { Tab } from "../store";

describe("connector/paths", () => {
  describe("TAB_TO_PATH / PATH_TO_TAB integrity", () => {
    it("covers every Tab id with a leading-slash path", () => {
      const tabs: Tab[] = [
        "new",
        "refine",
        "pipeline",
        "docs",
        "specialists",
        "settings",
        "history",
        "help",
      ];
      for (const t of tabs) {
        expect(TAB_TO_PATH[t]).toMatch(/^\/[a-z][a-z-]*$/);
      }
    });

    it("PATH_TO_TAB is a strict inverse of TAB_TO_PATH", () => {
      for (const [tab, path] of Object.entries(TAB_TO_PATH) as Array<[Tab, string]>) {
        expect(PATH_TO_TAB[path]).toBe(tab);
      }
    });

    it("has no duplicate paths across tabs", () => {
      const paths = Object.values(TAB_TO_PATH);
      expect(new Set(paths).size).toBe(paths.length);
    });
  });

  describe("pathToTab", () => {
    it.each([
      ["/new", "new"],
      ["/refine", "refine"],
      ["/pipeline", "pipeline"],
      ["/documents", "docs"],
      ["/team", "specialists"],
      ["/settings", "settings"],
      ["/history", "history"],
      ["/how-it-works", "help"],
    ] as Array<[string, Tab]>)("maps %s → %s", (path, tab) => {
      expect(pathToTab(path)).toBe(tab);
    });

    it("resolves the root path to DEFAULT_TAB", () => {
      expect(pathToTab("/")).toBe(DEFAULT_TAB);
    });

    it("resolves an empty pathname to DEFAULT_TAB", () => {
      expect(pathToTab("")).toBe(DEFAULT_TAB);
    });

    it("tolerates a trailing slash on any known path", () => {
      expect(pathToTab("/refine/")).toBe("refine");
      expect(pathToTab("/documents//")).toBe("docs");
    });

    it("is case-insensitive so /Refine and /REFINE both work", () => {
      expect(pathToTab("/Refine")).toBe("refine");
      expect(pathToTab("/HOW-IT-WORKS")).toBe("help");
    });

    it("falls back to DEFAULT_TAB for unknown paths", () => {
      expect(pathToTab("/nope")).toBe(DEFAULT_TAB);
      expect(pathToTab("/refined")).toBe(DEFAULT_TAB);
    });
  });

  describe("tabToPath", () => {
    it.each([
      ["new", "/new"],
      ["refine", "/refine"],
      ["docs", "/documents"],
      ["specialists", "/team"],
      ["help", "/how-it-works"],
    ] as Array<[Tab, string]>)("maps %s → %s", (tab, path) => {
      expect(tabToPath(tab)).toBe(path);
    });
  });

  describe("pathMatchesTab", () => {
    it("returns true when pathname's resolved tab matches", () => {
      expect(pathMatchesTab("/refine", "refine")).toBe(true);
      expect(pathMatchesTab("/documents", "docs")).toBe(true);
      expect(pathMatchesTab("/", "new")).toBe(true);
    });

    it("returns false when the pathname resolves to a different tab", () => {
      expect(pathMatchesTab("/refine", "pipeline")).toBe(false);
      expect(pathMatchesTab("/documents", "specialists")).toBe(false);
    });

    it("returns true when an unknown pathname falls back to the tab", () => {
      // `/nope` → DEFAULT_TAB (`new`) — so it matches `new` only.
      expect(pathMatchesTab("/nope", "new")).toBe(true);
      expect(pathMatchesTab("/nope", "refine")).toBe(false);
    });
  });
});
