import type { UnitSystem } from "./types";

export function formatPrecipitation(
  mm: number | null,
  units: UnitSystem,
): string {
  if (mm === null) return "—";
  if (units === "imperial")
    return `${(mm / 25.4).toFixed(mm < 2.54 ? 2 : 1)} in`;
  return `${mm.toFixed(mm < 1 ? 1 : 1)} mm`;
}

export function formatTemperature(
  celsius: number | null,
  units: UnitSystem,
): string {
  if (celsius === null) return "—";
  return units === "imperial"
    ? `${Math.round((celsius * 9) / 5 + 32)}°F`
    : `${Math.round(celsius)}°C`;
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}
