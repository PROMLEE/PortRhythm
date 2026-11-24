/**
 * Splits a notice title on its " · " separators so each part can wrap as a
 * unit: lines break after the "·", never inside "하락 단계" or "저장·시세".
 * Word joiners around an unspaced "·" keep compounds like 저장·시세 whole.
 */
export function noticeTitleParts(title: string) {
  return title
    .split(/\s+·\s+/)
    .map((part) => part.trim().replace(/(?<=\S)·(?=\S)/g, "\u2060·\u2060"))
    .filter(Boolean);
}

/**
 * Short title for the one-line banner: drops a leading date part such as
 * "2026.11.24 업데이트" so the subject is what stays visible on mobile.
 */
export function noticeBannerTitle(title: string) {
  const parts = title.split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  const datePrefix = /^\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}\.?(\s|$)/;
  return parts.length > 1 && datePrefix.test(parts[0])
    ? parts.slice(1).join(" · ")
    : title;
}
