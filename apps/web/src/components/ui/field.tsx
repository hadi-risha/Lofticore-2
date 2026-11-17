import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

// A labelled input with its error message wired up for screen readers.
export const Field = forwardRef<HTMLInputElement, Props>(function Field(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          "h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition-colors",
          "placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/20",
          error ? "border-danger" : "border-line",
        )}
        {...rest}
      />
      {(error || hint) && (
        <p id={messageId} className={cn("mt-1.5 text-xs", error ? "text-danger" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
