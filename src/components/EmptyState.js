import { Inbox, SearchX } from "lucide-react";

/**
 * Empty state untuk dua kondisi:
 * - "empty"  : Google Sheets belum berisi preset sama sekali
 * - "search" : pencarian tidak menemukan hasil
 */
export default function EmptyState({ variant = "empty", query = "", onClearSearch }) {
  const isSearch = variant === "search";
  const Icon = isSearch ? SearchX : Inbox;
  const title = isSearch ? "Preset tidak ditemukan" : "Belum ada preset yang tersedia";

  const description = isSearch
    ? `Tidak ada preset dengan username yang cocok dengan “${query}”. Coba kata kunci lain.`
    : "Daftar preset masih kosong. Preset akan muncul otomatis setelah pengelola mengirimkannya melalui Google Form.";

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-line bg-canvas text-muted">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{description}</p>

      {isSearch && onClearSearch ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-5 inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Hapus pencarian
        </button>
      ) : null}
    </div>
  );
}
