import "server-only";
import { cacheKey } from "@/lib/forecast";
import {
  normalizeOpenMeteo,
  normalizeOpenMeteoLocations,
} from "@/lib/open-meteo";
import type { Forecast, Place } from "@/lib/types";
import { fetchJson, WeatherApiError } from "./meteoblue";

const cache = new Map<string, { expiresAt: number; forecast: Forecast }>();
const pending = new Map<string, Promise<Forecast>>();

function url(service: "forecast" | "geocoding", params: URLSearchParams) {
  const key = process.env.OPEN_METEO_API_KEY;
  const host = service === "forecast" ? "api" : "geocoding-api";
  if (key) params.set("apikey", key);
  return `https://${key ? "customer-" : ""}${host}.open-meteo.com/v1/${service === "forecast" ? "forecast" : "search"}?${params}`;
}

export async function searchOpenMeteoPlaces(query: string): Promise<Place[]> {
  try {
    return normalizeOpenMeteoLocations(
      await fetchJson(
        url(
          "geocoding",
          new URLSearchParams({
            name: query,
            count: "8",
            language: "en",
            format: "json",
          }),
        ),
        3600,
      ),
    );
  } catch (error) {
    if (error instanceof WeatherApiError) throw error;
    throw new WeatherApiError(
      "INVALID_RESPONSE",
      502,
      "Location search returned invalid data.",
    );
  }
}

async function fetchForecast(place: Place): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: place.timezone,
    forecast_days: "7",
    timeformat: "unixtime",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
    hourly:
      "temperature_2m,precipitation,precipitation_probability,weather_code",
    daily:
      "temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,weather_code",
  });
  if (place.elevation !== null)
    params.set("elevation", String(place.elevation));
  try {
    return normalizeOpenMeteo(
      await fetchJson(url("forecast", params), 900),
      place,
    );
  } catch (error) {
    if (error instanceof WeatherApiError) throw error;
    throw new WeatherApiError(
      "INVALID_RESPONSE",
      502,
      "Weather service returned invalid forecast data.",
    );
  }
}

export async function getOpenMeteoForecast(place: Place): Promise<Forecast> {
  const key = cacheKey(place);
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now())
    return { ...saved.forecast, location: place };
  const existing = pending.get(key);
  if (existing) return { ...(await existing), location: place };
  const task = fetchForecast(place);
  pending.set(key, task);
  try {
    const forecast = await task;
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { expiresAt: Date.now() + 900_000, forecast });
    return forecast;
  } finally {
    pending.delete(key);
  }
}
