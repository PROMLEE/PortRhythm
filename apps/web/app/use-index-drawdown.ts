"use client";

import { useEffect, useState } from "react";
import type { DrawdownIndex, IndexDrawdown } from "./drawdown";

export type IndexDrawdownState = {
  data: IndexDrawdown | null;
  error: string | null;
  loading: boolean;
};

/** Loads the 52-week drawdown for the selected index; pass null to skip. */
export function useIndexDrawdown(index: DrawdownIndex | null): IndexDrawdownState {
  const [state, setState] = useState<IndexDrawdownState & { index: DrawdownIndex | null }>({
    index: null,
    data: null,
    error: null,
    loading: false,
  });
  useEffect(() => {
    if (!index) return;
    const controller = new AbortController();
    setState({ index, data: null, error: null, loading: true });
    fetch(`/api/market-data/index-drawdown?index=${index}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { drawdown?: IndexDrawdown; message?: string };
        if (!response.ok || !body.drawdown) throw new Error(body.message || "지수 시세를 받지 못했습니다.");
        setState({ index, data: body.drawdown, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ index, data: null, error: error instanceof Error ? error.message : "지수 시세를 받지 못했습니다.", loading: false });
      });
    return () => controller.abort();
  }, [index]);
  if (!index || state.index !== index) return { data: null, error: null, loading: Boolean(index) };
  return { data: state.data, error: state.error, loading: state.loading };
}
