import { describe, expect, it } from "vitest";
import { summarizeDay } from "./day-summary";
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

describe("daily summary", () => {
  it("describes the daily temperature range and precipitation total", () => {
    expect(summarizeDay(day, "metric")).toBe(
      "Precipitation is likely. Temperatures from 9°C to 17°C. 4.2 mm of precipitation expected in total.",
    );
  });
  it("converts both temperatures and the total with the unit preference", () => {
    const summary = summarizeDay(day, "imperial");
    expect(summary).toContain("48°F to 63°F");
    expect(summary).toContain("0.2 in");
  });
  it("distinguishes missing totals from a dry forecast", () => {
    expect(
      summarizeDay(
        { ...day, precipitationMm: null, precipitationProbability: null },
        "metric",
      ),
    ).toContain("The precipitation total is unavailable.");
    expect(
      summarizeDay(
        { ...day, precipitationMm: 0, precipitationProbability: 5 },
        "metric",
      ),
    ).toContain("A dry day is forecast.");
    expect(summarizeDay(undefined, "metric")).toContain("unavailable");
  });
  it("keeps a zero total with a high probability distinct from a dry day", () => {
    expect(summarizeDay({ ...day, precipitationMm: 0 }, "metric")).toContain(
      "Precipitation is likely.",
    );
  });
});
