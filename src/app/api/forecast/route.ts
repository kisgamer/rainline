import { NextRequest, NextResponse } from "next/server";
import { getForecast, logApiError } from "@/lib/server/meteoblue";
import type { Place } from "@/lib/types";

function parsePlace(params: URLSearchParams): Place | null {
  const latText = params.get("lat");
  const lonText = params.get("lon");
  if (
    latText === null ||
    lonText === null ||
    latText.trim() === "" ||
    lonText.trim() === ""
  )
    return null;
  const latitude = Number(latText);
  const longitude = Number(lonText);
  const elevationText = params.get("asl");
  const elevation =
    elevationText === null || elevationText === ""
      ? null
      : Number(elevationText);
  const timezone = params.get("timezone") ?? "";
  const name = params.get("name")?.trim() || "Selected location";
  const country = params.get("country")?.trim() ?? "";
  const administrativeArea = params.get("area")?.trim() || null;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    (elevation !== null &&
      (!Number.isFinite(elevation) || elevation < -500 || elevation > 9000)) ||
    name.length > 100 ||
    country.length > 100 ||
    (administrativeArea?.length ?? 0) > 100 ||
    timezone.length > 80
  )
    return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return null;
  }
  return {
    name,
    country,
    administrativeArea,
    latitude,
    longitude,
    elevation,
    timezone,
  };
}

export async function GET(request: NextRequest) {
  const requestedUnits = request.nextUrl.searchParams.get("units");
  if (requestedUnits && requestedUnits !== "metric") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Forecast API supports metric source units only.",
        },
      },
      { status: 400 },
    );
  }
  const place = parsePlace(request.nextUrl.searchParams);
  if (!place) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Enter valid location coordinates and timezone.",
        },
      },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await getForecast(place), {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    const safe = logApiError("forecast", error);
    return NextResponse.json(
      { error: { code: safe.code, message: safe.message } },
      { status: safe.status },
    );
  }
}
