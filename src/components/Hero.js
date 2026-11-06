import SearchBar from "@/components/SearchBar";
import TikTokSearch from "@/components/TikTokSearch";

/**
 * Hero section yang sengaja dibuat pendek supaya daftar preset tetap
 * cepat terlihat tanpa perlu banyak menggulir.
 */
export default function Hero({ query, onSearchChange }) {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-11">
        <p className="inline-flex items-center rounded-full border border-line bg-canvas px-3 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">
          Preset dari komunitas TikTok
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink text-balance sm:text-4xl lg:text-5xl">
          Make Every Edit Feel Different.
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          Temukan preset Alight Motion untuk membuat video edit kamu semakin menarik.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="max-w-xl flex-1">
            <SearchBar value={query} onChange={onSearchChange} />
          </div>
          <TikTokSearch />
        </div>
      </div>
    </section>
  );
}
