"use client";
import { Check } from "lucide-react";
import styles from "./SaveStatus.module.css";

/** 상태(저장 안 됨 배지)와 행동(저장 버튼)을 서로 다른 요소로 보여 준다. */
export default function SaveStatus({
  dirty,
  saving,
  onSave,
  showSaved = false,
  saveLabel = "변경 내용 저장",
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  showSaved?: boolean;
  saveLabel?: string;
}) {
  if (dirty)
    return (
      <div className={styles.group}>
        <span className={styles.badge} role="status">
          저장 안 됨
        </span>
        <button
          type="button"
          className={styles.save}
          data-save
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "저장 중" : saveLabel}
        </button>
      </div>
    );
  if (showSaved)
    return (
      <div className={styles.group}>
        <span className={styles.saved}>
          <Check size={15} /> 저장됨
        </span>
      </div>
    );
  return null;
}
