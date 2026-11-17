import { useEffect, type ReactNode } from "react";
import { Button } from "./button";

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// A proper "are you sure?" for actions that can't be undone.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Keep it",
  danger,
  loading,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-cream p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-xl">
          {title}
        </h2>
        {children && <div className="mt-2 text-sm text-ink/80">{children}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} autoFocus>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
