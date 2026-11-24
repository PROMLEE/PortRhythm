"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Check, ChevronRight } from "lucide-react";
import styles from "./UserGuide.module.css";

const AveragePriceCalculator = dynamic(() => import("./AveragePriceCalculator"));

type Destination =
  | "strategy"
  | "accounts"
  | "import"
  | "edit"
  | "allocation"
  | "composition"
  | "rebalance"
  | "history";
const steps: {
  title: string;
  text: string;
  destination: Destination;
  action: string;
}[] = [
  {
    title: "내 투자 기준 정하기",
    text: "미국 지수, 한국 지수, 우량주, 금처럼 원하는 포트를 만들고 목표 비중의 합계를 100%로 맞추세요. 허용 오차도 여기서 정합니다.",
    destination: "strategy",
    action: "목표 설계",
  },
  {
    title: "보유 자산 등록하기",
    text: "계좌 관리에서 증권사·계좌명을 만들고 종목을 검색해 직접 등록하세요. 잔고 캡처도 사용할 수 있습니다. 비트코인과 현금은 자산 수정에서 추가하세요.",
    destination: "accounts",
    action: "계좌·종목 등록",
  },
  {
    title: "자산을 포트에 연결하기",
    text: "각 자산이 어느 포트에 속하는지 지정하세요. 같은 종목코드의 자동 배정 규칙보다 직접 지정한 배정이 우선합니다.",
    destination: "allocation",
    action: "자산 배정",
  },
  {
    title: "현재 비중 점검하기",
    text: "원형 그래프에 마우스를 올리거나 포트를 선택하면 평가액과 목표 차이를 확인할 수 있습니다. 모바일에서는 포트를 눌러보세요.",
    destination: "composition",
    action: "포트 비중",
  },
  {
    title: "리밸런싱 준비하기",
    text: "허용 범위 밖은 자동으로 조정을 제안합니다. 범위 안은 유지하고 직접 종목을 선택하면 목표까지 필요한 수량을 확인할 수 있습니다. 제안을 검토한 뒤 ‘이 계획으로 시작’으로 저장하고 거래를 하나씩 기록하세요.",
    destination: "rebalance",
    action: "리밸런싱",
  },
];
// Each answer: a one-line summary first, then optional short detail points.
const questions: [string, string, ...string[]][] = [
  [
    "정기 점검일과 리밸런싱 알림을 설정할 수 있나요?",
    "설정 → 점검일·리밸런싱 알림에서 월간 점검일과 분기 말 점검을 각각 켤 수 있습니다.",
    "알림을 켠 기기로 한국 시간 오전 9시 이후 알려 드립니다.",
    "리밸런싱 화면에서 다음 점검일을 보고 오늘 점검 완료를 기록합니다.",
    "허용 범위 이탈 알림은 최근 24시간 안에 앱에서 확인한 비중으로만 보내며 최대 주 1회입니다.",
    "접속하지 않은 동안 시세를 감시하거나 거래를 자동으로 실행하지는 않습니다.",
  ],
  [
    "리밸런싱 종목은 어떤 기준으로 선택하나요?",
    "허용 범위 밖인 포트만 자동으로 제안하고 직접 고른 종목은 그대로 둡니다.",
    "주식 매수는 등록한 매수 후보, 매도는 보유 종목에서 고릅니다. 가상자산은 해당 포트에 등록된 자산을 씁니다.",
    "같은 포트에서는 정규장이 열린 국내·미국 시장을 먼저 고릅니다. 둘 다 장외면 기존 후보 순서를 따릅니다.",
    "현금 포트가 범위를 벗어나면 범위 안인 다른 포트도 허용 상한까지 추가 매수할 수 있습니다.",
    "주식은 1주, 가상자산은 소수점 8자리 단위로 계산합니다.",
    "‘이 계획으로 시작’을 누르면 제안을 저장하고 거래를 하나씩 기록할 수 있습니다. 실제 주문은 직접 진행합니다.",
  ],
  [
    "새 종목을 살 때 보유 현금을 사용할 수 있나요?",
    "보유 자산 → 계좌 관리 → 종목 직접 추가에서 ‘보유 현금에서 매수금액 차감’을 켜세요.",
    "매수 수량, 주당 매수 단가, 사용할 현금을 고르면 차감 후 잔액을 미리 볼 수 있습니다.",
    "국내 주식은 원화, 미국 주식은 달러 현금만 고를 수 있습니다. 잔고가 부족하면 등록되지 않습니다.",
    "수수료는 따로 더하지 않으니 필요하면 단가에 포함해 입력하세요.",
    "기존 보유 내역을 옮겨 적거나 현금 잔고를 이미 고쳤다면 이 옵션을 끄세요.",
    "기존 종목의 추가 매수·매도는 종목 수정의 ‘현금 잔고에 함께 반영’을 사용합니다.",
  ],
  [
    "외부에서 들어온 투자금은 어떻게 반영하나요?",
    "자산 수정 → 입출금·이체 → 외부 입금에서 현금 자산과 금액을 골라 확정하세요.",
    "현금 잔고와 자산 기록의 입출금 내역에 함께 반영되니, 자산 기록에 다시 입력하지 마세요.",
    "외부 출금도 같은 방식으로 잔고에서 뺍니다.",
    "달러 입금의 매입 환율은 모르면 비워 둬도 됩니다. 기록은 현재 환율로 원화 환산합니다.",
    "잘못 기록했다면 반대 방향의 입출금을 새로 등록해 바로잡습니다.",
  ],
  [
    "계좌 간 현금 이동은 어떻게 기록하나요?",
    "계좌 관리의 ‘현금 관리·이체’ 또는 자산 수정의 ‘입출금·이체 → 내 계좌 간 이체’를 이용하세요.",
    "원화끼리, 달러끼리만 옮길 수 있습니다.",
    "두 잔액만 바뀌고 전체 평가액은 그대로입니다. 포트 배정이 다르면 포트별 비중은 달라집니다.",
    "달러는 보내는 쪽의 환전 원가를 함께 옮겨 받는 쪽 원가와 평균합니다.",
    "최근 이체 30건을 볼 수 있습니다. 잘못 기록한 이체는 반대 방향으로 새로 기록해 되돌립니다.",
  ],
  [
    "현금·RP 포트는 어떻게 조정하나요?",
    "목표 설계 → 계산 설정에서 ‘목표 비중을 맞출 현금 포트’를 고르세요.",
    "현금 목표액은 추가 투입금까지 포함한 총자산에 목표 비중을 곱해 정합니다.",
    "현금이 많으면 초과분으로 매수하고 부족하면 추가 투입금과 매도 대금에서 먼저 채웁니다.",
    "1주 단위나 거래 제외로 남은 금액도 현금 포트에 들어가므로 목표와 조금 차이가 날 수 있습니다.",
    "계좌·통화 간 이동이 가능하다고 가정한 미리보기입니다. 거래 후에는 실제 잔고를 수정하세요.",
  ],
  [
    "공지 알림은 어떻게 받나요?",
    "설정 → 알림·앱 설치에서 ‘알림 켜기’를 누르고 브라우저 권한을 허용하세요.",
    "기기마다 따로 설정하며 테스트 알림으로 연결을 확인할 수 있습니다.",
    "아이폰은 iOS 16.4 이상에서 Safari 공유 메뉴 → 홈 화면에 추가 후, 설치한 앱으로 열어야 합니다.",
    "알림을 차단했다면 브라우저 설정에서 풀어야 합니다. 로그아웃하면 이 브라우저의 알림도 해제됩니다.",
  ],
  [
    "환율 손익은 어떻게 켜고 계산하나요?",
    "전체 메뉴 → 설정 → 손익 표시에서 ‘손익에 환율 변동 포함’을 켜세요.",
    "총평가액·비중·리밸런싱은 설정과 관계없이 현재 환율을 씁니다.",
    "미국 주식은 원화 매입원가, 달러 현금은 평균 환전 단가가 있어야 계산됩니다. 모르면 비워 두면 ‘손익 미확인’으로 표시합니다.",
    "원화 매입원가는 미국 주식 수정의 ‘기존 보유분 원가 설정’, 평균 환전 단가는 달러 상세에서 입력합니다.",
    "국내 상장 해외 ETF에는 환율 손익을 따로 더하지 않습니다.",
    "보유분의 평가손익만 보여 주며 실현손익이나 세금은 계산하지 않습니다.",
  ],
  [
    "수량과 매입단가, 자산 이름은 어디서 바꾸나요?",
    "대시보드나 보유 자산에서 종목을 누르거나, 자산 수정·계좌 관리 메뉴를 이용하세요.",
    "주식은 계좌별로 추가 매수 또는 매도를 고르고 이번 거래 수량과 단가를 입력합니다. 평단은 자동으로 다시 계산합니다.",
    "일부 매도는 남은 주식의 평단을 유지하고 전량 매도는 목록에서 뺍니다.",
    "‘현금 잔고에 함께 반영’을 켜면 매수 금액은 현금에서 빼고 매도 대금은 더합니다.",
    "기존 평단을 모르면 ‘전체 수량·평단 직접 수정’에서 먼저 입력하세요. 이 방법은 현금 잔고를 바꾸지 않습니다.",
    "가상자산은 개당 매입가, 현금·기타 자산은 이름과 평가액을 고칠 수 있습니다.",
  ],
  [
    "현재가와 환율은 직접 입력하나요?",
    "아니요. 주식은 한국투자증권 또는 토스증권, 가상자산은 빗썸 원화 가격을 자동으로 불러옵니다.",
    "화면을 보고 있는 동안 주식은 약 5분, 가상자산은 약 1분마다 새로 불러옵니다.",
    "조회에 실패하면 마지막으로 확인한 가격을 씁니다.",
    "환율은 매일 자동으로 받는 기준환율(ECB)이나 직접 입력한 값을 씁니다. 실제 환전 환율과 다를 수 있습니다.",
  ],
  [
    "전체 손익과 일간 손익은 어떻게 다른가요?",
    "전체 손익은 매입단가 기준의 평가손익입니다. 일간 손익은 전일 종가 대비 오늘의 변화입니다.",
    "실현손익, 세금, 수수료, 배당은 포함하지 않습니다.",
  ],
  [
    "계좌 잔고도 자동으로 동기화되나요?",
    "아니요. 현재가는 자동으로 불러오지만 보유 수량은 가져오지 않습니다. 거래 후 수량과 매입단가를 직접 고치거나 새 잔고 캡처로 반영하세요.",
  ],
  [
    "리밸런싱 허용 오차는 어떻게 정하나요?",
    "목표 설계에서 두 기준 중 하나를 고릅니다.",
    "전체 자산 비중 기준: 목표 20%, ±2%p → 18~22% 허용",
    "각 포트 목표 금액 기준: 목표 1,000만 원, ±10% → 900만~1,100만 원 허용",
    "목표 금액은 추가 투입금까지 포함해 계산합니다.",
  ],
  [
    "매수 후보를 추가하면 보유 자산에도 생기나요?",
    "아니요. 매수 후보는 리밸런싱에 쓸 종목 목록일 뿐입니다. 실제로 산 뒤 자산을 등록하고 포트에 배정하세요.",
  ],
  [
    "자산 기록은 무엇을 보여주나요?",
    "전체와 포트별 평가액이 날마다 어떻게 변했는지 보여 줍니다.",
    "그래프를 누르면 날짜와 금액을 볼 수 있습니다.",
    "입출금에 실제 시각을 넣으면 같은 날 안의 변화도 구분됩니다.",
  ],
];

