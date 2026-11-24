// KIS Open API limits REST calls per app key: about 18/s on real accounts and
// 1/s on paper (VTS) accounts (KIS notice "API 호출 유량 안내", 2026-04).
// The limit is shared by every serverless instance using the same key, so the
// per-instance pace stays well below it; EGW00201 retries in kis.ts cover bursts.
export const REAL_QUOTE_INTERVAL_MS = 150;
export const PAPER_QUOTE_INTERVAL_MS = 1100;

export function kisQuoteIntervalMs(baseUrl: string) {
  return /openapivts\./i.test(baseUrl)
    ? PAPER_QUOTE_INTERVAL_MS
    : REAL_QUOTE_INTERVAL_MS;
}

// Serializes callers so consecutive requests start at least `intervalMs` apart.
export function createRequestPacer(
  intervalMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
) {
  let nextAt = 0;
  let queue: Promise<void> = Promise.resolve();
  return function pace() {
    const turn = queue.then(async () => {
      const delay = Math.max(0, nextAt - now());
      if (delay) await sleep(delay);
      nextAt = now() + intervalMs;
    });
    queue = turn.catch(() => {});
    return turn;
  };
}
