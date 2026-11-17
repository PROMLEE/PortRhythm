import type { Market } from "./holdings";

export type DailyStockQuote = {
  market: Market;
  symbol: string;
  exchange: string | null;
  previousClose: number | null;
  checkedAt: string | null;
};
export type DailyCryptoQuotes = Record<
  string,
  { previousClose: number | null; checkedAt: string | null }
>;
export type QuoteResult = {
  market?: Market;
  symbol?: string;
  marketCode?: string;
  exchange?: string | null;
  price: number | null;
  previousClose?: number | null;
  checkedAt?: string | null;
  error?: string;
};

export const DAILY_QUOTE_CACHE_MS = 5 * 60 * 1000;

export function dailyStockQuotesFrom(quotes: QuoteResult[]): DailyStockQuote[] {
  return quotes
    .filter(
      (quote): quote is QuoteResult & { market: Market; symbol: string } =>
        (quote.market === "KR" || quote.market === "US") &&
        typeof quote.symbol === "string",
    )
    .map((quote) => ({
      market: quote.market,
      symbol: quote.symbol,
      exchange: quote.exchange ?? null,
      previousClose: quote.previousClose ?? null,
      checkedAt: quote.checkedAt ?? null,
    }));
}

export function dailyCryptoQuotesFrom(quotes: QuoteResult[]): DailyCryptoQuotes {
  return Object.fromEntries(
    quotes
      .filter((quote) => typeof quote.marketCode === "string")
      .map((quote) => [
        quote.marketCode!,
        {
          previousClose: quote.previousClose ?? null,
          checkedAt: quote.checkedAt ?? null,
        },
      ]),
  );
}

export function quoteRefreshNotice(quotes: QuoteResult[]) {
  const count = quotes.filter((quote) => quote.price !== null).length;
  const firstError = quotes.find((quote) => quote.error)?.error;
  return {
    firstError,
    notice: `${count}개 자산의 시세를 갱신했습니다.${quotes.length > count ? ` ${quotes.length - count}개는 조회되지 않았습니다.` : ""}${firstError ? ` ${firstError}` : ""}`,
  };
}

// Without a previous close the daily change cannot be shown, so retry every
// minute; otherwise refresh every five minutes, shared across tabs of a session.
export function quoteRefreshDue(
  now: number,
  lastAttemptAt: number,
  sharedAttemptAt: number,
  hasDailyQuotes: boolean,
) {
  const last = hasDailyQuotes
    ? Math.max(lastAttemptAt, sharedAttemptAt)
    : lastAttemptAt;
  return now - last >= (hasDailyQuotes ? 5 : 1) * 60 * 1000;
}
