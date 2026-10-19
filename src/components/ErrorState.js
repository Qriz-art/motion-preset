"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Pesan error yang ramah. Detail teknis hanya muncul di log server,
 * bukan di layar pengunjung.
 */
export default function ErrorState({ message, onRetry, isRetrying = false }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-14 text-center"
    >
      <span className="flex size-11 items-center justify-center rounded-full border border-line bg-canvas text-muted">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-ink">
        Data preset gagal dimuat
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
        {message || "Terjadi kesalahan saat memuat daftar preset. Silakan coba lagi."}
      </p>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCw
            className={`size-4 ${isRetrying ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {isRetrying ? "Memuat ulang..." : "Coba lagi"}
        </button>
      ) : null}
    </div>
  );
}
