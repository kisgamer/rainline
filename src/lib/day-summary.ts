import type { DailyForecast, UnitSystem } from "./types";
import { formatPrecipitation, formatTemperature } from "./units";

/** Describe daily totals without turning missing data into a dry forecast. */
export function summarizeDay(
  day: DailyForecast | undefined,
  units: UnitSystem,
): string {
  if (!day) return "The daily outlook is currently unavailable.";
  const { precipitationMm: amount, precipitationProbability: chance } = day;
  const weather =
    amount === 0 && (chance === null || chance < 20)
      ? "A dry day is forecast."
      : chance !== null && chance >= 60
        ? "Precipitation is likely."
        : (amount !== null && amount > 0) || (chance !== null && chance >= 20)
          ? "Some precipitation is possible."
          : "Precipitation details are unavailable.";
  const temperature =
    day.temperatureMinC !== null && day.temperatureMaxC !== null
      ? ` Temperatures from ${formatTemperature(day.temperatureMinC, units)} to ${formatTemperature(day.temperatureMaxC, units)}.`
      : day.temperatureMaxC !== null
        ? ` A high of ${formatTemperature(day.temperatureMaxC, units)}.`
        : "";
  const total =
    amount !== null
      ? ` ${formatPrecipitation(amount, units)} of precipitation expected in total.`
      : " The precipitation total is unavailable.";
  return weather + temperature + total;
}
