import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "lucide-react";
import type { WeatherProvider } from "./types";

export function condition(
  code: number | null,
  snow: number | null = null,
  source: WeatherProvider = "meteoblue",
) {
  if (source === "open-meteo") {
    if (code === 0 || code === 1)
      return { label: code === 0 ? "Clear" : "Mostly clear", icon: Sun };
    if (code === 2) return { label: "Partly cloudy", icon: CloudSun };
    if (code === 3) return { label: "Overcast", icon: Cloud };
    if (code === 45 || code === 48) return { label: "Fog", icon: CloudFog };
    if (code !== null && [71, 73, 75, 77, 85, 86].includes(code))
      return { label: "Snow", icon: CloudSnow };
    if (code !== null && [95, 96, 97, 99].includes(code))
      return { label: "Thunderstorms", icon: CloudLightning };
    if (code !== null && [51, 53, 55, 56, 57].includes(code))
      return { label: "Drizzle", icon: CloudRain };
    if (code !== null && [61, 63, 65, 66, 67].includes(code))
      return { label: "Rain", icon: CloudRain };
    if (code !== null && [80, 81, 82].includes(code))
      return { label: "Showers", icon: CloudRain };
    return { label: "Unavailable", icon: Cloud };
  }
  if (snow !== null && snow >= 0.5) return { label: "Snow", icon: CloudSnow };
  if (
    code !== null &&
    [8, 9, 10, 21, 22, 23, 24, 25, 27, 28, 29, 30].includes(code)
  )
    return { label: "Showers", icon: CloudRain };
  if (
    code !== null &&
    [6, 7, 11, 12, 14, 16, 23, 25, 31, 33, 35].includes(code)
  )
    return { label: "Rain", icon: CloudRain };
  return { label: "Variable", icon: CloudSun };
}
