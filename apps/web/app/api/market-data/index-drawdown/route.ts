import { NextResponse } from "next/server";
import { currentUserId } from "../../../../lib/auth";
import { rateLimited } from "../../../../lib/rate-limit";
import { publicErrorMessage } from "../../../../lib/api-error";
import { indexDailyCloses, kisConfigured } from "../../../../lib/kis";
import {
  DRAWDOWN_INDEXES,
  fiftyTwoWeekDrawdown,
  type DrawdownIndex,
  type IndexDrawdown,
} from "../../../drawdown";

export const runtime = "nodejs";

const CACHE_MS = 30 * 60_000;
const cache = new Map<DrawdownIndex, { value: IndexDrawdown; expiresAt: number }>();
const pending = new Map<DrawdownIndex, Promise<IndexDrawdown | null>>();

async function load(index: DrawdownIndex) {
  const today = new Date();
  const from = new Date(today);
  // A little over a year so the 52-week window is full even around holidays.
  from.setUTCDate(from.getUTCDate() - 380);
  const rows = await indexDailyCloses(
    index,
    from.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );
  return fiftyTwoWeekDrawdown(index, rows);
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId)
    return NextResponse.json({ message: "로그인이 필요합니다" }, { status: 401 });
  if (rateLimited(`index-drawdown:${userId}`, 30))
    return NextResponse.json(
      { message: "지수 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const index = new URL(request.url).searchParams.get("index") as DrawdownIndex | null;
  if (!index || !DRAWDOWN_INDEXES.some((row) => row.id === index))
    return NextResponse.json({ message: "지수를 확인해 주세요" }, { status: 400 });
  if (!kisConfigured())
    return NextResponse.json(
      { message: "지수 시세를 조회할 수 있는 시세 API가 설정되지 않았습니다." },
      { status: 503 },
    );
  const cached = cache.get(index);
  if (cached && cached.expiresAt > Date.now())
    return NextResponse.json({ drawdown: cached.value });
  try {
    let request = pending.get(index);
    if (!request) {
      request = load(index).finally(() => pending.delete(index));
      pending.set(index, request);
    }
    const drawdown = await request;
    if (!drawdown)
      return NextResponse.json(
        { message: "지수 시세를 받지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    cache.set(index, { value: drawdown, expiresAt: Date.now() + CACHE_MS });
    return NextResponse.json({ drawdown });
  } catch (error) {
    return NextResponse.json(
      { message: publicErrorMessage(error, "지수 시세를 받지 못했습니다.") },
      { status: 502 },
    );
  }
}
