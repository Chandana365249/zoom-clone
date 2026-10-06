"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DISMISS_AFTER_MS = 4000;

const ICONS = {
  success: <CircleCheck className="size-5 text-success" />,
  error: <CircleAlert className="size-5 text-danger" />,
  info: <Info className="size-5 text-brand" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);

  // The stack is a manual popover so it lives in the browser's top layer. Re-showing it after
  // each new toast moves it above any open modal <dialog> (which is also in the top layer).
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack?.showPopover) return;
    if (stack.matches(":popover-open")) stack.hidePopover();
    if (toasts.length > 0) stack.showPopover();
  }, [toasts]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++nextId.current;
      // Keep at most 3 on screen; newest at the bottom of the stack.
      setToasts((current) => [...current.slice(-2), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => show("success", message),
      error: (message) => show("error", message),
      info: (message) => show("info", message),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={stackRef}
        popover="manual"
        aria-live="polite"
        className={cn(
          "pointer-events-none inset-x-0 top-4 bottom-auto mx-auto h-auto w-[calc(100%-2rem)] max-w-sm",
          "overflow-visible border-0 bg-transparent p-0 open:flex flex-col items-center gap-2",
        )}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl",
              "border border-line bg-surface py-3 pr-3 pl-4 text-sm text-ink shadow-pop",
            )}
          >
            <span className="mt-px shrink-0">{ICONS[toast.kind]}</span>
            <p className="flex-1 leading-5 font-medium">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-0.5 text-ink-subtle hover:bg-canvas hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
