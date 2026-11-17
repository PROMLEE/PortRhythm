"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./status.module.css";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <h1>화면을 표시하지 못했습니다</h1>
      <p>
        일시적인 문제일 수 있습니다. 다시 시도해도 같은 화면이 보이면 잠시 후
        접속해 주세요. 저장된 자산 정보는 그대로 유지됩니다.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => retry()}>
          다시 시도
        </button>
        <Link href="/" className={styles.secondary}>
          홈으로
        </Link>
      </div>
    </main>
  );
}
