"use client";

import { Search, X } from "lucide-react";

/**
 * Kolom pencarian username kreator.
 * Pencarian dilakukan di sisi klien, jadi tidak ada permintaan API baru
 * setiap kali pengunjung mengetik.
 */
export default function SearchBar({
  value,
  onChange,
  placeholder = "Cari username kreator...",
  inputId = "pencarian-preset",
}) {
  const hasValue = value.length > 0;

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Cari preset berdasarkan username kreator TikTok
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="w-full rounded-xl border border-line bg-surface py-3 pr-11 pl-10 text-sm text-ink shadow-xs transition-colors outline-none placeholder:text-muted focus:border-line-strong focus:ring-4 focus:ring-ink/5 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />
        {hasValue ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Hapus kata pencarian"
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
