import type { Holding, Market } from "./holdings";
import type { DrawdownPlan } from "./drawdown";

export type Bucket = {
  id: string;
  name: string;
  targetPercent: number;
  color: string;
};

export type Rule = {
  id: string;
  bucketId: string;
  market: Market;
  symbol: string;
  exchange: string | null;
  name: string;
  manualPrice: number | null;
  quotedPrice: number | null;
  quoteCheckedAt: string | null;
};

export type ManualAsset = {
  readOnly?: boolean;
  accountId?: string | null;
  id: string;
  bucketId: string | null;
  name: string;
  valueKrw: number;
  valueUsd: number | null;
  averageFxRate?: number | null;
};

export function manualAssetValueKrw(asset: ManualAsset, usdKrw: number) {
  return asset.valueUsd === null ? asset.valueKrw : asset.valueUsd * usdKrw;
}

export type CryptoAsset = {
  id: string;
  bucketId: string | null;
  marketCode: string;
  name: string;
  quantity: number;
  averageCostKrw: number | null;
  quotedPriceKrw: number | null;
  quoteCheckedAt: string | null;
  lastTradeAt: string | null;
};

export type Assignment = {
  holdingId: string;
  bucketId: string | null;
  source: "auto" | "manual";
};

export type Snapshot = {
  date: string;
  recordedAt?: string | null;
  bucketKey: string;
  bucketName: string;
  valueKrw: number;
  targetPercent: number | null;
  positionSignature: string | null;
};

export function positionSignature(
  holdings: Pick<
    Holding,
    "id" | "market" | "quantity" | "averageCost" | "capturedPrice"
  >[],
  manualAssets: Pick<ManualAsset, "id" | "valueKrw" | "valueUsd">[],
  cryptoAssets: Pick<CryptoAsset, "id" | "quantity" | "averageCostKrw">[],
) {
  const positions = [
    ...holdings.map((asset) => [
      "stock",
      asset.id,
      asset.market,
      asset.quantity,
      asset.averageCost,
      asset.capturedPrice,
    ]),
    ...manualAssets.map((asset) => [
      "manual",
      asset.id,
      asset.valueUsd === null ? "KRW" : "USD",
      asset.valueUsd ?? asset.valueKrw,
    ]),
    ...cryptoAssets.map((asset) => [
      "crypto",
      asset.id,
      asset.quantity,
      asset.averageCostKrw,
    ]),
  ];
  const serialized = JSON.stringify(
    positions.sort((left, right) =>
      `${left[0]}:${left[1]}`.localeCompare(`${right[0]}:${right[1]}`),
    ),
  );
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(serialized)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `v1:${hash.toString(16).padStart(16, "0")}`;
}

export type CashFlow = {
  balanceLinked?: boolean;
  id: string;
  occurredAt?: string | null;
  deletedAt?: string | null;
  date: string;
  amountKrw: number;
  note: string;
};

export type Portfolio = {
  cashRevision?: number;
  includeFxGains?: boolean;
  title: string;
  usdKrw: number;
  usdKrwUpdatedAt: string | null;
  usdKrwMode: "auto" | "manual";
  usdKrwRateDate: string | null;
  tolerancePercent: number;
  toleranceMode?: "percentage-points" | "relative";
  relativeTolerancePercent?: number;
  buckets: Bucket[];
  rules: Rule[];
  manualAssets: ManualAsset[];
  cryptoAssets: CryptoAsset[];
  assignments: Assignment[];
  snapshots: Snapshot[];
  cashFlows: CashFlow[];
  deletedCashFlows?: CashFlow[];
  drawdownPlan?: DrawdownPlan | null;
};

export function holdingValueKrw(holding: Holding, usdKrw: number) {
  const price = holding.currentPrice ?? holding.capturedPrice;
  if (price === null) return 0;
  return holding.quantity * price * (holding.market === "US" ? usdKrw : 1);
}

export function cryptoAssetValueKrw(asset: CryptoAsset) {
  return asset.quantity * (asset.quotedPriceKrw ?? 0);
}

export function holdingBucketId(portfolio: Portfolio, holding: Holding) {
  const assignment = portfolio.assignments.find(
    (item) => item.holdingId === holding.id,
  );
  return assignment?.source === "manual"
    ? assignment.bucketId
    : (portfolio.rules.find(
        (rule) =>
          rule.market === holding.market && rule.symbol === holding.symbol,
      )?.bucketId ?? null);
}

