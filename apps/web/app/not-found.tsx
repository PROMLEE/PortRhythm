import type { Metadata } from "next";
import Link from "next/link";
import styles from "./status.module.css";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다 | PortRhythm",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <div className={styles.actions}>
        <Link href="/" className={styles.primary}>
          홈으로
        </Link>
        <Link href="/guide" className={styles.secondary}>
          사용 가이드
        </Link>
      </div>
    </main>
  );
}
