import { noticeTitleParts } from "../lib/notice-title";

/** Renders a notice title so it wraps between its " · " parts first. */
export default function NoticeTitle({ title }: { title: string }) {
  const parts = noticeTitleParts(title);
  return parts.map((part, i) => (
    <span key={i} style={{ display: "inline-block", maxWidth: "100%" }}>
      {part}
      {i < parts.length - 1 && " · "}
    </span>
  ));
}
