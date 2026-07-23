import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSpecialists,
  saveSpecialists,
  resetSpecialists,
  loadGenerationSettings,
  saveGenerationSettings,
  resetGenerationSettings,
} from "../settings";
import { DEFAULT_GENERATION_SETTINGS, PRODUCER_KINDS } from "../personas";

beforeEach(() => {
  localStorage.clear();
});

describe("loadGenerationSettings", () => {
  it("returns defaults when no stored value exists", () => {
    expect(loadGenerationSettings()).toEqual(DEFAULT_GENERATION_SETTINGS);
  });

  it("clamps out-of-range and non-numeric values back into valid ranges", () => {
    localStorage.setItem(
      "mr.settings.v1",
      JSON.stringify({ threshold: 500, maxRounds: -3 }),
    );
    const s = loadGenerationSettings();
    expect(s.threshold).toBe(100);
    expect(s.maxRounds).toBe(2);
  });

  it("survives malformed JSON by returning defaults", () => {
    localStorage.setItem("mr.settings.v1", "{{ not json");
    expect(loadGenerationSettings()).toEqual(DEFAULT_GENERATION_SETTINGS);
  });

  it("round-trips saved values", () => {
    saveGenerationSettings({ threshold: 80, maxRounds: 5 });
    expect(loadGenerationSettings()).toEqual({ threshold: 80, maxRounds: 5 });
  });

  it("resets to defaults on reset", () => {
    saveGenerationSettings({ threshold: 80, maxRounds: 5 });
    const s = resetGenerationSettings();
    expect(s).toEqual(DEFAULT_GENERATION_SETTINGS);
    expect(localStorage.getItem("mr.settings.v1")).toBeNull();
  });
});

describe("loadSpecialists", () => {
  it("returns a full default set with a team for every producer kind", () => {
    const s = loadSpecialists();
    expect(s.analyst.name).toBeTruthy();
    const kinds = s.teams.map((t) => t.kind).sort();
    expect(kinds).toEqual([...PRODUCER_KINDS].sort());
  });

  it("re-hydrates saved specialists and normalises team memberships", () => {
    const start = loadSpecialists();
    start.analyst.name = "Custom Analyst";
    saveSpecialists(start);
    const loaded = loadSpecialists();
    expect(loaded.analyst.name).toBe("Custom Analyst");
    for (const t of loaded.teams) {
      for (const m of t.members) expect(m.produces).toBe(t.kind);
    }
  });

  it("falls back to defaults for missing teams inside a corrupted payload", () => {
    localStorage.setItem(
      "mr.specialists.v1",
      JSON.stringify({ analyst: null, teams: [] }),
    );
    const s = loadSpecialists();
    expect(s.teams).toHaveLength(PRODUCER_KINDS.length);
  });

  it("resets specialists and clears storage", () => {
    saveSpecialists({ ...loadSpecialists(), analyst: { ...loadSpecialists().analyst, name: "X" } });
    const s = resetSpecialists();
    expect(localStorage.getItem("mr.specialists.v1")).toBeNull();
    expect(s.teams.length).toBe(PRODUCER_KINDS.length);
  });
});
