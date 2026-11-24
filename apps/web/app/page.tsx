"use client";
import { stockGains } from "./fx-gains";

import { withPreviousQuotes } from "./holdings";

import NumberInput from "./NumberInput";
import EditableHoldingRow from "./EditableHoldingRow";
import HoldingPositionRow from "./HoldingPositionRow";

import {
  ChangeEvent,
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import {
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Coins,
  ArrowLeftRight,
  FileUp,
  LayoutDashboard,
  ChartNoAxesCombined,
  Landmark,
  SquarePen,
  Target,
  Network,
  History,
  SlidersHorizontal,
  UserRound,
  Menu,
  Megaphone,
  Moon,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import {
  Holding,
  Market,
  RecognizedHolding,
  recognizeHoldings,
} from "./holdings";
import PortfolioBuilder, { stockAssetId, type AssetSelection, type NoticeAction } from "./PortfolioBuilder";
import UserGuide from "./UserGuide";
import AccountsManager from "./AccountsManager";
import {useMeritzSync} from "./use-meritz-sync";
import { useQuoteRefresh } from "./use-quote-refresh";
import {publishTradePortfolio} from "./portfolio-cache";
import { isBuilderView, navigationNeedsConfirm, protectUnsavedChanges, shouldConfirmNavigation } from "./unsaved-changes";
import AccountSettings from "./AccountSettings";
import ServiceNotices from "./ServiceNotices";
import { detachPushOnLogout } from "./PushSettings";
import { noticeReturnPath } from "../lib/notice-link";
import ProfileAvatar from "./ProfileAvatar";
import HoldingTradeEditor from "./HoldingTradeEditor";
import AssetSortSelect, { compareAssets, isAssetSort, type AssetSort } from "./asset-sort";
import styles from "./page.module.css";

type View =
  | "portfolio"
  | "holdings"
  | "accounts"
  | "edit"
  | "strategy"
  | "composition"
  | "allocation"
  | "rebalance"
  | "history"
  | "import"
  | "more"
  | "detail"
  | "settings"
  | "preferences"
  | "guide"
  | "notices";
const VIEWS: readonly View[] = [
  "portfolio", "holdings", "accounts", "edit", "strategy", "composition", "allocation",
  "rebalance", "history", "import", "more", "detail", "settings", "preferences", "guide", "notices",
];

function screenUrl(next: View, asset: AssetSelection | null, source: string, noticeId: string | null = null) {
  const url = new URL(window.location.href);
  if (next === "portfolio") url.searchParams.delete("view");
  else url.searchParams.set("view", next);
  if (next === "notices" && noticeId) url.searchParams.set("notice", noticeId);
  else url.searchParams.delete("notice");
  for (const key of ["asset", "kind", "source"]) url.searchParams.delete(key);
  if (next === "detail" && asset) {
    url.searchParams.set("asset", asset.id);
    url.searchParams.set("kind", asset.kind);
    url.searchParams.set("source", source);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
type Instrument = {
  market: Market;
  symbol: string;
  name: string;
  exchange: string | null;
};
const won = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (value: number, market: Market) =>
  market === "KR" ? `${won.format(value)}원` : `$${dollars.format(value)}`;
const signedPercent = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const signedMoney = (value: number, market: Market) =>
  `${value > 0 ? "+" : ""}${money(value, market)}`;

async function data<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(result.message || "요청에 실패했습니다.");
  return result;
}

export default function PortfolioPage() {
  const [operator, setOperator] = useState(false);
  const { data: session, status: authStatus } = useSession();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<View>("portfolio");
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const [assetSort, setAssetSort] = useState<AssetSort>("value-desc");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`pf-asset-sort:${session?.user?.appUserId ?? "account"}`);
      setAssetSort(isAssetSort(saved) ? saved : "value-desc");
    } catch { /* Use the default when browser storage is unavailable. */ }
  }, [session?.user?.appUserId]);
  function chooseAssetSort(next: AssetSort) {
    setAssetSort(next);
    try { localStorage.setItem(`pf-asset-sort:${session?.user?.appUserId ?? "account"}`, next); } catch { /* Keep sorting for this visit. */ }
  }
  const [showStartGuide, setShowStartGuide] = useState(false);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    try {
      setShowStartGuide(localStorage.getItem(`pf-guide-dismissed:${session?.user?.appUserId ?? "account"}`) !== "1");
    } catch { setShowStartGuide(true); }
  }, [authStatus, session?.user?.appUserId]);

  function dismissStartGuide() {
    setShowStartGuide(false);
    try { localStorage.setItem(`pf-guide-dismissed:${session?.user?.appUserId ?? "account"}`, "1"); } catch { /* Dismiss for this visit when storage is unavailable. */ }
  }
  const [selectedAsset, setSelectedAsset] = useState<AssetSelection | null>(null);
  const [detailSource, setDetailSource] = useState<"portfolio" | "holdings" | "accounts" | "rebalance" | "edit">("portfolio");
  const rebalanceScroll = useRef(0);
  const previousView = useRef<View>("portfolio");
  useEffect(() => {
    const returning = previousView.current === "detail" && view === "rebalance" && detailSource === "rebalance";
    previousView.current = view;
    if (returning) {
      const frame = requestAnimationFrame(() => window.scrollTo({top:rebalanceScroll.current, behavior:"instant"}));
      return () => cancelAnimationFrame(frame);
    }
  }, [view, detailSource]);
  const [editFocus, setEditFocus] = useState<AssetSelection | null>(null);
  const [portfolioDirty, setPortfolioDirty] = useState(false);
  const [builderDirty, setBuilderDirty] = useState({ draft: false, screen: false });
  const [hasSavedPortfolio, setHasSavedPortfolio] = useState<boolean | null>(null);
  const navigationState = useRef({
    view: "portfolio" as View,
    url: "",
    draftDirty: false,
    otherDirty: false,
  });


  useEffect(() => {
    function requestedView(params: URLSearchParams): View {
      const requested = params.get("view") as View;
      let next: View = VIEWS.includes(requested) ? requested : "portfolio";
      const noticeId = params.get("notice");
      if (noticeId && (!requested || requested === "notices")) next = "notices";
      const id = params.get("asset");
      const kind = params.get("kind");
      const hasAsset = Boolean(id && (kind === "stock" || kind === "crypto" || kind === "manual" || kind === "candidate"));
      if (next === "detail" && !hasAsset) next = "holdings";
      return next;
    }
    function restoreScreen() {
      const params = new URLSearchParams(window.location.search);
      const next = requestedView(params);
      const noticeId = params.get("notice");
      setSelectedNoticeId(next === "notices" ? noticeId : null);
      const id = params.get("asset");
      const kind = params.get("kind");
      const asset: AssetSelection | null = id && (kind === "stock" || kind === "crypto" || kind === "manual" || kind === "candidate")
        ? { id, kind } : null;
      setSelectedAsset(asset);
      setDetailSource(params.get("source") === "edit" ? "edit" : params.get("source") === "rebalance" ? "rebalance" : params.get("source") === "accounts" ? "accounts" : params.get("source") === "holdings" ? "holdings" : "portfolio");
      setView(next);
      navigationState.current.view = next;
      setEditFocus(null);
      setEditingHoldingId(null);
      setNotice("");
      setNoticeAction(null);
      navigationState.current.url = window.location.href;
    }
    function onHistoryChange() {
      const from = navigationState.current.view;
      const to = requestedView(new URLSearchParams(window.location.search));
      if (
        navigationNeedsConfirm({
          from,
          to,
          draftDirty: navigationState.current.draftDirty,
          otherDirty: navigationState.current.otherDirty,
        }) &&
        !window.confirm("저장하지 않은 변경 사항을 버리고 이동할까요?")
      ) {
        window.history.pushState(null, "", navigationState.current.url);
        return;
      }
      if (from !== to) {
        setPortfolioDirty(false);
        setBuilderDirty((state) => ({
          draft: isBuilderView(from) && isBuilderView(to) ? state.draft : false,
          screen: false,
        }));
      }
      restoreScreen();
    }
    restoreScreen();
    window.addEventListener("popstate", onHistoryChange);
    return () => window.removeEventListener("popstate", onHistoryChange);
  }, []);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeAction, setNoticeAction] = useState<NoticeAction | null>(null);
  const showNotice = useCallback((text: string, action: NoticeAction | null = null) => {
    setNotice(text);
    setNoticeAction(action);
  }, []);
  const [broker, setBroker] = useState("메리츠");
  const [account, setAccount] = useState("기본 계좌");
  const [market, setMarket] = useState<Market>("US");
  const [draft, setDraft] = useState<RecognizedHolding[]>([]);
  const [captureName, setCaptureName] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | Market>("ALL");
  const [search, setSearch] = useState("");
  const [legacy, setLegacy] = useState<Holding[]>([]);
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
  const [instrumentMatches, setInstrumentMatches] = useState<
    Record<number, Instrument[]>
  >({});
  const [savedInstrumentMatches, setSavedInstrumentMatches] = useState<
    Record<string, Instrument[]>
  >({});
  const [savedResolvingId, setSavedResolvingId] = useState<string | null>(null);
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [holdingQuantity, setHoldingQuantity] = useState("");
  const [holdingCost, setHoldingCost] = useState("");
  const [holdingSaving, setHoldingSaving] = useState(false);
  const [holdingTradeMode, setHoldingTradeMode] = useState(true);
  const [holdingTradeDirty, setHoldingTradeDirty] = useState(false);
  const [assetAddOpen, setAssetAddOpen] = useState(false);
  const [deletingHoldingId, setDeletingHoldingId] = useState<string | null>(null);
  const [pendingHoldingRemoval, setPendingHoldingRemoval] = useState<string | null>(null);
  const editedHolding = holdings.find(row => row.id === editingHoldingId);
  const holdingDirty = Boolean(view === "edit" && !holdingTradeMode && editedHolding && (holdingQuantity !== String(editedHolding.quantity) || holdingCost !== (editedHolding.averageCost === null ? "" : String(editedHolding.averageCost))));
  const otherDirty = portfolioDirty || builderDirty.screen || holdingDirty || holdingTradeDirty || (view === "import" && draft.length > 0);
  const unsavedChanges = portfolioDirty || builderDirty.draft || builderDirty.screen || holdingDirty || holdingTradeDirty || (view === "import" && draft.length > 0);
  const {
    quoteBusy,
    quoteError,
    quoteVersion,
    bumpQuoteVersion,
    dailyStockQuotes,
    dailyCryptoQuotes,
    setDailyCryptoQuotes,
    refreshQuotes,
  } = useQuoteRefresh({
    userId: session?.user?.appUserId ?? "account",
    authenticated: authStatus === "authenticated",
    active: holdings.length > 0 && (view === "portfolio" || view === "holdings"),
    onHoldings: (rows) =>
      setHoldings((current) => withPreviousQuotes(current, rows)),
    onNotice: setNotice,
  });
  const meritzSync = useMeritzSync({
    userId: session?.user?.appUserId ?? "", authenticated: authStatus === "authenticated",
    paused: loading || busy || quoteBusy || unsavedChanges || view === "edit" || view === "detail" || view === "import",
    onApplied: result => {
      setHoldings(current => withPreviousQuotes(result.holdings,current));
      publishTradePortfolio(result.portfolio, "");
    },
  });
  useEffect(() => {
    navigationState.current.draftDirty = builderDirty.draft;
    navigationState.current.otherDirty = otherDirty;
  }, [builderDirty.draft, otherDirty]);
  useEffect(() => protectUnsavedChanges(window, unsavedChanges), [unsavedChanges]);

  const [localAdminOpen, setLocalAdminOpen] = useState(false);
  const [localAdminName, setLocalAdminName] = useState("");
  const [localAdminPassword, setLocalAdminPassword] = useState("");
  const [localAdminBusy, setLocalAdminBusy] = useState(false);
  const [localAdminError, setLocalAdminError] = useState("");

  async function signInLocalAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalAdminBusy(true);
    setLocalAdminError("");
    try {
      const result = await signIn("local-admin", {
        redirect: false,
        username: localAdminName,
        password: localAdminPassword,
        callbackUrl: noticeReturnPath(window.location.href),
      });
      setLocalAdminPassword("");
      if (!result?.ok) {
        setLocalAdminError("아이디 또는 비밀번호를 확인해 주세요.");
        return;
      }
      window.location.reload();
    } catch {
      setLocalAdminError("로컬 관리자 로그인에 실패했습니다.");
    } finally {
      setLocalAdminBusy(false);
    }
  }

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem("pf-theme") === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = saved;
      setTheme(saved);
    } catch {
      document.documentElement.dataset.theme = "light";
      setTheme("light");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pf-theme", next);
    } catch {
      // The switch still works when storage is unavailable.
    }
  }

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let active = true;
    try {
      const previous = JSON.parse(
        localStorage.getItem("pf-holdings-v1") ?? "[]",
      ) as Holding[];
      if (Array.isArray(previous)) setLegacy(previous);
    } catch {
      /* Ignore invalid data from an older local version. */
    }
    setLoading(true);
    fetch("/api/holdings", { cache: "no-store" })
      .then((response) => data<{ holdings: Holding[] }>(response))
      .then((result) => {
        if (active) setHoldings(result.holdings);
      })
      .catch((error) => {
        if (active)
          setNotice(
            error instanceof Error
              ? error.message
              : "자산을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authStatus]);

  const [fxSettings,setFxSettings]=useState({enabled:false,rate:1400});
  useEffect(()=>{let active=true;if(authStatus === "authenticated" && view === "holdings")void fetch("/api/portfolio",{cache:"no-store"}).then(r=>r.json()).then(p=>{if(active)setFxSettings({enabled:Boolean(p.portfolio?.includeFxGains),rate:p.portfolio?.usdKrw??1400});}).catch(()=>{});return()=>{active=false;};},[authStatus,view,session?.user?.appUserId]);
  const fxEnabled=fxSettings.enabled && view === "holdings";
  const valueOf=(row:Holding)=>(row.currentPrice??row.capturedPrice??0)*row.quantity*(row.market === "US" && fxEnabled?fxSettings.rate:1);
  const gainOf=(row:Holding)=>fxEnabled?stockGains(row,fxSettings.rate,true).gain:row.averageCost===null || (row.currentPrice??row.capturedPrice)===null?null:((row.currentPrice??row.capturedPrice)!-row.averageCost)*row.quantity;
  const gainPercentOf=(row:Holding)=>fxEnabled?stockGains(row,fxSettings.rate,true).percent:gainOf(row)===null || !row.averageCost || !row.quantity?null:gainOf(row)!/(row.quantity*row.averageCost)*100;
  const gainCurrency=(market:Market):Market=>market === "US" && fxEnabled?"KR":market;
  const totals = useMemo(
    () =>
      holdings.reduce(
        (sum, row) => {
          sum[row.market] += valueOf(row);
          if (row.currentPrice !== null) sum.quoted++;
          if (row.currentPrice === null && row.capturedPrice === null)
            sum.missing++;
          const gain = gainOf(row);
          if (gain !== null) {
            sum.gain[row.market] += gain;
            sum.cost[row.market] += fxEnabled?stockGains(row,fxSettings.rate,true).cost??0:row.quantity*row.averageCost!;
            sum.costKnown[row.market]++;
          }
          return sum;
        },
        {
          KR: 0,
          US: 0,
          quoted: 0,
          missing: 0,
          gain: { KR: 0, US: 0 },
          cost: { KR: 0, US: 0 },
          costKnown: { KR: 0, US: 0 },
        },
      ),
    [holdings,fxEnabled,fxSettings],
  );

  const holdingsEmpty = view === "holdings" && !loading && holdings.length === 0;
  const shown = useMemo(
    () =>
      holdings
        .filter((row) => filter === "ALL" || row.market === filter)
        .filter((row) =>
          `${row.name} ${row.symbol} ${row.broker} ${row.account}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) => {
            // KRW and USD amounts are ranked within their own markets.
            const monetary = assetSort.startsWith("value") || assetSort.startsWith("gain");
            return (monetary ? a.market.localeCompare(b.market) : 0) || compareAssets(
              { name: a.name, value: (a.currentPrice ?? a.capturedPrice) === null ? null : valueOf(a), gain: gainOf(a), gainPercent: gainPercentOf(a) },
              { name: b.name, value: (b.currentPrice ?? b.capturedPrice) === null ? null : valueOf(b), gain: gainOf(b), gainPercent: gainPercentOf(b) },
              assetSort,
            );
          },
        ),
    [holdings, filter, search, assetSort,fxEnabled,fxSettings],
  );

  function go(
    next: View,
    asset = selectedAsset,
    source = detailSource,
    noticeId: string | null = null,
    options: { skipConfirm?: boolean } = {},
  ) {
    if (
      shouldConfirmNavigation({ from: view, to: next, draftDirty: builderDirty.draft, otherDirty, skipConfirm: options.skipConfirm }) &&
      !window.confirm("저장하지 않은 변경 사항을 버리고 이동할까요?")
    )
      return;
    if (next !== view) {
      setPortfolioDirty(false);
      setBuilderDirty((state) => ({
        draft: isBuilderView(view) && isBuilderView(next) ? state.draft : false,
        screen: false,
      }));
    }
    if (next !== "edit") {
      setEditFocus(null);
      setEditingHoldingId(null);
    }
    setView(next);
    navigationState.current.view = next;
    setSelectedNoticeId(next === "notices" ? noticeId : null);
    const url = screenUrl(next, asset, source, noticeId);
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState(null, "", url);
    }
    navigationState.current.url = window.location.href;
    if (next !== view || (next === "notices" && noticeId !== selectedNoticeId)) window.scrollTo({ top: 0, behavior: "instant" });
    setNotice("");
    setNoticeAction(null);
  }

  function openAsset(asset: AssetSelection, source: "portfolio" | "holdings" | "accounts" | "rebalance" | "edit") {
    if (view === "rebalance") rebalanceScroll.current = window.scrollY;
    setSelectedAsset(asset);
    setDetailSource(source);
    go("detail", asset, source);
  }


  useEffect(() => {
    if (view !== "edit" || !editingHoldingId) return;
    requestAnimationFrame(() => document.getElementById(`edit-stock-${editingHoldingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [view, editingHoldingId]);

  async function importCapture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("이미지를 선택해 주세요.");
      return;
    }
    setBusy(true);
    setDraft([]);
    setCaptureName(file.name);
    setNotice("이미지를 읽는 중입니다. 첫 실행에는 언어 파일을 내려받습니다.");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["kor", "eng"]);
      let text = "";
      try {
        text = (await worker.recognize(file)).data.text;
      } finally {
        await worker.terminate();
      }
      const mirae = text.includes("미래에셋증권");
      if (mirae) {
        setBroker("미래에셋");
        setAccount("전체 계좌");
        setMarket("KR");
      }
      const found = recognizeHoldings(text, mirae ? "KR" : market);
      setDraft(found);
      setNotice(
        found.length
          ? `${found.length}개 종목을 찾았습니다. ${mirae ? "CMA/RP와 퇴직신탁은 제외했습니다. 평가금액에서 주당 가격을 계산했습니다. " : ""}저장 전 종목명·코드·수량·가격을 확인하세요.`
          : "종목을 찾지 못했습니다. 화면 종류를 확인하거나 직접 추가해 주세요.",
      );
    } catch {
      setNotice("이미지를 읽지 못했습니다. 직접 종목을 추가할 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }

  function editDraft(
    index: number,
    key: keyof RecognizedHolding,
    value: string,
  ) {
    setDraft((rows) =>
      rows.map((row, position) =>
        position !== index
          ? row
          : {
              ...row,
              ...(key === "name" ? { symbol: "", exchange: null } : {}),
              ...(key === "symbol" ? { exchange: null } : {}),
              [key]:
                key === "quantity"
                  ? Number(value)
                  : key === "capturedPrice" || key === "averageCost"
                    ? value === ""
                      ? null
                      : Number(value)
                    : value,
            },
      ),
    );
  }

  function useInstrument(index: number, instrument: Instrument) {
    setDraft((rows) =>
      rows.map((row, position) =>
        position === index
          ? {
              ...row,
              name: instrument.name,
              symbol: instrument.symbol,
              exchange: instrument.exchange,
            }
          : row,
      ),
    );
    setInstrumentMatches((current) => ({ ...current, [index]: [] }));
    setNotice(
      `${instrument.name} · ${instrument.symbol}${instrument.exchange ? ` (${instrument.exchange})` : ""} 코드로 확인했습니다.`,
    );
  }

  async function resolveInstrument(index: number) {
    const row = draft[index];
    if (!row) return;
    const query = (row.symbol || row.name).trim();
    if (!query) {
      setNotice("종목명 또는 티커를 입력한 뒤 코드 찾기를 눌러 주세요.");
      return;
    }
    setResolvingIndex(index);
    try {
      const result = await data<{ instruments: Instrument[] }>(
        await fetch(
          `/api/instruments?market=${row.market}&query=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        ),
      );
      if (result.instruments.length === 1) {
        useInstrument(index, result.instruments[0]);
      } else if (result.instruments.length > 1) {
        setInstrumentMatches((current) => ({
          ...current,
          [index]: result.instruments,
        }));
        setNotice("후보를 골라 종목 코드를 확정해 주세요.");
      } else {
        setInstrumentMatches((current) => ({ ...current, [index]: [] }));
        setNotice(
          "한국투자증권 종목 마스터에서 일치하는 종목을 찾지 못했습니다.",
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "종목 코드를 찾지 못했습니다.",
      );
    } finally {
      setResolvingIndex(null);
    }
  }

  async function applySavedInstrument(row: Holding, instrument: Instrument) {
    try {
      const result = await data<{ holdings: Holding[] }>(
        await fetch("/api/holdings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            market: row.market,
            name: instrument.name,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
          }),
        }),
      );
      setHoldings(result.holdings);
      bumpQuoteVersion();
      setSavedInstrumentMatches((current) => ({ ...current, [row.id]: [] }));
      setNotice(
        `${instrument.name} · ${instrument.symbol} 코드를 저장했습니다.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "종목 코드를 저장하지 못했습니다.",
      );
    } finally {
      setSavedResolvingId(null);
    }
  }

  function beginHoldingEdit(row: Holding) {
    if (row.readOnly) return;
    setPendingHoldingRemoval(null);
    setHoldingTradeMode(true);
    setEditingHoldingId(row.id);
    setHoldingQuantity(String(row.quantity));
    setHoldingCost(row.averageCost === null ? "" : String(row.averageCost));
  }

  async function saveHoldingAmounts() {
    if (!editingHoldingId) return;
    const quantity = Number(holdingQuantity);
    const averageCost = holdingCost.trim() === "" ? null : Number(holdingCost);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      Math.abs(quantity - Math.round(quantity * 1e6) / 1e6) > 1e-9 ||
      (averageCost !== null &&
        (!Number.isFinite(averageCost) || averageCost <= 0))
    )
      return setNotice(
        "수량은 소수점 6자리까지, 매입단가는 양수로 입력해 주세요.",
      );
    setHoldingSaving(true);
    try {
      const result = await data<{ holdings: Holding[] }>(
        await fetch("/api/holdings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingHoldingId, quantity, averageCost }),
        }),
      );
      setHoldings(result.holdings);
      bumpQuoteVersion();
      setEditingHoldingId(null);
      setNotice(`${holdings.find((row) => row.id === editingHoldingId)?.name ?? "종목"} 저장 완료 · ${quantity.toLocaleString("ko-KR", {maximumFractionDigits:6})}주 · 주당 평균 매입단가 ${averageCost === null ? "미입력" : `${averageCost.toLocaleString("ko-KR")} ${holdings.find((row) => row.id === editingHoldingId)?.market === "US" ? "USD" : "원"}`}`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "자산을 수정하지 못했습니다.",
      );
    } finally {
      setHoldingSaving(false);
    }
  }

  async function resolveSavedInstrument(row: Holding) {
    setSavedResolvingId(row.id);
    try {
      const query = row.symbol || row.name;
      const result = await data<{ instruments: Instrument[] }>(
        await fetch(
          `/api/instruments?market=${row.market}&query=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        ),
      );
      if (result.instruments.length === 1) {
        await applySavedInstrument(row, result.instruments[0]);
      } else if (result.instruments.length > 1) {
        setSavedInstrumentMatches((current) => ({
          ...current,
          [row.id]: result.instruments,
        }));
        setNotice("후보를 골라 종목 코드를 확정해 주세요.");
      } else {
        setNotice(
          "일치하는 종목을 찾지 못했습니다. 종목명을 다시 입력해 주세요.",
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "종목 코드를 찾지 못했습니다.",
      );
    } finally {
      setSavedResolvingId(null);
    }
  }

  async function fetchPortfolioPresence(): Promise<boolean> {
    try {
      const response = await fetch("/api/portfolio", { cache: "no-store" });
      if (!response.ok) return true;
      const payload = (await response.json()) as { portfolio?: unknown };
      return Boolean(payload.portfolio);
    } catch {
      return true;
    }
  }

  async function saveDraft() {
    if (!broker.trim() || !account.trim()) {
      setNotice("증권사와 계좌 이름을 입력해 주세요.");
      return;
    }
    if (
      !draft.length ||
      draft.some(
        (row) =>
          !row.name.trim() ||
          !Number.isFinite(row.quantity) ||
          row.quantity <= 0 ||
          (row.capturedPrice !== null &&
            (!Number.isFinite(row.capturedPrice) || row.capturedPrice <= 0)) ||
          (row.averageCost !== null &&
            (!Number.isFinite(row.averageCost) || row.averageCost <= 0)) ||
          (row.market === "US" &&
            !/^[A-Z.]{1,10}$/.test(row.symbol.trim().toUpperCase())) ||
          (row.market === "KR" &&
            row.symbol.trim() !== "" &&
            !/^[0-9A-Z]{6}$/.test(row.symbol.trim().toUpperCase())),
      )
    ) {
      setNotice(
        "종목명·코드·수량을 확인해 주세요. 국내 코드는 비워둘 수 있지만 시세 조회에는 필요합니다.",
      );
      return;
    }
    const capturedAt = new Date().toISOString();
    const incoming: Holding[] = draft.map((row) => ({
      id: crypto.randomUUID(),
      broker: broker.trim(),
      account: account.trim(),
      market: row.market,
      name: row.name.trim(),
      symbol: row.symbol.trim().toUpperCase(),
      exchange: row.exchange ?? null,
      quantity: row.quantity,
      capturedPrice:
        row.capturedPrice && row.capturedPrice > 0 ? row.capturedPrice : null,
      averageCost:
        row.averageCost && row.averageCost > 0 ? row.averageCost : null,
      capturedAt,
      currentPrice: null,
      quoteLabel: null,
      quoteCheckedAt: null,
    }));
    setBusy(true);
    try {
      const result = await data<{ holdings: Holding[] }>(
        await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: incoming }),
        }),
      );
      setHoldings(result.holdings);
      setDraft([]);
      const hasPortfolio = hasSavedPortfolio !== null ? hasSavedPortfolio : await fetchPortfolioPresence();
      go("holdings", selectedAsset, detailSource, null, { skipConfirm: true });
      if (hasPortfolio) showNotice(`${incoming.length}개 종목을 저장했습니다.`);
      else showNotice(`${incoming.length}개 종목을 저장했습니다. 이제 목표 비중을 정하면 현재 비중과 비교할 수 있습니다.`, { label: "목표 비중 정하기", view: "strategy" });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeHolding(id: string) {
    const holding = holdings.find(row => row.id === id);
    if (!holding || deletingHoldingId || holdingSaving) return;
    if (pendingHoldingRemoval !== id) return;
    setDeletingHoldingId(id);
    try {
      const result = await data<{ holdings: Holding[] }>(
        await fetch("/api/holdings", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
      );
      setHoldings(result.holdings);
      if (editingHoldingId === id) setEditingHoldingId(null);
      setPendingHoldingRemoval(null);
      setNotice(`${holding.name} 등록 정보를 삭제했습니다.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "삭제하지 못했습니다.",
      );
    } finally {
      setDeletingHoldingId(null);
    }
  }

  async function migrateLegacy() {
    setBusy(true);
    try {
      const result = await data<{ holdings: Holding[] }>(
        await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: legacy }),
        }),
      );
      setHoldings(result.holdings);
      localStorage.removeItem("pf-holdings-v1");
      setLegacy([]);
      setNotice("이 브라우저의 기존 자산을 계정으로 옮겼습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "기존 자산을 옮기지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (authStatus === "loading")
    return (
      <div className={styles.splash}>
        <span className={styles.logo}>PR</span> PortRhythm을 준비하고 있습니다
      </div>
    );

  if (authStatus !== "authenticated")
    return (
      <div className={styles.authShell}>
        <section className={styles.authVisual}>
          <div className={styles.authBrand}>
            <span className={styles.logo}>PR</span> PortRhythm
          </div>
          <div className={styles.authPitch}>
            <h1>
              투자는
              <br />나만의 리듬으로
            </h1>
            <p>
              목표 비중을 직접 설계하고 국내·미국 종목을 연결하세요. 현재 비중과
              목표의 차이, 다음 조정이 필요한 자산까지 한눈에 볼 수 있습니다.
            </p>
            <figure className={styles.authDrift} aria-label="예시: 미국 지수 목표 35%, 현재 52%, 17%p 초과">
              <figcaption>목표와 현재가 얼마나 어긋났는지 봅니다</figcaption>
              <div className={styles.authDriftFocus}>
                <span>미국 지수</span>
                <dl>
                  <div><dt>목표</dt><dd>35%</dd></div>
                  <div><dt>현재</dt><dd>52%</dd></div>
                </dl>
                <strong>+17%p</strong>
                <div className={styles.authDriftBar} aria-hidden="true">
                  <i style={{ width: "52%" }} />
                  <b style={{ left: "35%" }} />
                </div>
              </div>
              <ul className={styles.authDriftRows}>
                <li><span>한국 지수</span><span>목표 25%</span><span>현재 15%</span><span>−10%p</span></li>
                <li><span>우량주</span><span>목표 20%</span><span>현재 18%</span><span>−2%p</span></li>
                <li><span>금·비트코인</span><span>목표 20%</span><span>현재 15%</span><span>−5%p</span></li>
              </ul>
            </figure>
          </div>
        </section>
        <section className={styles.authForm}>
          <div>
            <h2>내 투자 기준을 세워보세요</h2>
            <p>
              보유 자산을 정리하고, 목표 비중에 맞는 투자 결정을 준비하세요.
            </p>
            <small className={styles.authSignInLabel}>
              카카오 또는 네이버 계정으로 시작
            </small>
            <button
              className={styles.kakao}
              onClick={() => signIn("kakao", { callbackUrl: noticeReturnPath(window.location.href) })}
            >
              <b>K</b> 카카오로 계속하기
            </button>
            <button
              className={styles.naver}
              onClick={() => signIn("naver", { callbackUrl: noticeReturnPath(window.location.href) })}
            >
              <b>N</b> 네이버로 계속하기
            </button>
            {process.env.NODE_ENV === "development" && (
              <div className={styles.localAdminAccess}>
                <button
                  type="button"
                  className={styles.localAdminToggle}
                  onClick={() => setLocalAdminOpen((open) => !open)}
                  aria-expanded={localAdminOpen}
                >
                  로컬 관리자 테스트 로그인
                </button>
                {localAdminOpen && (
                  <form onSubmit={signInLocalAdmin}>
                    <label>
                      아이디
                      <input
                        autoComplete="username"
                        value={localAdminName}
                        onChange={(event) =>
                          setLocalAdminName(event.target.value)
                        }
                        required
                      />
                    </label>
                    <label>
                      비밀번호
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={localAdminPassword}
                        onChange={(event) =>
                          setLocalAdminPassword(event.target.value)
                        }
                        required
                      />
                    </label>
                    {localAdminError && <p role="alert">{localAdminError}</p>}
                    <button type="submit" disabled={localAdminBusy}>
                      {localAdminBusy
                        ? "로그인 중"
                        : "테스트 계정으로 들어가기"}
                    </button>
                  </form>
                )}
              </div>
            )}
            <nav className={styles.authInfoLinks} aria-label="서비스 안내">
              <Link className={styles.authGuideLink} href="/about">PortRhythm은 어떤 서비스인가요?</Link>
              <Link className={styles.authGuideLink} href="/guide">처음이신가요? 사용 가이드 보기</Link>
            </nav>
            <div className={styles.authPrivacy}>
              <ShieldCheck size={18} /> 캡처 이미지는 브라우저에서 분석하고
              저장하지 않습니다.
            </div>
          </div>
        </section>
      </div>
    );

  const nav = [
    { id: "portfolio" as View, label: "대시보드", Icon: LayoutDashboard },
    { id: "holdings" as View, label: "보유 자산", Icon: ChartNoAxesCombined },
    { id: "accounts" as View, label: "계좌 관리", Icon: Landmark },
    { id: "edit" as View, label: "자산 수정", Icon: SquarePen },
    { id: "strategy" as View, label: "목표 설계", Icon: Target },
    { id: "composition" as View, label: "포트 비중", Icon: PieChart },
    { id: "allocation" as View, label: "자산 배정", Icon: Network },
    { id: "rebalance" as View, label: "리밸런싱", Icon: RefreshCw },
    { id: "history" as View, label: "자산 기록", Icon: History },
    { id: "import" as View, label: "캡처 가져오기", Icon: Camera },
    { id: "preferences" as View, label: "설정", Icon: SlidersHorizontal },
    { id: "settings" as View, label: "계정", Icon: UserRound },
    { id: "notices" as View, label: "공지사항", Icon: Megaphone },
    { id: "guide" as View, label: "사용 가이드", Icon: CircleHelp },
  ];
  const navLabel = view === "more" ? "전체 메뉴" : view === "detail" ? "자산 상세" : nav.find((item) => item.id === view)?.label;
  const menuSections = [
    { label: "포트폴리오", ids: ["portfolio", "composition", "rebalance", "history"] },
    { label: "자산 관리", ids: ["holdings"] },
    { label: "설정·도움말", ids: ["preferences", "settings", "notices", "guide"] },
  ];
  const screenGroups = [
    { parent: "composition" as View, label: "포트 비중", ids: ["composition", "strategy", "allocation"] as View[] },
    { parent: "holdings" as View, label: "자산 관리", ids: ["holdings", "edit", "accounts"] as View[] },
  ];
  const screenGroup = screenGroups.find(group => group.ids.includes(view === "import" ? "edit" : view));
  const menuView = view === "detail" ? detailSource : view;
  const activeMenu = screenGroups.find(group => group.ids.includes(menuView === "import" ? "edit" : menuView))?.parent ?? menuView;
  const subLabels: Partial<Record<View, string>> = { composition: "현재 비중", holdings: "보유 현황" };
  const menuDescriptions: Partial<Record<View, string>> = {
    portfolio: "총자산과 종목별 손익 요약",
    strategy: "목표 비중과 허용 오차 설정",
    composition: "비중 확인·목표 설계·자산 배정",
    rebalance: "매수·매도 수량 확인",
    holdings: "보유 현황·자산 수정·계좌 관리",
    accounts: "증권 계좌·주식·ETF",
    edit: "수량, 매입단가, 자산 이름 수정",
    allocation: "보유 자산의 포트 지정",
    import: "증권사 잔고 캡처로 등록",
    history: "포트별 자산 변화 확인",
    preferences: "알림·환율·손익 표시·포트폴리오 이름",
    settings: "로그인·화면 설정",
    guide: "처음 시작하는 순서와 기능 설명",
    notices: "업데이트와 서비스 소식",
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo}>PR</span>
          <div>
            <strong>PortRhythm</strong>
            <small>투자는 나만의 리듬으로</small>
          </div>
        </div>
        <nav className={styles.navGroup} aria-label="주요 메뉴">
          {menuSections.slice(0, 2).map((section) => (
            <Fragment key={section.label}>
              <span>{section.label}</span>
              {section.ids.map(id => {
                const item = nav.find(entry => entry.id === id)!;
                return (
                  <button key={id} type="button" className={activeMenu === id ? styles.navActive : ""} aria-current={activeMenu === id ? "page" : undefined} onClick={() => go(item.id)}>
                    <item.Icon size={19} />{item.label}{activeMenu === id && <i />}
                  </button>
                );
              })}
            </Fragment>
          ))}
          <span>더 보기</span>
          <button type="button" className={view === "more" || menuSections[2].ids.includes(view) ? styles.navActive : ""} onClick={() => go("more")}>
            <Menu size={19} />전체 메뉴
          </button>
        </nav>
        {operator && <Link href="/admin" style={{ padding: "12px 24px", color: "var(--blue)", fontSize: 14 }}>운영 관리 ↗</Link>}
        <div className={styles.sideFoot}>
          <button className={styles.sideUser} onClick={() => go("settings")}>
            <span className={styles.avatar}>
              <ProfileAvatar image={session.user?.image} name={session.user?.name} />
            </span>
            <span>
              {session.user?.name || "내 계정"}
              <small>계정 관리</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div
        className={`${styles.workspace} ${view === "portfolio" ? styles.mobileHomeWorkspace : ""}`}
      >
        <header className={styles.topbar}>
          <button
            className={styles.mobileBrand}
            aria-label="PortRhythm 홈으로"
            onClick={() => go("portfolio")}
          >
            PR
          </button>
          <div>
            <span className={styles.desktopBreadcrumb}>내 자산 /</span> <strong>{navLabel}</strong>
          </div>
          <div className={styles.topActions}>
          <span className={styles.topPrivate}>
            <ShieldCheck size={15} /> 개인 자산
          </span>
          <button
            type="button"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
            }
            aria-pressed={theme === "dark"}
            title={theme === "dark" ? "라이트 모드" : "다크 모드"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className={styles.themeToggle} aria-label="설정 열기" onClick={() => go("preferences")}><SlidersHorizontal size={18} /></button>
          <button className={styles.topAvatar} aria-label="내 계정 열기" onClick={() => go("settings")}>
            <ProfileAvatar image={session.user?.image} name={session.user?.name} />
          </button>
          </div>
        </header>
        <main className={styles.content}>
          {meritzSync.status.available && meritzSync.status.configured && <div className={styles.meritzSyncStatus} role="status">
            <span>{meritzSync.status.error ? "메리츠 동기화 지연 · 기존 잔고 유지" : !meritzSync.status.enabled ? "메리츠 연결 꺼짐" : meritzSync.checking ? "메리츠 동기화 중" : "메리츠 잔고"}</span>
            {meritzSync.status.lastSuccessAt && <small>{new Date(meritzSync.status.lastSuccessAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} 확인</small>}
            <button type="button" disabled={!meritzSync.canSync} onClick={meritzSync.synchronize}>{meritzSync.checking ? "동기화 중…" : "동기화"}</button>
            <button type="button" onClick={()=>go("accounts")}>연결 관리</button>
          </div>}
          <ServiceNotices key={session.user?.appUserId ?? "account"} userId={session.user?.appUserId ?? "account"} page={view === "notices"} selectedId={selectedNoticeId} onOpen={id => go("notices", selectedAsset, detailSource, id)} onAdminChange={setOperator} />
          {view === "more" && operator && <Link href="/admin" style={{display:"block",padding:"16px 0",color:"var(--blue)"}}>관리자 전용 · 운영 관리 ↗</Link>}
          {screenGroup && (
            <nav className={styles.sectionNav} aria-label={`${screenGroup.label} 화면`}>
              {screenGroup.ids.map(id => {
                const item = nav.find(entry => entry.id === id)!;
                const selected = id === (view === "import" ? "edit" : view);
                return <button key={id} type="button" aria-current={selected ? "page" : undefined} onClick={() => go(id)}>
                  <item.Icon size={17} /><span>{subLabels[id] ?? item.label}</span>
                </button>;
              })}
            </nav>
          )}
          {view === "accounts" && <AccountsManager onCashManage={()=>go("edit")} userId={session.user?.appUserId ?? ""} holdings={holdings} onHoldings={(rows)=>{setHoldings(rows);bumpQuoteVersion();}} onNotice={setNotice} onDirty={setPortfolioDirty} onOpenAsset={row=>openAsset({id:`holding:${row.id}`,kind:"stock"},"accounts")} onRefreshQuotes={()=>void refreshQuotes(true)} />}
          {view === "guide" && <UserGuide onNavigate={go} />}
          {view === "portfolio" && showStartGuide && hasSavedPortfolio === true && (
            <section className={styles.startGuide} aria-label="처음 시작 안내">
              <CircleHelp size={21} />
              <div><strong>목표 비중을 정하고 자산을 연결해 보세요.</strong><p>목표 설계 → 자산 등록 → 배정 → 비중 점검</p></div>
              <button type="button" onClick={() => go("guide")}>시작 안내</button>
              <button type="button" className={styles.startGuideDismiss} aria-label="시작 안내 닫기" onClick={dismissStartGuide}><X size={17} /></button>
            </section>
          )}
          {view === "more" && (
            <div className={styles.allMenu}>
              <div className={styles.pageHead}>
                <div>
                  <h1>전체 메뉴</h1>
                </div>
              </div>
              {menuSections.map((section) => (
                <section className={styles.menuSection} key={section.label}>
                  <h2>{section.label}</h2>
                  {section.ids.map((id) => {
                    const item = nav.find((entry) => entry.id === id)!;
                    return (
                      <button key={id} type="button" onClick={() => go(item.id)}>
                        <item.Icon size={22} strokeWidth={1.7} />
                        <span><strong>{item.label}</strong><small>{menuDescriptions[item.id]}</small></span>
                        <ChevronRight size={17} />
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
          {notice && (
            <div className={styles.notice} role="status">
              <CircleHelp size={17} />
              <span>{notice}</span>
              {noticeAction && (
                <button type="button" className={styles.noticeAction} onClick={() => go(noticeAction.view)}>
                  {noticeAction.label}
                </button>
              )}
              <button aria-label="알림 닫기" onClick={() => { setNotice(""); setNoticeAction(null); }}>
                <X size={17} />
              </button>
            </div>
          )}
          {legacy.length > 0 && (
            <div className={styles.legacyNotice}>
              <Wallet size={19} />
              <span>
                이 브라우저에 저장된 기존 자산 {legacy.length}개가 있습니다.
                계정으로 옮기면 다른 브라우저에서도 볼 수 있습니다.
              </span>
              <button disabled={busy} onClick={migrateLegacy}>
                계정으로 이전
              </button>
            </div>
          )}
          {(
            [
              "portfolio",
              "strategy",
              "preferences",
              "composition",
              "allocation",
              "rebalance",
              "history",
              "detail",
            ] as View[]
          ).includes(view) && (
            <PortfolioBuilder
              userId={session.user?.appUserId ?? "account"}
              screen={
                view === "portfolio"
                  ? "dashboard"
                  : (view as
                      | "strategy"
                      | "preferences"
                      | "composition"
                      | "allocation"
                      | "rebalance"
                      | "history"
                      | "detail")
              }
              holdings={holdings}
              dailyStockQuotes={dailyStockQuotes}
              dailyCryptoQuotes={dailyCryptoQuotes}
              assetSort={assetSort}
              onAssetSort={chooseAssetSort}
              onDailyCryptoQuotes={setDailyCryptoQuotes}
              quoteVersion={quoteVersion}
              onHoldings={setHoldings}
              onNotice={showNotice}
              onRefreshQuotes={refreshQuotes}
              quotesRefreshing={quoteBusy}
              quoteError={quoteError}
              onImport={() => go("import")}
              onEditHoldings={() => go("edit")}
              selectedAsset={selectedAsset}
              onSelectAsset={(asset) => openAsset(asset, view === "rebalance" ? "rebalance" : view === "detail" ? detailSource : "portfolio")}
              detailBackLabel={detailSource === "rebalance" ? "리밸런싱으로" : detailSource === "edit" ? "자산 수정으로" : "이전 화면"}
              onBack={() => go(detailSource)}
              onNavigate={go}
              onDirtyChange={setBuilderDirty}
              onPortfolioPresence={setHasSavedPortfolio}
              onNoticeAction={showNotice}
            />
          )}
          {(view === "holdings" || view === "edit") && (
            <>
              <div className={styles.pageHead}>
                <div>
                  <h1>{view === "edit" ? "자산 수정" : "보유 자산"}</h1>
                </div>
              </div>
              {view === "holdings" && !holdingsEmpty && (
                <div className={styles.holdingStats}>
                  <div>
                    <span>국내 평가금액</span>
                    <strong>{money(totals.KR, "KR")}</strong>
                  </div>
                  <div>
                    <span>국내 평가손익</span>
                    <strong
                      className={
                        !totals.costKnown.KR ? undefined : totals.gain.KR >= 0
                          ? styles.gainPositive
                          : styles.gainNegative
                      }
                    >
                      {totals.costKnown.KR
                        ? signedMoney(totals.gain.KR, "KR")
                        : "—"}
                    </strong>
                    {totals.cost.KR > 0 && (
                      <small
                        className={
                          totals.gain.KR >= 0
                            ? styles.gainPositive
                            : styles.gainNegative
                        }
                      >
                        {signedPercent((totals.gain.KR / totals.cost.KR) * 100)}
                      </small>
                    )}
                  </div>
                  <div>
                    <span>미국 평가금액</span>
                    <strong>{money(totals.US, gainCurrency("US"))}</strong>
                  </div>
                  <div>
                    <span>미국 평가손익{fxEnabled?" · 환율 포함":" · USD"}</span>
                    <strong
                      className={
                        !totals.costKnown.US ? undefined : totals.gain.US >= 0
                          ? styles.gainPositive
                          : styles.gainNegative
                      }
                    >
                      {totals.costKnown.US
                        ? signedMoney(totals.gain.US, gainCurrency("US"))
                        : "—"}
                    </strong>
                    {totals.cost.US > 0 && (
                      <small
                        className={
                          totals.gain.US >= 0
                            ? styles.gainPositive
                            : styles.gainNegative
                        }
                      >
                        {signedPercent((totals.gain.US / totals.cost.US) * 100)}
                      </small>
                    )}
                  </div>
                </div>
              )}
              {view === "edit" && <nav className={styles.editorJumpNav} aria-label="수정할 자산 종류">
                {([["edit-stocks","주식·ETF",PieChart],["edit-crypto-group","가상자산",Coins],["edit-cash-group","현금·RP",Wallet],["edit-cash-movements","입출금",ArrowLeftRight]] as const).map(([id,label,Icon])=><button type="button" key={id} onClick={()=>{const target=document.getElementById(id);if(target instanceof HTMLDetailsElement)target.open=true;target?.scrollIntoView({behavior:"smooth",block:"start"});}}><Icon size={18}/>{label}</button>)}
              </nav>}
              {view === "edit" && (
                <div className={styles.editIntro} id="edit-stocks">
                  <strong>보유 주식·ETF</strong>
                  <button
                    type="button"
                    aria-expanded={assetAddOpen}
                    aria-controls="asset-add-options"
                    onClick={() => setAssetAddOpen(open => !open)}
                  >
                    <Plus size={15} /> 자산 추가
                  </button>
                  <span>종목을 눌러 수정하세요. 삭제는 ··· 메뉴에서 할 수 있습니다.</span>
                  {assetAddOpen && (
                    <div id="asset-add-options" className={styles.assetAddOptions} role="group" aria-label="새 자산 등록 방법">
                      <button type="button" onClick={() => go("accounts")}>
                        <strong>수기 입력으로 추가</strong>
                        <small>계좌 관리에서 계좌를 선택하고 종목·수량을 입력하세요.</small>
                      </button>
                      <button type="button" onClick={() => go("import")}>
                        <strong>캡처로 추가</strong>
                        <small>증권사 잔고 캡처를 읽고, 인식 결과를 확인해 등록하세요.</small>
                      </button>
                    </div>
                  )}
                </div>
              )}
              <section className={`${styles.panel} ${view === "holdings" ? styles.positionsPanel : ""}`}>
                {!holdingsEmpty && <div className={styles.toolbar}>
                  <div className={styles.tabs}>
                    {(["ALL", "KR", "US"] as const).map((item) => (
                      <button
                        key={item}
                        className={filter === item ? styles.tabActive : ""}
                        onClick={() => setFilter(item)}
                      >
                        {item === "ALL"
                          ? "전체"
                          : item === "KR"
                            ? "국내"
                            : "미국"}
                      </button>
                    ))}
                  </div>
                  <label className={styles.search}>
                    <Search size={17} />
                    <input
                      aria-label="종목 검색"
                      placeholder="종목명, 코드, 증권사 검색"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <AssetSortSelect value={assetSort} onChange={chooseAssetSort} className={styles.assetSort} marketGrouped={filter === "ALL"} />
                </div>}
                {!holdingsEmpty && <div className={`${styles.tableHead} ${styles.editTableHead}`}>
                  <span>종목</span>
                  <span>보유 수량</span>
                  <span>{view === "edit" ? "현재가" : "현재가 / 평균 매입가"}</span>
                  <span>평가액</span>
                  <span>평가손익</span>
                  <span />
                </div>}
                {shown.length ? (
                  shown.map((row) => {
                    const price = row.currentPrice ?? row.capturedPrice;
                    return (
                      <Fragment key={row.id}>
                        {view === "edit" ? <EditableHoldingRow
                          holding={row}
                          price={price === null ? "—" : money(price,row.market)}
                          value={price === null ? "—" : money(valueOf(row),gainCurrency(row.market))}
                          gain={gainOf(row) === null ? "—" : signedMoney(gainOf(row)!,gainCurrency(row.market))}
                          percent={gainPercentOf(row) === null ? null : signedPercent(gainPercentOf(row)!)}
                          gainSign={gainOf(row) === null ? "unknown" : gainOf(row)! >= 0 ? "positive" : "negative"}
                          editing={editingHoldingId === row.id}
                          editDisabled={holdingSaving || deletingHoldingId !== null || editingHoldingId === row.id || holdingDirty || holdingTradeDirty}
                          removeDisabled={deletingHoldingId !== null || holdingSaving || holdingDirty || holdingTradeDirty}
                          onEdit={() => beginHoldingEdit(row)}
                          onRemove={() => {setEditingHoldingId(null);setPendingHoldingRemoval(row.id);}}
                        /> : (
                        <HoldingPositionRow
                          holding={row}
                          price={price === null ? "—" : money(price, row.market)}
                          averageCost={row.averageCost === null ? "—" : money(row.averageCost, row.market)}
                          value={price === null ? "—" : money(valueOf(row), gainCurrency(row.market))}
                          gain={gainOf(row) === null ? "—" : signedMoney(gainOf(row)!, gainCurrency(row.market))}
                          percent={gainPercentOf(row) === null ? null : signedPercent(gainPercentOf(row)!)}
                          gainSign={gainOf(row) === null ? "unknown" : gainOf(row)! >= 0 ? "positive" : "negative"}
                          onOpen={() => openAsset({ kind: "stock", id: `holding:${row.id}` }, "holdings")}
                        />
                        )}
                        {view === "edit" && pendingHoldingRemoval === row.id && (
                          <div className={styles.holdingDeleteConfirm} role="group" aria-label={`${row.name} 삭제 확인`}>
                            <strong>{row.name}을 등록 자산에서 삭제할까요?</strong>
                            <p>{row.broker} · {row.account} · {row.quantity}주</p>
                            <p>앱의 보유 정보만 삭제됩니다. 실제 증권사 잔고는 바뀌지 않으며, 다시 보려면 자산을 재등록해야 합니다.</p>
                            <div>
                              <button type="button" onClick={() => setPendingHoldingRemoval(null)} disabled={deletingHoldingId !== null}>취소</button>
                              <button type="button" className={styles.confirmDelete} onClick={() => void removeHolding(row.id)} disabled={deletingHoldingId !== null || holdingSaving}>{deletingHoldingId === row.id ? "삭제 중…" : "삭제 확인"}</button>
                            </div>
                          </div>
                        )}
                        {view === "edit" && editingHoldingId === row.id && (
                          <div className={styles.holdingEdit}>
                            {holdingTradeMode ? <HoldingTradeEditor key={row.id} holding={row} onDirty={setHoldingTradeDirty} onBusy={setHoldingSaving}
                              onCancel={() => setEditingHoldingId(null)} onDirect={() => setHoldingTradeMode(false)}
                              onSaved={(next, message) => {
                                setHoldings(withPreviousQuotes(next, holdings));
                                setEditingHoldingId(null);setNotice(message);
                              }} /> : <>
                            <p className={styles.editStatus} role="status">저장하지 않은 변경이 있습니다. 이 종목만 수정한 뒤 저장하세요.</p>
                            <div className={styles.editTitle}>
                              <strong>{row.name}</strong>
                              <span>
                                {row.broker} · {row.account}
                              </span>
                            </div>
                            <label>
                              보유 수량
                              <NumberInput
                                min="0"
                                step="0.000001"
                                value={holdingQuantity}
                                disabled={holdingSaving}
                                onValueChange={(value) =>
                                  setHoldingQuantity(value)
                                }
                              />
                            </label>
                            <label>
                              주당 평균 매입단가 (
                              {row.market === "US" ? "USD" : "KRW"})
                              <NumberInput
                                min="0"
                                step="0.000001"
                                value={holdingCost}
                                disabled={holdingSaving}
                                onValueChange={(value) =>
                                  setHoldingCost(value)
                                }
                                placeholder="모르면 비워두기"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={saveHoldingAmounts}
                              disabled={holdingSaving}
                            >
                              {holdingSaving ? "저장 중" : "저장"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingHoldingId(null)}
                              disabled={holdingSaving}
                            >
                              취소
                            </button>
                            <div className={styles.codeVerification}>
                              <div>
                                <strong>
                                  종목코드 · {row.symbol || "미확인"}
                                </strong>
                                <span>
                                  한국투자증권 종목 마스터에서 코드와 거래소를
                                  확인합니다. 올바른 코드가 연결돼야 현재가를
                                  조회할 수 있습니다.
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={savedResolvingId === row.id}
                                onClick={() => resolveSavedInstrument(row)}
                              >
                                {savedResolvingId === row.id
                                  ? "조회 중"
                                  : "종목코드 확인·변경"}
                              </button>
                              {savedInstrumentMatches[row.id]?.length ? (
                                <select
                                  defaultValue=""
                                  aria-label={`${row.name} 종목 코드 후보`}
                                  onChange={(event) => {
                                    const item = savedInstrumentMatches[
                                      row.id
                                    ].find(
                                      (candidate) =>
                                        `${candidate.symbol}|${candidate.exchange}` ===
                                        event.target.value,
                                    );
                                    if (item) applySavedInstrument(row, item);
                                  }}
                                >
                                  <option value="">후보를 선택하세요</option>
                                  {savedInstrumentMatches[row.id].map(
                                    (item) => (
                                      <option
                                        key={`${item.symbol}|${item.exchange}`}
                                        value={`${item.symbol}|${item.exchange}`}
                                      >
                                        {item.name} · {item.symbol} (
                                        {item.exchange})
                                      </option>
                                    ),
                                  )}
                                </select>
                              ) : null}
                            </div>
                            </>}
                          </div>
                        )}
                      </Fragment>
                    );
                  })
                ) : holdingsEmpty ? (
                  <div className={styles.holdingsEmpty}>
                    <strong>아직 등록한 종목이 없습니다.</strong>
                    <div>
                      <button type="button" onClick={() => go("import")}>캡처 가져오기</button>
                      <button type="button" className={styles.emptyLink} onClick={() => go("accounts")}>직접 추가</button>
                    </div>
                  </div>
                ) : (
                  <Empty onImport={() => go("import")} loading={loading} />
                )}
              </section>
              {view === "edit" && (
                <PortfolioBuilder
                  userId={session.user?.appUserId ?? "account"}
                  screen="edit"
                  holdings={holdings}
                  dailyStockQuotes={dailyStockQuotes}
                  dailyCryptoQuotes={dailyCryptoQuotes}
                  assetSort={assetSort}
                  onAssetSort={chooseAssetSort}
                  onDailyCryptoQuotes={setDailyCryptoQuotes}
                  quoteVersion={quoteVersion}
                  onHoldings={setHoldings}
                  onNotice={showNotice}
                  onRefreshQuotes={refreshQuotes}
                  quotesRefreshing={quoteBusy}
                  quoteError={quoteError}
                  onImport={() => go("import")}
                  onEditHoldings={() => go("edit")}
                  selectedAsset={selectedAsset}
                  onSelectAsset={(asset) => openAsset(asset, "edit")}
                  onBack={() => go(detailSource)}
                  focusAsset={editFocus}
                  onNavigate={go}
                  onDirtyChange={setBuilderDirty}
                  onPortfolioPresence={setHasSavedPortfolio}
                  onNoticeAction={showNotice}
                />
              )}
              {(totals.costKnown.KR + totals.costKnown.US < holdings.length || totals.missing > 0) && <p className={styles.footnote}>
                {totals.costKnown.KR + totals.costKnown.US < holdings.length
                  ? ` 매입단가가 없는 종목은 손익 계산에서 제외됩니다.`
                  : ""}
                {totals.missing
                  ? ` 가격이 없는 ${totals.missing}개 종목은 평가금액에서 제외됩니다.`
                  : ""}
              </p>}
            </>
          )}
          {view === "import" && (
            <>
              <div className={styles.pageHead}>
                <div>
                  <h1>캡처에서 자산 가져오기</h1>
                  <p>잔고 화면을 읽고, 확인한 내용만 계정에 저장합니다.</p>
                </div>
              </div>
              <div className={styles.importGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h2>
                      <span className={styles.step}>01</span> 화면 선택
                    </h2>
                  </div>
                  <div className={styles.formGrid}>
                    <label>
                      증권사
                      <input
                        value={broker}
                        onChange={(event) => setBroker(event.target.value)}
                      />
                    </label>
                    <label>
                      계좌 구분
                      <input
                        value={account}
                        onChange={(event) => setAccount(event.target.value)}
                      />
                    </label>
                    <label>
                      잔고 화면
                      <select
                        value={market}
                        onChange={(event) =>
                          setMarket(event.target.value as Market)
                        }
                      >
                        <option value="KR">국내주식</option>
                        <option value="US">해외주식</option>
                      </select>
                    </label>
                  </div>
                  <p className={styles.formTip}>
                    미래에셋 종합잔고는 국내주식으로 자동 인식합니다.
                  </p>
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h2>
                      <span className={styles.step}>02</span> 캡처 업로드
                    </h2>
                  </div>
                  <label className={styles.upload}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={importCapture}
                      disabled={busy}
                    />
                    <span>
                      <Camera size={27} />
                    </span>
                    <strong>
                      {busy
                        ? "이미지를 분석하고 있습니다"
                        : "이미지를 선택해 주세요"}
                    </strong>
                    <small>PNG, JPG 등 잔고 화면 캡처</small>
                    <em>
                      <FileUp size={16} /> 파일 선택
                    </em>
                  </label>
                  <p className={styles.formTip}>
                    <ShieldCheck size={15} /> 이미지는 브라우저에서만
                    분석합니다.
                  </p>
                </section>
              </div>
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2>
                      <span className={styles.step}>03</span> 내용 확인
                    </h2>
                    <p>
                      {captureName ||
                        "잘린 종목명과 코드를 확인한 뒤 저장하세요."}
                    </p>
                  </div>
                  <button
                    className={styles.secondaryButton}
                    onClick={() =>
                      setDraft((rows) => [
                        ...rows,
                        {
                          market,
                          name: "",
                          symbol: "",
                          exchange: null,
                          quantity: 0,
                          capturedPrice: null,
                          averageCost: null,
                        },
                      ])
                    }
                  >
                    <Plus size={17} /> 직접 추가
                  </button>
                </div>
                {draft.length ? (
                  <>
                    <div className={styles.reviewList}>
                      {draft.map((row, index) => (
                        <div className={styles.reviewRow} key={index}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <label>
                            종목명
                            <input
                              value={row.name}
                              onChange={(event) =>
                                editDraft(index, "name", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            종목 코드
                            <input
                              value={row.symbol}
                              onChange={(event) =>
                                editDraft(
                                  index,
                                  "symbol",
                                  event.target.value.toUpperCase(),
                                )
                              }
                              placeholder={
                                row.market === "KR"
                                  ? "6자리 코드 (예: 0167A0)"
                                  : "예: GOOGL"
                              }
                            />
                            <button
                              type="button"
                              className={styles.findCodeButton}
                              disabled={resolvingIndex === index}
                              onClick={() => resolveInstrument(index)}
                            >
                              <Search size={13} />
                              {resolvingIndex === index
                                ? "찾는 중"
                                : "KIS 코드 찾기"}
                            </button>
                            {instrumentMatches[index]?.length ? (
                              <select
                                className={styles.instrumentSelect}
                                defaultValue=""
                                onChange={(event) => {
                                  const item = instrumentMatches[index].find(
                                    (candidate) =>
                                      `${candidate.symbol}|${candidate.exchange}` ===
                                      event.target.value,
                                  );
                                  if (item) useInstrument(index, item);
                                }}
                              >
                                <option value="">후보를 선택하세요</option>
                                {instrumentMatches[index].map((item) => (
                                  <option
                                    key={`${item.symbol}|${item.exchange}`}
                                    value={`${item.symbol}|${item.exchange}`}
                                  >
                                    {item.name} · {item.symbol}
                                    {item.exchange ? ` (${item.exchange})` : ""}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </label>
                          <label>
                            수량
                            <NumberInput
                              min="0"
                              step="any"
                              value={row.quantity}
                              onValueChange={(value) =>
                                editDraft(index, "quantity", value)
                              }
                            />
                          </label>
                          <label>
                            캡처 가격
                            <NumberInput
                              min="0"
                              step="any"
                              value={row.capturedPrice ?? ""}
                              onValueChange={(value) =>
                                editDraft(
                                  index,
                                  "capturedPrice",
                                  value,
                                )
                              }
                            />
                          </label>
                          <label>
                            매입 단가
                            <NumberInput
                              min="0"
                              step="any"
                              value={row.averageCost ?? ""}
                              onValueChange={(value) =>
                                editDraft(
                                  index,
                                  "averageCost",
                                  value,
                                )
                              }
                            />
                          </label>
                          <button
                            className={styles.deleteButton}
                            aria-label={`${index + 1}번째 종목 제외`}
                            onClick={() =>
                              setDraft((rows) =>
                                rows.filter(
                                  (_, position) => position !== index,
                                ),
                              )
                            }
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className={styles.reviewFoot}>
                      <span>
                        <Check size={16} /> {draft.length}개 항목 검토 중
                      </span>
                      <button
                        className={styles.primaryButton}
                        disabled={busy}
                        onClick={saveDraft}
                      >
                        확인하고 저장
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.reviewEmpty}>
                    <Camera size={27} />
                    <strong>확인할 종목이 없습니다</strong>
                    <span>캡처를 업로드하거나 직접 추가하세요.</span>
                  </div>
                )}
              </section>
            </>
          )}
          {view === "settings" && (
            <AccountSettings
              name={session.user?.name}
              image={session.user?.image}
              loginProvider={session.user?.loginProvider}
              email={session.user?.email}
              theme={theme}
              onThemeChange={(next) => { if (next !== theme) toggleTheme(); }}
              onNavigate={go}
              onSignOut={async () => { try { await detachPushOnLogout(); } finally { await signOut({ callbackUrl: "/" }); } }}
            />
          )}
        </main>
      </div>
      <nav
        className={`${styles.mobileNav} ${view === "portfolio" ? styles.mobileHomeNav : ""}`}
        aria-label="모바일 주요 메뉴"
      >
        {(["portfolio", "composition", "rebalance"] as View[]).map((id) => {
          const item = nav.find((entry) => entry.id === id)!;
          const { Icon } = item;
          const label =
            id === "portfolio"
              ? "대시보드"
              : id === "composition"
                ? "포트 비중"
                : "리밸런싱";
          return (
            <button
              key={id}
              className={activeMenu === id || (id === "portfolio" && activeMenu === "holdings") ? styles.mobileActive : ""}
              onClick={() => go(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          );
        })}
        <button className={view === "more" ? styles.mobileActive : ""} onClick={() => go("more")} aria-label="전체 메뉴">
          <Menu size={21} />
          <span>전체</span>
        </button>
      </nav>
    </div>
  );
}

function Empty({
  onImport,
  loading,
}: {
  onImport: () => void;
  loading: boolean;
}) {
  return (
    <div className={styles.empty}>
      <span>
        <Wallet size={25} />
      </span>
      <strong>
        {loading ? "자산을 불러오는 중입니다" : "아직 보유 자산이 없습니다"}
      </strong>
      <p>증권사 잔고 캡처에서 종목을 가져와 보세요.</p>
      {!loading && (
        <button onClick={onImport}>
          캡처 가져오기
        </button>
      )}
    </div>
  );
}