export function portfolioValues(portfolio: Portfolio, holdings: Holding[]) {
  const values = new Map(portfolio.buckets.map((bucket) => [bucket.id, 0]));
  let unassigned = 0;
  let missingPrices = 0;
  for (const holding of holdings) {
    if (holding.currentPrice === null && holding.capturedPrice === null)
      missingPrices++;
    const value = holdingValueKrw(holding, portfolio.usdKrw);
    const bucketId = holdingBucketId(portfolio, holding);
    if (bucketId && values.has(bucketId)) {
      values.set(bucketId, (values.get(bucketId) ?? 0) + value);
    } else {
      unassigned += value;
    }
  }
  for (const asset of portfolio.manualAssets) {
    const value = manualAssetValueKrw(asset, portfolio.usdKrw);
    if (asset.bucketId && values.has(asset.bucketId)) {
      values.set(asset.bucketId, (values.get(asset.bucketId) ?? 0) + value);
    } else {
      unassigned += value;
    }
  }
  for (const asset of portfolio.cryptoAssets) {
    if (asset.quotedPriceKrw === null) missingPrices++;
    const value = cryptoAssetValueKrw(asset);
    if (asset.bucketId && values.has(asset.bucketId)) {
      values.set(asset.bucketId, (values.get(asset.bucketId) ?? 0) + value);
    } else {
      unassigned += value;
    }
  }
  const total =
    [...values.values()].reduce((sum, value) => sum + value, 0) + unassigned;
  return { values, unassigned, total, missingPrices };
}

/** 어느 포트에도 배정되지 않은 자산 개수(주식·직접 입력·가상자산). 가격 유무와 무관하게 개수로 센다. */
export function countUnassignedAssets(
  portfolio: Portfolio,
  holdings: Holding[],
): number {
  const bucketIds = new Set(portfolio.buckets.map((bucket) => bucket.id));
  const isAssigned = (bucketId: string | null) =>
    bucketId !== null && bucketIds.has(bucketId);
  let count = 0;
  for (const holding of holdings) {
    if (!isAssigned(holdingBucketId(portfolio, holding))) count++;
  }
  for (const asset of portfolio.manualAssets) {
    if (!isAssigned(asset.bucketId)) count++;
  }
  for (const asset of portfolio.cryptoAssets) {
    if (!isAssigned(asset.bucketId)) count++;
  }
  return count;
}

export const EXAMPLE_BUCKETS: Omit<Bucket, "id">[] = [
  { name: "미국 지수", targetPercent: 35, color: "#177C88" },
  { name: "한국 지수", targetPercent: 25, color: "#42A994" },
  { name: "우량주", targetPercent: 20, color: "#6986B3" },
  { name: "금", targetPercent: 10, color: "#CBA664" },
  { name: "비트코인", targetPercent: 10, color: "#D88975" },
];

export const EXAMPLE_RULES: {
  bucketIndex: number;
  market: Market;
  symbol: string;
  exchange: string;
  name: string;
}[] = [
  {
    bucketIndex: 0,
    market: "US",
    symbol: "SPY",
    exchange: "AMS",
    name: "SPDR S&P 500",
  },
  {
    bucketIndex: 0,
    market: "US",
    symbol: "QQQ",
    exchange: "NAS",
    name: "Invesco QQQ",
  },
  {
    bucketIndex: 1,
    market: "KR",
    symbol: "069500",
    exchange: "KOSPI",
    name: "KODEX 200",
  },
  {
    bucketIndex: 2,
    market: "KR",
    symbol: "005930",
    exchange: "KOSPI",
    name: "삼성전자",
  },
  {
    bucketIndex: 2,
    market: "KR",
    symbol: "000660",
    exchange: "KOSPI",
    name: "SK하이닉스",
  },
  {
    bucketIndex: 2,
    market: "US",
    symbol: "MSFT",
    exchange: "NAS",
    name: "마이크로소프트",
  },
  {
    bucketIndex: 2,
    market: "US",
    symbol: "GOOGL",
    exchange: "NAS",
    name: "알파벳 A",
  },
  {
    bucketIndex: 3,
    market: "KR",
    symbol: "411060",
    exchange: "KOSPI",
    name: "ACE KRX금현물",
  },
];

const START_MARKETS: Market[] = ["KR", "US"];
const START_MARKET_NAMES: Record<Market, string> = { KR: "국내 주식", US: "미국 주식" };

