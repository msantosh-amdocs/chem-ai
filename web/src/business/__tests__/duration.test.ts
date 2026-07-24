import { describe, it, expect } from "vitest";
import {
  computeLiveDuration,
  formatCompactDuration,
  formatDuration,
} from "../duration";

describe("formatDuration", () => {
  it("renders sub-second values with one decimal (below 1s)", () => {
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(500)).toBe("0.5s");
    expect(formatDuration(937)).toBe("0.9s");
  });

  it("renders short values under 10s with one decimal", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(4200)).toBe("4.2s");
    expect(formatDuration(9999)).toBe("10.0s");
  });

  it("rounds to whole seconds for 10s..1m", () => {
    expect(formatDuration(10_000)).toBe("10s");
    expect(formatDuration(59_400)).toBe("59s");
  });

  it("renders minutes+seconds for < 1h", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(64_000)).toBe("1m 4s");
    expect(formatDuration(3_600_000 - 1)).toBe("59m 59s");
  });

  it("renders hours+minutes for < 1d", () => {
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(3_720_000)).toBe("1h 2m");
  });

  it("renders days+hours for >= 1d", () => {
    expect(formatDuration(86_400_000)).toBe("1d 0h");
    expect(formatDuration(90_061_000)).toBe("1d 1h");
  });

  it.each([null, undefined, NaN, -5])(
    "renders — for missing/invalid ms (%o)",
    (v) => {
      expect(formatDuration(v as number | null | undefined)).toBe("—");
    },
  );
});

describe("formatCompactDuration", () => {
  it("renders M:SS below 1h", () => {
    expect(formatCompactDuration(0)).toBe("0:00");
    expect(formatCompactDuration(9_000)).toBe("0:09");
    expect(formatCompactDuration(64_000)).toBe("1:04");
    expect(formatCompactDuration(3_599_000)).toBe("59:59");
  });

  it("renders H:MM:SS from 1h", () => {
    expect(formatCompactDuration(3_600_000)).toBe("1:00:00");
    expect(formatCompactDuration(3_725_000)).toBe("1:02:05");
  });

  it.each([null, undefined, NaN, -5])(
    "renders — for missing/invalid ms (%o)",
    (v) => {
      expect(formatCompactDuration(v as number | null | undefined)).toBe("—");
    },
  );
});

describe("computeLiveDuration", () => {
  const NOW = 1_800_000_000_000;

  it("returns the delta from startedAt to endedAt when both are present", () => {
    const started = new Date(NOW - 5000).toISOString();
    const ended = new Date(NOW - 2000).toISOString();
    expect(computeLiveDuration(started, ended, NOW)).toBe(3000);
  });

  it("falls back to now when endedAt is missing", () => {
    const started = new Date(NOW - 7500).toISOString();
    expect(computeLiveDuration(started, null, NOW)).toBe(7500);
    expect(computeLiveDuration(started, undefined, NOW)).toBe(7500);
  });

  it("returns null when startedAt is missing (can't measure)", () => {
    expect(computeLiveDuration(null, null, NOW)).toBeNull();
    expect(computeLiveDuration(undefined, undefined, NOW)).toBeNull();
  });

  it("returns null when startedAt is malformed", () => {
    expect(computeLiveDuration("not-a-date", null, NOW)).toBeNull();
  });

  it("clamps negative deltas to 0 (clock skew defense)", () => {
    const started = new Date(NOW + 1000).toISOString(); // future
    expect(computeLiveDuration(started, null, NOW)).toBe(0);
  });
});
