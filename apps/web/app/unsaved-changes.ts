/** Register only while edits exist; browsers choose their own confirmation text. */
export function protectUnsavedChanges(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  dirty: boolean,
) {
  if (!dirty) return () => {};
  const handler = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };
  target.addEventListener("beforeunload", handler);
  return () => target.removeEventListener("beforeunload", handler);
}

/** PortfolioBuilder를 언마운트하지 않고 같은 draft를 공유하는 page.tsx view들. */
export const BUILDER_VIEWS = [
  "portfolio", "strategy", "preferences", "composition",
  "allocation", "rebalance", "history", "detail",
] as const;

export function isBuilderView(view: string): boolean {
  return (BUILDER_VIEWS as readonly string[]).includes(view);
}

/**
 * 이동 시 "버릴까요?" 확인이 필요한지.
 * - from === to → false
 * - otherDirty(빌더 draft 외의 미저장 입력) → true
 * - draftDirty && !(isBuilderView(from) && isBuilderView(to)) → true
 * - 그 외 false
 */
export function navigationNeedsConfirm(input: {
  from: string;
  to: string;
  draftDirty: boolean;
  otherDirty: boolean;
}): boolean {
  if (input.from === input.to) return false;
  if (input.otherDirty) return true;
  return (
    input.draftDirty && !(isBuilderView(input.from) && isBuilderView(input.to))
  );
}

/** 저장 직후 이동처럼 확인이 필요 없는 이동은 skipConfirm으로 건너뛴다. */
export function shouldConfirmNavigation(input: {
  from: string;
  to: string;
  draftDirty: boolean;
  otherDirty: boolean;
  skipConfirm?: boolean;
}): boolean {
  if (input.skipConfirm) return false;
  return navigationNeedsConfirm(input);
}
