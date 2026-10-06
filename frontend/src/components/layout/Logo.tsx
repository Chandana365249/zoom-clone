import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-baseline gap-1.5 rounded-md" aria-label="Zoom Clone home">
      <span className="text-[26px] leading-none font-extrabold tracking-[-0.04em] text-brand">zoom</span>
      <span className="hidden text-[13px] font-medium text-ink-muted sm:inline">Workplace</span>
    </Link>
  );
}
