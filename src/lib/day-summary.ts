import type { DailyForecast, UnitSystem } from "./types";
import { formatPrecipitation, formatTemperature } from "./units";

export type ForecastTone = "straight" | "playful" | "snarky";
type Outlook = "dry" | "possible" | "likely" | "heavy" | "unknown";

const openings: Record<ForecastTone, Record<Outlook, readonly string[]>> = {
  straight: {
    dry: [
      "Little or no precipitation expected.",
      "Precipitation looks unlikely.",
      "A dry day is forecast.",
    ],
    possible: [
      "Some precipitation is possible.",
      "The forecast leaves room for precipitation.",
      "A little precipitation may show up.",
    ],
    likely: [
      "Precipitation is likely.",
      "Wet weather is in the forecast.",
      "Expect some precipitation today.",
    ],
    heavy: [
      "A wetter day is forecast.",
      "A substantial precipitation total is expected.",
      "Plan for a significant amount of precipitation.",
    ],
    unknown: ["Precipitation details are unavailable."],
  },
  playful: {
    dry: [
      "The sky is taking the day off.",
      "Your umbrella can enjoy a day off.",
      "The clouds are keeping things low-key.",
    ],
    possible: [
      "The sky is keeping its options open.",
      "Precipitation might make a cameo.",
      "A little precipitation could crash the party.",
    ],
    likely: [
      "The clouds have plans.",
      "The sky has a delivery scheduled.",
      "Precipitation is on the guest list.",
    ],
    heavy: [
      "The clouds booked overtime.",
      "The sky has a busy schedule.",
      "Your rain gear may earn its keep.",
    ],
    unknown: ["The sky is keeping its forecast to itself."],
  },
  snarky: {
    dry: [
      "The sky has finally learned some restraint.",
      "Your umbrella is unemployed today.",
      "The clouds took the hint. Finally.",
    ],
    possible: [
      "The sky cannot make up its mind. Relatable.",
      "A chance of precipitation, because certainty is apparently too much to ask.",
      "The clouds are being vague on purpose.",
    ],
    likely: [
      "The clouds did not get the memo about your plans.",
      "Precipitation is coming. How original.",
      "Looks like the sky picked drama today.",
    ],
    heavy: [
      "The clouds are overachieving. Naturally.",
      "The sky chose chaos today.",
      "Your rain gear has been promoted to essential staff.",
    ],
    unknown: ["The forecast is being mysterious. How helpful."],
  },
};

function outlook(day: DailyForecast): Outlook {
  const amount = day.precipitationMm;
  const chance = day.precipitationProbability;
  if (amount === null && chance === null) return "unknown";
  if (amount === 0 && (chance === null || chance < 20)) return "dry";
  if (amount !== null && amount >= 10 && (chance === null || chance >= 50))
    return "heavy";
  if (chance !== null && chance >= 60) return "likely";
  if ((amount !== null && amount > 0) || (chance !== null && chance >= 20))
    return "possible";
  return "dry";
}

function variant(date: string, count: number): number {
  const day = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(day) ? Math.floor(day / 86_400_000) % count : 0;
}

/** Stable phrasing per date; tone changes the copy, never the forecast data. */
export function summarizeDay(
  day: DailyForecast | undefined,
  units: UnitSystem,
  tone: ForecastTone = "playful",
): string {
  if (!day) return "The daily outlook is currently unavailable.";
  const options = openings[tone][outlook(day)];
  const opening = options[variant(day.date, options.length)];
  const temperature =
    day.temperatureMinC !== null && day.temperatureMaxC !== null
      ? ` ${formatTemperature(day.temperatureMinC, units)} to ${formatTemperature(day.temperatureMaxC, units)}.`
      : day.temperatureMaxC !== null
        ? ` High ${formatTemperature(day.temperatureMaxC, units)}.`
        : "";
  const total =
    day.precipitationMm !== null
      ? ` Expected total: ${formatPrecipitation(day.precipitationMm, units)}.`
      : " Precipitation total unavailable.";
  return opening + temperature + total;
}
