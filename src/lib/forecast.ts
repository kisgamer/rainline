import type { DailyForecast, Forecast, HourlyForecast, Place } from "./types";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const string = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const array = (value: unknown): unknown[] | null =>
  Array.isArray(value) ? value : null;

function at(values: RecordValue, field: string, index: number): number | null {
  return number(array(values[field])?.[index]);
}

function timestamp(value: unknown): string | null {
  if (typeof value === "number") {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function localDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))
    return value.slice(0, 10);
  return timestamp(value)?.slice(0, 10) ?? null;
}

function validSeries(
  section: RecordValue | null,
  fields: string[],
): section is RecordValue {
  const times = array(section?.time);
  return (
    !!times &&
    times.length > 0 &&
    fields.every((field) => {
      const values = array(section?.[field]);
      return !!values && values.length === times.length;
    })
  );
}

export function normalizeForecast(
  raw: unknown,
  location: Place,
  fetchedAt = new Date().toISOString(),
): Forecast {
  const response = object(raw);
  const hourlyData = object(response?.data_1h);
  const dailyData = object(response?.data_day);
  if (
    !validSeries(hourlyData, [
      "precipitation",
      "precipitation_probability",
      "temperature",
    ]) ||
    !validSeries(dailyData, [
      "precipitation",
      "precipitation_probability",
      "predictability",
    ])
  ) {
    throw new Error("Invalid meteoblue forecast response");
  }
  const hourly = (hourlyData.time as unknown[])
    .map((value, index): HourlyForecast | null => {
      const time = timestamp(value);
      if (!time) return null;
      return {
        timestamp: time,
        precipitationMm: at(hourlyData, "precipitation", index),
        precipitationProbability: at(
          hourlyData,
          "precipitation_probability",
          index,
        ),
        snowFraction: at(hourlyData, "snowfraction", index),
        temperatureC: at(hourlyData, "temperature", index),
        conditionCode: at(hourlyData, "pictocode", index),
      };
    })
    .filter((entry): entry is HourlyForecast => !!entry);
  const daily = (dailyData.time as unknown[])
    .map((value, index): DailyForecast | null => {
      const date = localDate(value);
      if (!date) return null;
      return {
        date,
        precipitationMm: at(dailyData, "precipitation", index),
        precipitationProbability: at(
          dailyData,
          "precipitation_probability",
          index,
        ),
        temperatureMinC: at(dailyData, "temperature_min", index),
        temperatureMaxC: at(dailyData, "temperature_max", index),
        conditionCode: at(dailyData, "pictocode", index),
        predictability: at(dailyData, "predictability", index),
        predictabilityClass: at(dailyData, "predictability_class", index),
      };
    })
    .filter((entry): entry is DailyForecast => !!entry);
  if (!hourly.length || !daily.length)
    throw new Error("Empty meteoblue forecast response");
  const metadata = object(response?.metadata);
  return {
    source: "meteoblue",
    location,
    modelRunAt: timestamp(metadata?.modelrun_utc),
    modelUpdatedAt: timestamp(metadata?.modelrun_updatetime_utc),
    fetchedAt,
    freshness: "live",
    hourly,
    daily: daily.slice(0, 7),
  };
}

export function normalizeLocations(raw: unknown): Place[] {
  const values = array(object(raw)?.results);
  if (!values) throw new Error("Invalid meteoblue location response");
  return values
    .map((value) => {
      const item = object(value);
      if (
        !item ||
        !string(item.name) ||
        number(item.lat) === null ||
        number(item.lon) === null
      )
        return null;
      return {
        name: string(item.name)!,
        administrativeArea: string(item.admin1),
        country: string(item.country) ?? "",
        latitude: number(item.lat)!,
        longitude: number(item.lon)!,
        elevation: number(item.asl),
        timezone: string(item.timezone) ?? "UTC",
      } satisfies Place;
    })
    .filter((place): place is Place => !!place);
}

export function cacheKey(
  place: Pick<Place, "latitude" | "longitude" | "elevation" | "timezone">,
): string {
  return `${place.latitude.toFixed(5)}:${place.longitude.toFixed(5)}:${place.elevation ?? "auto"}:${place.timezone}`;
}