export default function UserGuide({
  onNavigate,
}: {
  onNavigate?: (view: Destination) => void;
}) {
  const guideRef = useRef<HTMLElement>(null);
  const [chapter, setChapter] = useState("guide-start");
  const [calculatorLoaded, setCalculatorLoaded] = useState(false);

  useEffect(() => {
    const root = guideRef.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = root.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - window.innerHeight);
      root.style.setProperty(
        "--guide-progress",
        String(Math.max(0, Math.min(1, -bounds.top / distance))),
      );
      const chapters = Array.from(
        root.querySelectorAll<HTMLElement>("[data-chapter]"),
      );
      const current = chapters
        .filter(
          (section) =>
            section.getBoundingClientRect().top <= window.innerHeight * 0.4,
        )
        .at(-1);
      const timeline = root.querySelector<HTMLElement>("[data-timeline]");
      if (timeline) {
        const track = timeline.getBoundingClientRect();
        root.style.setProperty(
          "--step-progress",
          String(
            Math.max(
              0,
              Math.min(
                1,
                (window.innerHeight * 0.6 - track.top) / track.height,
              ),
            ),
          ),
        );
      }
      setChapter(current?.id ?? "guide-start");
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onMotionChange = () => {
      root.dataset.reduceMotion = String(motion.matches);
    };
    onMotionChange();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    motion.addEventListener("change", onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  function action(destination: Destination, label: string) {
    return onNavigate ? (
      <button type="button" onClick={() => onNavigate(destination)}>
        {label}
      </button>
    ) : null;
  }
  return (
    <article ref={guideRef} className={styles.guide}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>
            내 포트폴리오의
            <br />첫 리듬을 만들어보세요
          </h1>
          <p>
            목표를 정하고 자산을 연결하고 비중을 점검하세요.
            <br />
            처음에는 이 순서대로 시작하면 됩니다.
          </p>
          {!onNavigate && (
            <a className={styles.loginLink} href="/">
              로그인하고 시작하기
            </a>
          )}
          <a className={styles.scrollCue} href="#guide-start">
            <ArrowDown size={16} /> 아래로 내려 첫 리듬 시작하기
          </a>
        </div>
      </header>
      <nav className={styles.chapterNav} aria-label="가이드 목차">
        <div className={styles.readProgress} aria-hidden="true" />
        {[
          ["guide-start", "시작 순서"],
          ["guide-edit", "자산 수정"],
          ["guide-rebalance", "리밸런싱"],
          ["guide-faq", "궁금한 점"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={chapter === id ? "location" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <section id="guide-start" data-chapter className={styles.section}>
        <h2>처음 시작하는 5단계</h2>
        <ol className={styles.steps} data-timeline>
          {steps.map((step, index) => (
            <li key={step.destination}>
              <span className={styles.number}>{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                {action(step.destination, step.action)}
              </div>
            </li>
          ))}
        </ol>
        <figure>
          <img
            src="/guide/desktop-composition.jpg"
            width="1280"
            height="720"
            loading="lazy"
            alt="포트 비중 화면에서 선택한 포트의 평가액과 목표 비중 차이를 확인하는 예시"
          />
          <figcaption>포트별 평가액과 목표 비중 비교</figcaption>
        </figure>
      </section>
      <section id="guide-edit" data-chapter className={styles.section}>
        <h2>거래 후에는 여기서 수정하세요</h2>
        <p>
          대시보드에서 자산을 누르면 상세 화면에서 해당 자산을 바로 수정하고 저장할 수 있습니다.
        </p>
        <ul className={styles.editList}>
          <li>
            <Check size={18} />
            <span>
              <strong>주식</strong>계좌별 보유 수량과 평균 매입단가
            </span>
          </li>
          <li>
            <Check size={18} />
            <span>
              <strong>가상자산</strong>보유 수량과 원화 매입단가
            </span>
          </li>
          <li>
            <Check size={18} />
            <span>
              <strong>현금·기타 자산</strong>자산 이름과 평가액
            </span>
          </li>
        </ul>
        {action("edit", "자산 수정으로 이동")}
        <figure>
          <img
            src="/guide/desktop-asset-edit.jpg"
            width="1265"
            height="1206"
            loading="lazy"
            alt="주식, 가상자산 매입단가와 현금 이름을 수정하는 자산 수정 화면"
          />
          <figcaption>입력 후 저장 버튼으로 반영합니다.</figcaption>
        </figure>
      </section>
      <section id="guide-rebalance" data-chapter className={styles.section}>
        <h2>목표와 달라졌다면, 조정 방법 비교하기</h2>
        <p>
          매수·매도 수량과 모든 제안을 반영한 예상 비중을 함께 확인하세요.
          주식은 1주, 가상자산은 소수점 8자리 단위로 계산합니다.
        </p>
        <figure>
          <img
            src="/guide/desktop-rebalance.jpg"
            width="1265"
            height="1078"
            loading="lazy"
            alt="리밸런싱의 주식 매수 매도 제안과 예상 비중 비교 화면"
          />
          <figcaption>
            제안은 검토용이며 주문을 실행하지 않습니다. 수수료·세금은 별도로
            확인하세요.
          </figcaption>
        </figure>
      </section>
      <section id="guide-faq" data-chapter className={styles.section}>
        <h2>자주 묻는 질문</h2>
        {questions.map(([question, answer, ...details]) => (
          <details key={question} className={styles.question}>
            <summary>
              {question}
              <ChevronRight size={17} />
            </summary>
            <p>{answer}</p>
            {details.length > 0 && (
              <ul className={styles.answerPoints}>
                {details.map((point) => <li key={point}>{point}</li>)}
              </ul>
            )}
          </details>
        ))}
      </section>
      <section id="guide-calculator" className={styles.section}>
        <details className={styles.calculatorTool} onToggle={event => { if (event.currentTarget.open) setCalculatorLoaded(true); }}>
          <summary>
            <span><strong>물타기·불타기 계산기</strong><small>추가 매수 후 평단가를 미리 계산해 보세요.</small></span>
            <ChevronRight size={18} />
          </summary>
          {calculatorLoaded && <AveragePriceCalculator />}
        </details>
      </section>
      <footer className={styles.end}>
        <strong>투자는 나만의 리듬으로. 내 기준을 지키며, 꾸준히.</strong>
        <p>현재 보유 자산을 확인한 후 목표 비중을 정해보세요.</p>
        {onNavigate ? (
          action("strategy", "내 목표 설계하기")
        ) : (
          <a href="/">
            로그인하고 시작하기
          </a>
        )}
      </footer>
    </article>
  );
}
