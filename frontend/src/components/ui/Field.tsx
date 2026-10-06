import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-[10px] border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-subtle " +
  "transition-[border-color,box-shadow] duration-150 outline-none " +
  "focus:border-brand focus:ring-4 focus:ring-brand/12 disabled:bg-canvas disabled:text-ink-muted";

function controlClass(invalid: boolean, extra?: string) {
  return cn(CONTROL, invalid ? "border-danger focus:border-danger focus:ring-danger/12" : "border-line-strong", extra);
}

interface FieldProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + error/hint, wired together for screen readers. */
export function Field({ id, label, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

type WithInvalid<T> = T & { invalid?: boolean };

export function TextInput({ invalid = false, className, ...props }: WithInvalid<InputHTMLAttributes<HTMLInputElement>>) {
  return (
    <input
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && props.id ? `${props.id}-error` : undefined}
      className={controlClass(invalid, cn("h-11", className))}
      {...props}
    />
  );
}

export function TextArea({ invalid = false, className, ...props }: WithInvalid<TextareaHTMLAttributes<HTMLTextAreaElement>>) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={controlClass(invalid, cn("min-h-20 resize-y py-2.5", className))}
      {...props}
    />
  );
}

export function Select({ invalid = false, className, ...props }: WithInvalid<SelectHTMLAttributes<HTMLSelectElement>>) {
  return <select aria-invalid={invalid || undefined} className={controlClass(invalid, cn("h-11", className))} {...props} />;
}
