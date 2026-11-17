import styles from "./status.module.css";

export default function Loading() {
  return (
    <main className={styles.page} aria-busy="true">
      <div className={styles.spinner} role="status" aria-label="불러오는 중" />
    </main>
  );
}
