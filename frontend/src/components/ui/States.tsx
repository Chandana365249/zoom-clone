import { CircleAlert, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand [&>svg]:size-6">
        {icon}
      </div>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <CircleAlert className="size-6" />
      </div>
      <p className="font-semibold text-ink">Couldn&apos;t load meetings</p>
      <p className="mt-1 max-w-xs text-sm text-ink-muted">{message}</p>
      <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
