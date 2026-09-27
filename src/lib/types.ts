export interface Place {
  name: string;
  administrativeArea: string | null;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  timezone: string;
}

export interface HourlyForecast {
  timestamp: string;
  precipitationMm: number | null;
  precipitationProbability: number | null;
  snowFraction: number | null;
  temperatureC: number | null;
  conditionCode: number | null;
}

export interface DailyForecast {
  date: string;
  precipitationMm: number | null;
  precipitationProbability: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  conditionCode: number | null;
  predictability: number | null;
  predictabilityClass: number | null;
}

export interface Forecast {
  /** Older offline snapshots without a source were produced by meteoblue. */
  source?: WeatherProvider;
  location: Place;
  modelRunAt: string | null;
  modelUpdatedAt: string | null;
  fetchedAt: string;
  freshness: "live" | "stale";
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

export type UnitSystem = "metric" | "imperial";
export type WeatherProvider = "meteoblue" | "open-meteo";
