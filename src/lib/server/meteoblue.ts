import "server-only";
import { createHmac } from "node:crypto";
import {
  cacheKey,
  normalizeForecast,
  normalizeLocations,
} from "@/lib/forecast";
import type { Forecast, Place } from "@/lib/types";

const forecastCache = new Map<
  string,
  { expiresAt: number; forecast: Forecast }
>();
const pendingForecasts = new Map<string, Promise<Forecast>>();

export class WeatherApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function credentials(): { key: string; secret: string | undefined } {
  const key = process.env.METEOBLUE_API_KEY;
  if (!key)
    throw new WeatherApiError(
      "CONFIGURATION",
      503,
      "Weather service is not configured.",
    );
  return { key, secret: process.env.METEOBLUE_API_SHARED_SECRET || undefined };
}

function signedUrl(
  base: string,
  path: string,
  params: URLSearchParams,
): string {
  const { key, secret } = credentials();
  params.set("apikey", key);
  if (secret) {
    params.set("expire", String(Math.floor(Date.now() / 1000) + 600));
    const payload = `${path}?${params.toString()}`;
    params.set(
      "sig",
      createHmac("sha256", secret).update(payload).digest("hex"),
    );
  }
  return `${base}${path}?${params.toString()}`;
}

async function fetchJson(
  url: string,
  cacheForSeconds: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      next: { revalidate: cacheForSeconds },
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new WeatherApiError(
        "TIMEOUT",
        504,
        "Weather service timed out. Please retry.",
      );
    }
    throw new WeatherApiError(
      "UNAVAILABLE",
      502,
      "Weather service is temporarily unavailable.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new WeatherApiError(
      "AUTHORIZATION",
      503,
      "Weather service authorization failed.",
    );
  }
  if (response.status === 429) {
    throw new WeatherApiError(
      "RATE_LIMIT",
      503,
      "Weather service is busy. Please retry shortly.",
    );
  }
  if (!response.ok)
    throw new WeatherApiError(
      "UPSTREAM",
      502,
      "Weather service is temporarily unavailable.",
    );
  try {
    const value = (await response.json()) as unknown;
    if (
      value &&
      typeof value === "object" &&
      "error" in value &&
      value.error === true
    ) {
      throw new WeatherApiError(
        "UPSTREAM",
        502,
        "Weather service returned an error.",
      );
    }
    return value;
  } catch (error) {
    if (error instanceof WeatherApiError) throw error;
    throw new WeatherApiError(
      "INVALID_RESPONSE",
      502,
      "Weather service returned unreadable data.",
    );
  }
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const params = new URLSearchParams({ query, itemsPerPage: "8" });
  const url = signedUrl(
    "https://www.meteoblue.com",
    "/en/server/search/query3",
    params,
  );
  try {
    return normalizeLocations(await fetchJson(url, 3600));
  } catch (error) {
    if (error instanceof WeatherApiError) throw error;
    throw new WeatherApiError(
      "INVALID_RESPONSE",
      502,
      "Location search returned invalid data.",
    );
  }
}

export async function getForecast(place: Place): Promise<Forecast> {
  const key = cacheKey(place);
  const cached = forecastCache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return { ...cached.forecast, location: place };
  const pending = pendingForecasts.get(key);
  if (pending) return { ...(await pending), location: place };
  const task = fetchForecast(place);
  pendingForecasts.set(key, task);
  try {
    const forecast = await task;
    if (forecastCache.size >= 300)
      forecastCache.delete(forecastCache.keys().next().value!);
    forecastCache.set(key, { expiresAt: Date.now() + 900_000, forecast });
    return forecast;
  } finally {
    pendingForecasts.delete(key);
  }
}

async function fetchForecast(place: Place): Promise<Forecast> {
  const params = new URLSearchParams({
    lat: String(place.latitude),
    lon: String(place.longitude),
    tz: place.timezone,
    forecastDays: "7",
    timeformat: "iso8601",
    temperatureUnit: "C",
    precipitationUnit: "metric",
    format: "json",
  });
  if (place.elevation !== null) params.set("asl", String(place.elevation));
  const url = signedUrl(
    "https://my.meteoblue.com",
    "/packages/basic-1h,basic-day",
    params,
  );
  try {
    return normalizeForecast(await fetchJson(url, 900), place);
  } catch (error) {
    if (error instanceof WeatherApiError) throw error;
    throw new WeatherApiError(
      "INVALID_RESPONSE",
      502,
      "Weather service returned invalid forecast data.",
    );
  }
}

export function logApiError(route: string, error: unknown): WeatherApiError {
  const safe =
    error instanceof WeatherApiError
      ? error
      : new WeatherApiError("INTERNAL", 500, "Something went wrong.");
  console.error(
    JSON.stringify({
      event: "weather_api_error",
      route,
      code: safe.code,
      status: safe.status,
    }),
  );
  return safe;
}

export { cacheKey };
