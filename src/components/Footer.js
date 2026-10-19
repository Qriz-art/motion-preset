import { Clapperboard } from "lucide-react";

const YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="mt-4 border-t border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 sm:py-10">
        <div className="max-w-md">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-white">
              <Clapperboard className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">Motion Presets</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Kumpulan preset Alight Motion pilihan dari kreator TikTok. Cari berdasarkan username,
            tonton preview videonya, lalu buka link preset langsung dari halaman ini.
          </p>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
          <p className="text-xs text-muted">
            © {YEAR} Motion Presets. Dibuat dengan kesabaran manusia.
          </p>
        </div>
      </div>
    </footer>
  );
}
