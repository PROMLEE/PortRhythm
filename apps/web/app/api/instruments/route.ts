import { NextResponse } from "next/server";
import { currentUserId } from "../../../lib/auth";
import { rateLimited } from "../../../lib/rate-limit";
import { publicErrorMessage } from "../../../lib/api-error";
import { searchStocks } from "../../../lib/stock-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId)
    return NextResponse.json(
      { message: "로그인이 필요합니다" },
      { status: 401 },
    );
  if (rateLimited(`instruments:${userId}`, 120))
    return NextResponse.json(
      { message: "종목 검색 요청이 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market");
  const query = searchParams.get("query")?.trim() ?? "";
  if ((market !== "KR" && market !== "US") || !query || query.length > 80)
    return NextResponse.json(
      { message: "종목 검색 조건을 확인해 주세요" },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      instruments: await searchStocks(market, query),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: publicErrorMessage(error, "종목 코드를 찾지 못했습니다"),
      },
      { status: 502 },
    );
  }
}
