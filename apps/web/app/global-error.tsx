"use client";

import { useEffect } from "react";

// Replaces the root layout, so it cannot rely on globals.css or the theme attribute.
export default function GlobalError({
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
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeContent: "center",
          justifyItems: "center",
          gap: 12,
          padding: "32px 20px",
          textAlign: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif',
          colorScheme: "light dark",
        }}
      >
        <title>오류 | PortRhythm</title>
        <h1 style={{ margin: 0, fontSize: 22 }}>PortRhythm을 열지 못했습니다</h1>
        <p style={{ margin: 0, maxWidth: 360, fontSize: 14, lineHeight: 1.7 }}>
          일시적인 문제일 수 있습니다. 저장된 자산 정보는 그대로 유지됩니다.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            minHeight: 44,
            marginTop: 12,
            padding: "0 18px",
            borderRadius: 10,
            border: "1px solid currentColor",
            background: "transparent",
            color: "inherit",
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
