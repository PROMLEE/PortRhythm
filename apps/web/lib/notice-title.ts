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
