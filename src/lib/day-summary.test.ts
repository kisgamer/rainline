import { describe, expect, it } from "vitest";
import { summarizeDay, type ForecastTone } from "./day-summary";
import type { DailyForecast } from "./types";

const day: DailyForecast = {
  date: "2026-09-26",
  precipitationMm: 4.2,
  precipitationProbability: 70,
  temperatureMinC: 9,
  temperatureMaxC: 17,
  conditionCode: 6,
  predictability: 82,
  predictabilityClass: 4,
};

describe("daily summary voices", () => {
  it("keeps the same forecast facts across every tone", () => {
    const summaries = (["straight", "playful", "snarky"] as ForecastTone[]).map(
      (tone) => summarizeDay(day, "metric", tone),
    );
    expect(new Set(summaries).size).toBe(3);
    for (const summary of summaries) {
      expect(summary).toContain("9°C to 17°C");
      expect(summary).toContain("Expected total: 4.2 mm");
    }
  });

  it("varies the phrasing by date but remains stable for a given day", () => {
    const summaries = [26, 27, 28].map((date) =>
      summarizeDay({ ...day, date: `2026-09-${date}` }, "metric", "playful"),
    );
    expect(
      new Set(summaries.map((summary) => summary.split(".")[0])).size,
    ).toBe(3);
    expect(summarizeDay(day, "metric", "playful")).toBe(summaries[0]);
  });

  it("converts all quantitative details without changing the tone", () => {
    const summary = summarizeDay(day, "imperial", "snarky");
    expect(summary).toContain("48°F to 63°F");
    expect(summary).toContain("Expected total: 0.2 in");
  });

  it("describes dry, heavy, possible and missing forecasts without inventing a total", () => {
    const dry = summarizeDay(
      { ...day, precipitationMm: 0, precipitationProbability: 5 },
      "metric",
      "straight",
    );
    expect(dry).toContain("Expected total: 0.0 mm");
    expect(dry).not.toContain("Precipitation is likely");
    const heavy = summarizeDay(
      { ...day, precipitationMm: 14, precipitationProbability: 85 },
      "metric",
      "playful",
    );
    expect(heavy).toContain("14.0 mm");
    expect(heavy).not.toContain("day off");
    const possible = summarizeDay(
      { ...day, precipitationMm: 0.4, precipitationProbability: 30 },
      "metric",
      "straight",
    );
    expect(possible).toContain("0.4 mm");
    const unknown = summarizeDay(
      { ...day, precipitationMm: null, precipitationProbability: null },
      "metric",
      "snarky",
    );
    expect(unknown).toContain("Precipitation total unavailable");
    expect(unknown).not.toContain("Expected total:");
    expect(summarizeDay(undefined, "metric")).toContain("unavailable");
  });

  it("does not call a zero total dry when probability is high", () => {
    expect(
      summarizeDay({ ...day, precipitationMm: 0 }, "metric", "straight"),
    ).toContain("Expected total: 0.0 mm");
    expect(
      summarizeDay({ ...day, precipitationMm: 0 }, "metric", "straight"),
    ).not.toContain("dry day");
  });
});
