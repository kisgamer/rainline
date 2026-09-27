import type { Forecast, Place } from "./types";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Open-Meteo response");
  return value as JsonObject;
}
function numeric(
  value: unknown,
  min = -Infinity,
  max = Infinity,
): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error("Invalid Open-Meteo value");
  return value;
}
function series(
  raw: unknown,
  fields: string[],
): JsonObject & { time: number[] } {
  const data = object(raw);
  if (
    !Array.isArray(data.time) ||
    !data.time.length ||
    data.time.length > 400 ||
    fields.some(
      (field) =>
        !Array.isArray(data[field]) ||
        (data[field] as unknown[]).length !== (data.time as unknown[]).length,
    )
  )
    throw new Error("Invalid Open-Meteo series");
  for (const time of data.time) {
    if (
      numeric(time) === null ||
      !Number.isFinite(new Date(time * 1000).valueOf())
    )
      throw new Error("Invalid Open-Meteo time");
  }
  return data as JsonObject & { time: number[] };
}
function at(
  data: JsonObject,
  key: string,
  index: number,
  min = -Infinity,
  max = Infinity,
) {
  return numeric((data[key] as unknown[])[index], min, max);
}

export function normalizeOpenMeteo(
  raw: unknown,
  location: Place,
  fetchedAt = new Date().toISOString(),
): Forecast {
  const response = object(raw);
  const hours = series(response.hourly, [
    "precipitation",
    "precipitation_probability",
    "temperature_2m",
    "weather_code",
  ]);
  const days = series(response.daily, [
    "precipitation_sum",
    "precipitation_probability_max",
    "temperature_2m_min",
    "temperature_2m_max",
    "weather_code",
  ]);
  const hourlyUnits = object(response.hourly_units);
  const dailyUnits = object(response.daily_units);
  if (
    hourlyUnits.time !== "unixtime" ||
    dailyUnits.time !== "unixtime" ||
    hourlyUnits.precipitation !== "mm" ||
    hourlyUnits.temperature_2m !== "°C" ||
    hourlyUnits.precipitation_probability !== "%" ||
    dailyUnits.precipitation_sum !== "mm" ||
    dailyUnits.temperature_2m_min !== "°C" ||
    dailyUnits.temperature_2m_max !== "°C" ||
    dailyUnits.precipitation_probability_max !== "%"
  )
    throw new Error("Unsupported Open-Meteo units");
  const offset = numeric(response.utc_offset_seconds, -86400, 86400);
  if (offset === null) throw new Error("Missing Open-Meteo UTC offset");
  return {
    source: "open-meteo",
    location,
    fetchedAt,
    freshness: "live",
    // Generation duration is not a model run timestamp.
    modelRunAt: null,
    modelUpdatedAt: null,
    hourly: hours.time.map((time, index) => ({
      timestamp: new Date(time * 1000).toISOString(),
      precipitationMm: at(hours, "precipitation", index, 0),
      precipitationProbability: at(
        hours,
        "precipitation_probability",
        index,
        0,
        100,
      ),
      temperatureC: at(hours, "temperature_2m", index),
      conditionCode: at(hours, "weather_code", index, 0, 99),
      snowFraction: null,
    })),
    daily: days.time.slice(0, 7).map((time, index) => ({
      // Open-Meteo documents daily unix dates with its returned UTC offset.
      date: new Date((time + offset) * 1000).toISOString().slice(0, 10),
      precipitationMm: at(days, "precipitation_sum", index, 0),
      precipitationProbability: at(
        days,
        "precipitation_probability_max",
        index,
        0,
        100,
      ),
      temperatureMinC: at(days, "temperature_2m_min", index),
      temperatureMaxC: at(days, "temperature_2m_max", index),
      conditionCode: at(days, "weather_code", index, 0, 99),
      predictability: null,
      predictabilityClass: null,
    })),
  };
}

export function normalizeOpenMeteoLocations(raw: unknown): Place[] {
  const response = object(raw);
  if (response.error) throw new Error("Open-Meteo geocoding error");
  if (response.results === undefined) return [];
  if (!Array.isArray(response.results))
    throw new Error("Invalid location results");
  return response.results.slice(0, 8).map((value) => {
    const item = object(value);
    const latitude = numeric(item.latitude, -90, 90);
    const longitude = numeric(item.longitude, -180, 180);
    if (
      latitude === null ||
      longitude === null ||
      typeof item.name !== "string" ||
      !item.name ||
      typeof item.timezone !== "string"
    )
      throw new Error("Invalid location");
    new Intl.DateTimeFormat("en", { timeZone: item.timezone });
    return {
      name: item.name,
      latitude,
      longitude,
      timezone: item.timezone,
      elevation: numeric(item.elevation ?? null, -500, 9000),
      administrativeArea: typeof item.admin1 === "string" ? item.admin1 : null,
      country: typeof item.country === "string" ? item.country : "",
    };
  });
}
