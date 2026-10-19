import { ExternalLink, Film, Play } from "lucide-react";

/**
 * Kartu preset. Dibuat ringkas agar banyak preset bisa tampil tanpa
 * terlalu banyak menggulir.
 */
export default function PresetCard({ preset, onPreview }) {
  const sequence = String(preset.number).padStart(2, "0");

  return (
    <article className="group flex flex-col rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-xs tabular-nums text-muted">{sequence}</span>
        <Film
          className="size-4 text-line-strong transition-colors group-hover:text-muted"
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 min-w-0">
        <h3 className="truncate text-base font-semibold tracking-tight text-ink" title={preset.username}>
          {preset.username}
        </h3>
        <p className="mt-0.5 text-xs text-muted">Alight Motion Preset</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onPreview(preset)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Play className="size-3.5" aria-hidden="true" />
          Preview
        </button>

        <a
          href={preset.presetUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Buka link preset Alight Motion milik ${preset.username}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-semibold tracking-wide text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          PRESET
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
