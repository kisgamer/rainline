// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getForecast, searchPlaces, WeatherApiError } from "./meteoblue";
import type { Place } from "@/lib/types";

vi.mock("server-only", () => ({}));

const base: Place = {
  name: "Test",
  country: "Switzerland",
  administrativeArea: null,
  latitude: 46.01,
  longitude: 7.01,
  elevation: 300,
  timezone: "Europe/Zurich",
};
let sequence = 0;
const uniquePlace = (): Place => ({
  ...base,
  latitude: base.latitude + ++sequence / 10_000,
});
const validResponse = {
  metadata: { modelrun_utc: "2026-09-26T00:00:00Z" },
  data_1h: {
    time: ["2026-09-26T10:00:00Z"],
    precipitation: [1.2],
    precipitation_probability: [70],
    temperature: [12],
  },
  data_day: {
    time: ["2026-09-26"],
    precipitation: [4.3],
    precipitation_probability: [75],
    predictability: [82],
  },
};

describe("meteoblue server adapter", () => {
  beforeEach(() => vi.stubEnv("METEOBLUE_API_KEY", "private-test-key"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests both packages and caches by forecast location", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("my.meteoblue.com");
      return Response.json(validResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    const place = uniquePlace();
    const first = await getForecast(place);
    const second = await getForecast({ ...place, name: "Renamed" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/packages/basic-1h,basic-day?",
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain("forecastDays=7");
    expect(String(fetchMock.mock.calls[0][0])).toContain("timeformat=iso8601");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "precipitationUnit=metric",
    );
    expect(second.location.name).toBe("Renamed");
    expect(first.daily[0].predictability).toBe(82);
    expect(JSON.stringify(first)).not.toContain("private-test-key");
  });

  it.each([
    [401, "AUTHORIZATION"],
    [429, "RATE_LIMIT"],
    [500, "UPSTREAM"],
  ])("maps upstream status %i to %s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status })),
    );
    await expect(getForecast(uniquePlace())).rejects.toMatchObject({ code });
  });

  it("rejects malformed data and timeouts safely", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data_1h: {} })),
    );
    await expect(getForecast(uniquePlace())).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timeout", "TimeoutError");
      }),
    );
    await expect(getForecast(uniquePlace())).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it("proxies location search with the server-side key", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("www.meteoblue.com");
      return Response.json({
        results: [
          {
            name: "Bern",
            country: "Switzerland",
            lat: 46.95,
            lon: 7.44,
            timezone: "Europe/Zurich",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await searchPlaces("Bern"))[0].name).toBe("Bern");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "apikey=private-test-key",
    );
  });

  it("fails clearly without a configured key", async () => {
    vi.stubEnv("METEOBLUE_API_KEY", "");
    await expect(searchPlaces("Bern")).rejects.toBeInstanceOf(WeatherApiError);
  });
});
