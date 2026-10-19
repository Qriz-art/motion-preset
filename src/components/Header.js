import Link from "next/link";
import { Clapperboard } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          aria-label="Motion Presets — beranda"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white sm:size-10">
            <Clapperboard className="size-4.5 sm:size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-tight text-ink sm:text-base">
              Motion Presets
            </span>
            <span className="block truncate text-[11px] text-muted sm:text-xs">
              Alight Motion Community
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}
