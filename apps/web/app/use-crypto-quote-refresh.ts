"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CryptoQuote } from "./quote-refresh";

const MIN_INTERVAL_MS = 55_000;

/**
 * Polls Bithumb KRW prices every minute while the page is visible. The stock
 * quote refresh also fetches crypto prices, so polling waits while it runs and
 * counts it as the latest fetch.
 */
export function useCryptoQuoteRefresh({
  enabled,
  stockRefreshing,
  onQuotes,
}: {
  enabled: boolean;
  stockRefreshing: boolean;
  onQuotes: (quotes: CryptoQuote[]) => void;
}) {
  const [cryptoRefreshing, setCryptoRefreshing] = useState(false);
  const [cryptoRefreshError, setCryptoRefreshError] = useState("");
  const inFlight = useRef(false);
  const lastFetchAt = useRef(0);
  const onQuotesRef = useRef(onQuotes);
  useEffect(() => {
    onQuotesRef.current = onQuotes;
  });
  useEffect(() => {
    if (stockRefreshing) lastFetchAt.current = Date.now();
  }, [stockRefreshing]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function refreshCrypto() {
      if (
        document.visibilityState !== "visible" ||
        stockRefreshing ||
        inFlight.current ||
        Date.now() - lastFetchAt.current < MIN_INTERVAL_MS
      )
        return;
      inFlight.current = true;
      setCryptoRefreshing(true);
      lastFetchAt.current = Date.now();
      try {
        const response = await fetch("/api/crypto/quotes", { method: "POST" });
        const payload = (await response.json()) as {
          quotes?: CryptoQuote[];
          message?: string;
        };
        if (!response.ok || !payload.quotes)
          throw new Error(payload.message || "빗썸 시세 조회 실패");
        if (active) {
          onQuotesRef.current(payload.quotes);
          setCryptoRefreshError(
            payload.quotes.some((quote) => quote.price === null)
              ? "일부 빗썸 시세를 확인하지 못했습니다"
              : "",
          );
        }
      } catch (error) {
        if (active)
          setCryptoRefreshError(
            error instanceof Error ? error.message : "빗썸 시세 조회 실패",
          );
      } finally {
        inFlight.current = false;
        setCryptoRefreshing(false);
      }
    }
    void refreshCrypto();
    const timer = window.setInterval(() => void refreshCrypto(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, stockRefreshing]);

  /** Lets the next poll run immediately, e.g. after a new coin is saved. */
  const invalidateCryptoQuotes = useCallback(() => {
    lastFetchAt.current = 0;
  }, []);

  return { cryptoRefreshing, cryptoRefreshError, invalidateCryptoQuotes };
}
