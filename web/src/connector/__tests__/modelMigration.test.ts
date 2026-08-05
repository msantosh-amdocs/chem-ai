import { describe, it, expect } from "vitest";
import {
  formatModelLabel,
  migrateModelSelection,
  migratePersonaModel,
} from "../modelMigration";
import { defaultAnalyst } from "../personas";

describe("modelMigration", () => {
  it("maps claude-opus to auto-smart intelligence", () => {
    const result = migrateModelSelection("claude-opus-4-8", {});
    expect(result).toEqual({
      model: "auto-smart",
      params: { optimize_for: "intelligence" },
      changed: true,
    });
  });

  it("maps terra and composer to auto-smart cost", () => {
    expect(migrateModelSelection("gpt-5.6-terra", {})).toMatchObject({
      model: "auto-smart",
      params: { optimize_for: "cost" },
      changed: true,
    });
    expect(migrateModelSelection("composer-2.5", {})).toMatchObject({
      model: "auto-smart",
      params: { optimize_for: "cost" },
      changed: true,
    });
  });

  it("fills missing optimize_for on auto-smart personas", () => {
    const { persona, changed } = migratePersonaModel({
      ...defaultAnalyst(),
      model: "auto-smart",
      params: {},
    });
    expect(changed).toBe(true);
    expect(persona.params.optimize_for).toBe("intelligence");
  });

  it("formats auto-smart labels with router mode", () => {
    expect(formatModelLabel("auto-smart", { optimize_for: "intelligence" })).toBe(
      "auto-smart (intelligence)",
    );
  });
});
