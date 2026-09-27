// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpenMeteoForecast, searchOpenMeteoPlaces } from "./open-meteo";
import { normalizeOpenMeteo, normalizeOpenMeteoLocations } from "../open-meteo";
import { condition } from "../conditions";
import type { Place } from "../types";

vi.mock("server-only", () => ({}));
const place: Place = {
  name: "Budapest",
  country: "Hungary",
  administrativeArea: null,
  latitude: 47.5,
  longitude: 19,
  elevation: null,
  timezone: "Europe/Budapest",
};
let sequence = 0;
const uniquePlace = () => ({
  ...place,
  latitude: place.latitude + ++sequence / 1000,
});
const epoch = Date.parse("2026-10-24T22:00:00Z") / 1000;
function fixture() {
  return {
    utc_offset_seconds: 7200,
    hourly_units: {
      time: "unixtime",
      temperature_2m: "°C",
      precipitation: "mm",
      precipitation_probability: "%",
    },
    daily_units: {
      time: "unixtime",
      temperature_2m_min: "°C",
      temperature_2m_max: "°C",
      precipitation_sum: "mm",
      precipitation_probability_max: "%",
    },
    hourly: {
      time: [epoch, epoch + 3600],
      precipitation: [1.5, null],
      precipitation_probability: [80, null],
      temperature_2m: [12, 10],
      weather_code: [61, 71],
    },
    daily: {
      time: [epoch],
      precipitation_sum: [5.2],
      precipitation_probability_max: [85],
      temperature_2m_min: [9],
      temperature_2m_max: [14],
      weather_code: [61],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Open-Meteo normalization", () => {
  it("keeps UTC hours and local daily dates, nulls, totals and unavailable predictability", () => {
    const result = normalizeOpenMeteo(fixture(), place);
    expect(result.source).toBe("open-meteo");
    expect(result.hourly[0].timestamp).toBe("2026-10-24T22:00:00.000Z");
    expect(result.hourly[1].precipitationMm).toBeNull();
    expect(result.daily[0]).toMatchObject({
      date: "2026-10-25",
      precipitationMm: 5.2,
      predictability: null,
      predictabilityClass: null,
    });
    expect(result.modelRunAt).toBeNull();
  });
  it("keeps repeated DST hours as distinct instants", () => {
    const raw = fixture();
    raw.hourly.time = [
      Date.parse("2026-10-25T00:00Z") / 1000,
      Date.parse("2026-10-25T01:00Z") / 1000,
    ];
    const result = normalizeOpenMeteo(raw, place);
    expect(
      new Date(result.hourly[1].timestamp).valueOf() -
        new Date(result.hourly[0].timestamp).valueOf(),
    ).toBe(3600000);
  });
  it("rejects malformed arrays, unsupported units and out-of-range probabilities", () => {
    const missing = fixture();
    missing.hourly.precipitation = [];
    expect(() => normalizeOpenMeteo(missing, place)).toThrow();
    const units = fixture();
    units.hourly_units.precipitation = "inch";
    expect(() => normalizeOpenMeteo(units, place)).toThrow();
    const bad = fixture();
    bad.hourly.precipitation_probability[0] = 101;
    expect(() => normalizeOpenMeteo(bad, place)).toThrow();
  });
  it("normalizes empty and valid geocoding results while rejecting invalid coordinates", () => {
    expect(normalizeOpenMeteoLocations({})).toEqual([]);
    const value = {
      name: "Budapest",
      latitude: 47.5,
      longitude: 19,
      timezone: "Europe/Budapest",
      country: "Hungary",
    };
    expect(normalizeOpenMeteoLocations({ results: [value] })[0]).toEqual(place);
    expect(() =>
      normalizeOpenMeteoLocations({ results: [{ ...value, latitude: 200 }] }),
    ).toThrow();
  });
  it.each([
    [0, "Clear"],
    [3, "Overcast"],
    [61, "Rain"],
    [71, "Snow"],
    [95, "Thunderstorms"],
  ])("interprets WMO code %i as %s", (code, label) => {
    expect(condition(code as number, null, "open-meteo").label).toBe(label);
  });
});

describe("Open-Meteo server requests", () => {
  it("works without credentials, caches requests and requests metric unix series", async () => {
    vi.stubEnv("METEOBLUE_API_KEY", "");
    vi.stubEnv("OPEN_METEO_API_KEY", "");
    const fetchMock = vi.fn(async () => Response.json(fixture()));
    vi.stubGlobal("fetch", fetchMock);
    const point = uniquePlace();
    await getOpenMeteoForecast(point);
    const result = await getOpenMeteoForecast({ ...point, name: "Renamed" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("timeformat=unixtime");
    expect(url).toContain("forecast_days=7");
    expect(url).not.toContain("apikey");
    expect(result.location.name).toBe("Renamed");
  });
  it("uses customer endpoints with a server-only key for forecast and geocoding", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "private-open-meteo-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(url.includes("/search?") ? {} : fixture()),
      ),
    );
    const result = await getOpenMeteoForecast(uniquePlace());
    await searchOpenMeteoPlaces("Budapest");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "customer-api.open-meteo.com",
    );
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain(
      "customer-geocoding-api.open-meteo.com",
    );
    expect(JSON.stringify(result)).not.toContain("private-open-meteo-key");
  });
  it.each([
    [401, "AUTHORIZATION"],
    [429, "RATE_LIMIT"],
    [500, "UPSTREAM"],
  ])("maps status %i", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: status as number })),
    );
    await expect(getOpenMeteoForecast(uniquePlace())).rejects.toMatchObject({
      code,
    });
  });
  it("maps malformed data and timeout errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    await expect(getOpenMeteoForecast(uniquePlace())).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timeout", "TimeoutError");
      }),
    );
    await expect(searchOpenMeteoPlaces("Budapest")).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });
});
