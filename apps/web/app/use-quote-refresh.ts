"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Holding } from "./holdings";
import {
  DAILY_QUOTE_CACHE_MS,
  dailyCryptoQuotesFrom,
  dailyStockQuotesFrom,
  quoteRefreshDue,
  quoteRefreshNotice,
  type DailyCryptoQuotes,
  type DailyStockQuote,
  type QuoteResult,
} from "./quote-refresh";

export function useQuoteRefresh({
  userId,
  authenticated,
  active,
  onHoldings,
  onNotice,
}: {
  userId: string;
  authenticated: boolean;
  /** Automatic refresh runs only while a screen that shows prices is open. */
  active: boolean;
  onHoldings: (rows: Holding[]) => void;
  onNotice: (message: string) => void;
}) {
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteVersion, setQuoteVersion] = useState(0);
  const [dailyStockQuotes, setDailyStockQuotes] = useState<DailyStockQuote[]>(
    [],
  );
  const [dailyCryptoQuotes, setDailyCryptoQuotes] = useState<DailyCryptoQuotes>(
    {},
  );
  const inFlight = useRef(false);
  const lastAttemptAt = useRef(0);
  const callbacks = useRef({ onHoldings, onNotice });
  useEffect(() => {
    callbacks.current = { onHoldings, onNotice };
  });
  const refreshKey = `pf-quote-refresh:${userId}`;
  const dailyKey = `pf-daily-quotes:v2:${userId}`;

  useEffect(() => {
    if (!authenticated) return;
    try {
      const cached = JSON.parse(sessionStorage.getItem(dailyKey) ?? "null") as {
        savedAt: number;
        quotes: DailyStockQuote[];
      } | null;
      if (
        cached &&
        Date.now() - cached.savedAt < DAILY_QUOTE_CACHE_MS &&
        Array.isArray(cached.quotes)
      )
        setDailyStockQuotes(cached.quotes);
    } catch {
      // Fresh quotes will be fetched when session storage is unavailable.
    }
  }, [authenticated, dailyKey]);

  const refreshQuotes = useCallback(
    async (silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastAttemptAt.current = Date.now();
      try {
        sessionStorage.setItem(refreshKey, String(Date.now()));
      } catch {
        // Private browsing may disable storage; the in-flight guard still applies.
      }
      setQuoteBusy(true);
      setQuoteError("");
      if (!silent) callbacks.current.onNotice("시세를 조회하는 중입니다.");
      try {
        const response = await fetch("/api/quotes", { method: "POST" });
        const result = (await response.json()) as {
          holdings: Holding[];
          quotes: QuoteResult[];
          message?: string;
        };
        if (!response.ok)
          throw new Error(result.message || "요청에 실패했습니다.");
        callbacks.current.onHoldings(result.holdings);
        const daily = dailyStockQuotesFrom(result.quotes);
        setDailyStockQuotes(daily);
        setDailyCryptoQuotes(dailyCryptoQuotesFrom(result.quotes));
        try {
          sessionStorage.setItem(
            dailyKey,
            JSON.stringify({ savedAt: Date.now(), quotes: daily }),
          );
        } catch {
          // A fresh API response is still available in memory.
        }
        setQuoteVersion((version) => version + 1);
        const { firstError, notice } = quoteRefreshNotice(result.quotes);
        if (firstError) setQuoteError(firstError);
        if (!silent) callbacks.current.onNotice(notice);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "시세를 조회하지 못했습니다.";
        setQuoteError(message);
        if (!silent) callbacks.current.onNotice(message);
      } finally {
        setQuoteBusy(false);
        inFlight.current = false;
      }
    },
    [dailyKey, refreshKey],
  );

  const hasDailyQuotes = dailyStockQuotes.some(
    (quote) => quote.previousClose !== null,
  );
  useEffect(() => {
    if (!authenticated || !active) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      let shared = 0;
      try {
        shared = Number(sessionStorage.getItem(refreshKey) ?? 0);
      } catch {
        // Refresh still works when session storage is unavailable.
      }
      if (
        quoteRefreshDue(Date.now(), lastAttemptAt.current, shared, hasDailyQuotes)
      )
        void refreshQuotes(true);
    };
    refreshWhenVisible();
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [authenticated, active, hasDailyQuotes, refreshKey, refreshQuotes]);

  const bumpQuoteVersion = useCallback(
    () => setQuoteVersion((version) => version + 1),
    [],
  );

  return {
    quoteBusy,
    quoteError,
    quoteVersion,
    bumpQuoteVersion,
    dailyStockQuotes,
    dailyCryptoQuotes,
    setDailyCryptoQuotes,
    refreshQuotes,
  };
}
