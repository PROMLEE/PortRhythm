"use client";
import { useEffect, useState } from "react";
import type { MarketSessions } from "./market-sessions";

const REQUEST_TIMEOUT_MS = 12_000;

/** Regular-session status for KR/US markets, refreshed every minute while enabled. */
export function useMarketSession(enabled: boolean, userId: string) {
  const [marketSession, setMarketSession] = useState<MarketSessions | null>(
    null,
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    setMarketSession(null);
    async function refreshSession() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller?.abort(),
        REQUEST_TIMEOUT_MS,
      );
      try {
        const response = await fetch("/api/markets/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Session unavailable");
        const session: MarketSessions = await response.json();
        if (active) setMarketSession(session);
      } catch {
        if (active) setMarketSession(null);
      } finally {
        window.clearTimeout(timeout);
        pending = false;
      }
    }
    void refreshSession();
    const timer = window.setInterval(() => void refreshSession(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setMarketSession(null);
        void refreshSession();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, userId]);
  return marketSession;
}
