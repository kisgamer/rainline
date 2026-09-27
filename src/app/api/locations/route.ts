import { NextRequest, NextResponse } from "next/server";
import { logApiError, searchPlaces } from "@/lib/server/meteoblue";
import { searchOpenMeteoPlaces } from "@/lib/server/open-meteo";

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") ?? "meteoblue";
  if (provider !== "meteoblue" && provider !== "open-meteo")
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Choose a supported weather source.",
        },
      },
      { status: 400 },
    );
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 100) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Enter 3–100 characters." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      {
        locations: await (provider === "open-meteo"
          ? searchOpenMeteoPlaces(query)
          : searchPlaces(query)),
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    const safe = logApiError("locations", error);
    return NextResponse.json(
      { error: { code: safe.code, message: safe.message } },
      { status: safe.status },
    );
  }
}
