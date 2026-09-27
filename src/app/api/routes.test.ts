// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as forecastGET } from "./forecast/route";
import { GET as locationsGET } from "./locations/route";
import {
  getOpenMeteoForecast,
  searchOpenMeteoPlaces,
} from "@/lib/server/open-meteo";

vi.mock("@/lib/server/open-meteo", () => ({
  getOpenMeteoForecast: vi.fn(),
  searchOpenMeteoPlaces: vi.fn(),
}));
import {
  getForecast,
  searchPlaces,
  WeatherApiError,
} from "@/lib/server/meteoblue";

vi.mock("@/lib/server/meteoblue", () => ({
  getForecast: vi.fn(),
  searchPlaces: vi.fn(),
  logApiError: (_route: string, error: unknown) => error,
  WeatherApiError: class WeatherApiError extends Error {
    constructor(
      public code: string,
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

describe("API route contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("routes Open-Meteo requests independently and rejects unknown providers", async () => {
    vi.mocked(searchOpenMeteoPlaces).mockResolvedValue([]);
    const response = await locationsGET(
      new NextRequest(
        "http://localhost/api/locations?q=Basel&provider=open-meteo",
      ),
    );
    expect(response.status).toBe(200);
    expect(searchOpenMeteoPlaces).toHaveBeenCalledWith("Basel");
    expect(searchPlaces).not.toHaveBeenCalled();
    vi.mocked(getOpenMeteoForecast).mockRejectedValue(
      new WeatherApiError("RATE_LIMIT", 503, "Weather service is busy."),
    );
    const forecast = await forecastGET(
      new NextRequest(
        "http://localhost/api/forecast?lat=47&lon=19&timezone=UTC&provider=open-meteo",
      ),
    );
    expect(forecast.status).toBe(503);
    expect(getOpenMeteoForecast).toHaveBeenCalledOnce();
    expect(getForecast).not.toHaveBeenCalled();
    for (const [handler, url] of [
      [forecastGET, "forecast?lat=47&lon=19&timezone=UTC"],
      [locationsGET, "locations?q=Basel"],
    ] as const) {
      expect(
        (
          await handler(
            new NextRequest(`http://localhost/api/${url}&provider=unknown`),
          )
        ).status,
      ).toBe(400);
    }
  });

  it("rejects invalid query and coordinates before calling meteoblue", async () => {
    const location = await locationsGET(
      new NextRequest("http://localhost/api/locations?q=ab"),
    );
    const forecast = await forecastGET(
      new NextRequest(
        "http://localhost/api/forecast?lat=200&lon=19&timezone=UTC",
      ),
    );
    const units = await forecastGET(
      new NextRequest(
        "http://localhost/api/forecast?lat=47&lon=19&timezone=UTC&units=kelvin",
      ),
    );
    expect(location.status).toBe(400);
    expect(forecast.status).toBe(400);
    expect(units.status).toBe(400);
    expect(searchPlaces).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
  });

  it("returns normalized locations and sanitized forecast response", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([
      {
        name: "Basel",
        latitude: 47.55,
        longitude: 7.57,
        elevation: 279,
        timezone: "Europe/Zurich",
        country: "Switzerland",
        administrativeArea: null,
      },
    ]);
    vi.mocked(getForecast).mockResolvedValue({
      location: {
        name: "Basel",
        latitude: 47.55,
        longitude: 7.57,
        elevation: 279,
        timezone: "Europe/Zurich",
        country: "Switzerland",
        administrativeArea: null,
      },
      fetchedAt: "2026-09-26T10:00:00Z",
      modelRunAt: null,
      modelUpdatedAt: null,
      freshness: "live",
      hourly: [],
      daily: [],
    });
    const locations = await locationsGET(
      new NextRequest("http://localhost/api/locations?q=Basel"),
    );
    const forecast = await forecastGET(
      new NextRequest(
        "http://localhost/api/forecast?lat=47.55&lon=7.57&timezone=Europe%2FZurich&name=Basel",
      ),
    );
    expect(locations.status).toBe(200);
    expect(forecast.status).toBe(200);
    expect(JSON.stringify(await forecast.json())).not.toContain("apikey");
    expect(getForecast).toHaveBeenCalledOnce();
  });

  it("maps upstream quota failures to safe errors", async () => {
    vi.mocked(searchPlaces).mockRejectedValue(
      new WeatherApiError("RATE_LIMIT", 503, "Weather service is busy."),
    );
    const response = await locationsGET(
      new NextRequest("http://localhost/api/locations?q=Basel"),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "RATE_LIMIT", message: "Weather service is busy." },
    });
  });
});
