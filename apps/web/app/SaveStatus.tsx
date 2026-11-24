"use client";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./SaveStatus.module.css";

/**
 * Bottom save bar: appears only while there are unsaved edits, next to where the user is working,
 * and leaves once saved (the save notice confirms the result).
 */
export default function SaveBar({
  dirty,
  saving,
  onSave,
  message = "저장하지 않은 변경 사항이 있어요",
  saveLabel = "저장",
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  message?: string;
  saveLabel?: string;
}) {
  const [justSaved, setJustSaved] = useState(false);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (saving) wasSaving.current = true;
    else if (wasSaving.current) {
      wasSaving.current = false;
      if (!dirty) {
        setJustSaved(true);
        const timer = setTimeout(() => setJustSaved(false), 1800);
        return () => clearTimeout(timer);
      }
    }
  }, [saving, dirty]);
  useEffect(() => {
    if (dirty) setJustSaved(false);
  }, [dirty]);
  if (!dirty && justSaved)
    return (
      <>
        <div className={styles.spacer} aria-hidden="true" />
        <div className={`${styles.bar} ${styles.done}`} role="region" aria-label="변경 사항 저장">
          <p role="status" aria-live="polite">
            <Check size={16} aria-hidden="true" />
            저장했어요
          </p>
        </div>
      </>
    );
  if (!dirty) return null;
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <div className={styles.bar} role="region" aria-label="변경 사항 저장">
        <p role="status" aria-live="polite">
          <span className={styles.dot} aria-hidden="true" />
          {saving ? "저장하는 중이에요" : message}
        </p>
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
    </>
  );
}