/** 보유 종목이 있는 시장마다 시작 포트를 만든다. 비중은 균등하고, 나눠 떨어지지 않는 나머지는 첫 포트에 넣는다. */
export function holdingStartBuckets(
  holdings: { market: Market }[],
): { market: Market; name: string; targetPercent: number }[] {
  const markets = START_MARKETS.filter((market) =>
    holdings.some((holding) => holding.market === market),
  );
  if (markets.length === 0) return [];
  const share = Math.floor(100 / markets.length);
  return markets.map((market, index) => ({
    market,
    name: START_MARKET_NAMES[market],
    targetPercent: index === 0 ? 100 - share * (markets.length - 1) : share,
  }));
}

/** 종목 배정 select의 옵션 라벨. 자동 배정은 종목코드 규칙이 가리키는 포트 이름을 붙인다. */
export function allocationOptionLabel(
  option: "auto" | "unassigned" | "bucket",
  bucketName?: string | null,
): string {
  if (option === "auto") return `자동 배정 · ${bucketName || "미분류"}`;
  if (option === "unassigned") return "미분류";
  return bucketName || "미분류";
}

/** 리밸런싱 대상 자산 수(보유 주식 + 가상자산 + 현금·직접 입력). 목표가 없으면 보유 주식만 센다. 0이면 리밸런싱 빈 상태를 보인다. */
export function evaluationAssetCount(
  portfolio: Pick<Portfolio, "cryptoAssets" | "manualAssets"> | null,
  holdingCount: number,
): number {
  return (
    holdingCount +
    (portfolio ? portfolio.cryptoAssets.length + portfolio.manualAssets.length : 0)
  );
}

/** 저장 후 알림 버튼 목적지. 첫 저장이고 보유 자산이 없으면 캡처 가져오기, 미분류 자산이 있으면 자산 배정. */
export function savedNoticeTarget(input: {
  firstSave: boolean;
  holdingCount: number;
  unassigned: number;
  screen: string;
}): "import" | "allocation" | null {
  if (input.firstSave && input.holdingCount === 0) return "import";
  if (input.unassigned > 0 && input.screen !== "allocation") return "allocation";
  return null;
}

const TARGET_TOTAL_EPSILON = 0.01;

/**
 * 목표 비중 합계 상태. 0.1% 단위 입력의 부동소수점 오차(예: 99.99999999999999)를 100%로 본다.
 * 저장 검증(클라이언트·API)과 같은 허용 범위를 쓴다.
 */
export function targetTotalStatus(buckets: Pick<Bucket, "targetPercent">[]): {
  total: number;
  balanced: boolean;
  /** 100%까지 남은 %p. 초과면 음수. */
  remaining: number;
  label: string;
  message: string;
} {
  const raw = buckets.reduce((sum, bucket) => sum + bucket.targetPercent, 0);
  const balanced = Math.abs(raw - 100) <= TARGET_TOTAL_EPSILON;
  const total = balanced ? 100 : raw;
  const remaining = balanced ? 0 : 100 - raw;
  const digits = !balanced && Math.abs(remaining) < 0.1 ? 2 : 1;
  const label = `목표 합계 ${total.toFixed(digits)}%`;
  const gap = Math.abs(remaining).toFixed(digits);
  const message = balanced
    ? `${label} · 저장할 수 있습니다.`
    : remaining > 0
      ? `${label} · ${gap}%p가 남았습니다. 100%로 맞춰야 저장할 수 있습니다.`
      : `${label} · ${gap}%p 초과했습니다. 100%로 맞춰야 저장할 수 있습니다.`;
  return { total, balanced, remaining, label, message };
}

/** 가격을 확인하지 못한 주식·가상자산 이름. portfolioValues의 missingPrices와 같은 기준이다. */
export function missingPriceAssetNames(
  portfolio: Pick<Portfolio, "cryptoAssets">,
  holdings: Pick<Holding, "name" | "symbol" | "currentPrice" | "capturedPrice">[],
): string[] {
  const names: string[] = [];
  for (const holding of holdings) {
    if (holding.currentPrice === null && holding.capturedPrice === null)
      names.push(holding.name || holding.symbol);
  }
  for (const asset of portfolio.cryptoAssets) {
    if (asset.quotedPriceKrw === null) names.push(asset.name || asset.marketCode);
  }
  return [...new Set(names)];
}

/** 리밸런싱을 막는 가격 미확인 안내. 앞의 3개 이름만 보이고 나머지는 개수로 줄인다. */
export function missingPriceMessage(names: string[]): string {
  if (names.length === 0) return "";
  const shown = names.slice(0, 3).join(", ");
  const rest = names.length > 3 ? ` 외 ${names.length - 3}개` : "";
  return `${shown}${rest}의 가격을 확인하지 못해 추천을 계산할 수 없습니다. 시세를 다시 불러온 뒤에도 남으면 종목 코드를 확인해 주세요.`;
}
