import { describe, expect, it } from "vitest";
import { cacheKey, normalizeForecast, normalizeLocations } from "./forecast";
import { formatPrecipitation, formatTemperature } from "./units";
import type { Place } from "./types";

const place: Place = {
  name: "Budapest",
  administrativeArea: null,
  country: "Hungary",
  latitude: 47.4979,
  longitude: 19.0402,
  elevation: 96,
  timezone: "Europe/Budapest",
};

describe("meteoblue normalization", () => {
  const raw = {
    metadata: { modelrun_utc: "2026-09-26T00:00:00Z" },
    data_1h: {
      time: ["2026-10-25T02:00:00+02:00", "2026-10-25T02:00:00+01:00"],
      precipitation: [0, null],
      precipitation_probability: [15, 80],
      temperature: [9, 8],
      snowfraction: [0, null],
    },
    data_day: {
      time: ["2026-10-25"],
      precipitation: [2.7],
      precipitation_probability: [65],
      predictability: [72],
      predictability_class: [4],
      temperature_min: [6],
      temperature_max: [11],
    },
  };

  it("aligns parallel arrays and preserves nulls and DST-distinct hours", () => {
    const forecast = normalizeForecast(raw, place, "2026-09-26T10:00:00Z");
    expect(forecast.hourly[0].timestamp).toBe("2026-10-25T00:00:00.000Z");
    expect(forecast.hourly[1].timestamp).toBe("2026-10-25T01:00:00.000Z");
    expect(forecast.hourly[1].precipitationMm).toBeNull();
    expect(forecast.daily[0]).toMatchObject({
      date: "2026-10-25",
      precipitationMm: 2.7,
      predictability: 72,
      predictabilityClass: 4,
    });
  });

  it("rejects broken array lengths and missing sections", () => {
    expect(() =>
      normalizeForecast(
        { ...raw, data_1h: { ...raw.data_1h, temperature: [] } },
        place,
      ),
    ).toThrow("Invalid");
    expect(() => normalizeForecast({ data_day: raw.data_day }, place)).toThrow(
      "Invalid",
    );
  });

  it("normalizes location results and excludes incomplete entries", () => {
    expect(
      normalizeLocations({
        results: [
          {
            name: "Basel",
            lat: 47.55,
            lon: 7.57,
            country: "Switzerland",
            admin1: "Basel-Stadt",
            asl: 279,
            timezone: "Europe/Zurich",
          },
          { name: "Bad" },
        ],
      }),
    ).toEqual([
      {
        name: "Basel",
        latitude: 47.55,
        longitude: 7.57,
        country: "Switzerland",
        administrativeArea: "Basel-Stadt",
        elevation: 279,
        timezone: "Europe/Zurich",
      },
    ]);
  });

  it("keys forecasts by coordinates, elevation, and timezone", () => {
    expect(cacheKey(place)).not.toBe(cacheKey({ ...place, elevation: 120 }));
    expect(cacheKey(place)).not.toBe(cacheKey({ ...place, timezone: "UTC" }));
  });
});

describe("units", () => {
  it("converts amount and temperature without changing the source model", () => {
    expect(formatPrecipitation(25.4, "imperial")).toBe("1.0 in");
    expect(formatPrecipitation(25.4, "metric")).toBe("25.4 mm");
    expect(formatTemperature(0, "imperial")).toBe("32°F");
    expect(formatTemperature(null, "metric")).toBe("—");
  });
});
