"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Search, TriangleAlert, X } from "lucide-react";

const GENERIC_ERROR = "Terjadi kesalahan. Coba lagi nanti.";

/**
 * Tombol "Cari Preset" + modal popup pencarian preset dari TikTok.
 *
 * Popup berisi:
 *  1. Input link video TikTok.
 *  2. Klik Cari -> preview video dimuat dan diputar.
 *  3. Link AM dicari dari komentar pembuat (termasuk balasan) + deskripsi.
 *  4. Hasil: username kreator + tombol "Preset" (buka link AM).
 *  5. Bila link AM ditemukan, otomatis disimpan ke Google Sheets.
 */
export default function TikTokSearch() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [idle, setIdle] = useState(true);
  const [status, setStatus] = useState("idle"); // idle | searching | done
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState(null);

  const videoRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const stopPlayback = useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    try {
      node.pause();
    } catch {
      // abaikan
    }
    node.removeAttribute("src");
    try {
      node.load();
    } catch {
      // abaikan
    }
  }, []);

  const openModal = useCallback(() => {
    abortRef.current?.abort();
    stopPlayback();
    setUrl("");
    setIdle(true);
    setStatus("idle");
    setErrorMessage("");
    setData(null);
    setOpen(true);
  }, [stopPlayback]);

  const closeModal = useCallback(() => {
    abortRef.current?.abort();
    stopPlayback();
    setOpen(false);
  }, [stopPlayback]);

  // Kunci scroll body + tutup dengan Escape + fokus ke input saat modal terbuka.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    inputRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closeModal]);

  const handleSearch = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIdle(false);
    setStatus("searching");
    setErrorMessage("");
    setData(null);
    stopPlayback();

    try {
      const response = await fetch(
        `/api/search?url=${encodeURIComponent(trimmed)}&save=1`,
        { signal: controller.signal }
      );
      const result = await response.json().catch(() => null);

      if (controller.signal.aborted) return;

      if (!response.ok || !result?.ok) {
        setErrorMessage(result?.error || GENERIC_ERROR);
        setStatus("idle");
        return;
      }

      setData(result);
      setStatus("done");
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") return;
      setErrorMessage(GENERIC_ERROR);
      setStatus("idle");
    }
  }, [url, stopPlayback]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    stopPlayback();
    setUrl("");
    setIdle(true);
    setStatus("idle");
    setErrorMessage("");
    setData(null);
    inputRef.current?.focus();
  }, [stopPlayback]);

  const firstAm = data?.amLinks?.[0] ?? null;
  const video = data?.video ?? null;

  return (
    <>
      {/* Tombol pemicu */}
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Search className="size-4" aria-hidden="true" />
        Cari Preset
      </button>

      {/* Modal popup */}
      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className="flex min-h-full w-full items-center justify-center"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeModal();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Cari preset dari TikTok"
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            >
              {/* Header modal */}
              <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">
                    Cari Preset dari TikTok
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Masukkan link video, kami cari link preset Alight Motion-nya otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Tutup"
                  className="-mt-0.5 -mr-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              {/* Isi modal */}
              <div className="space-y-4 p-4">
                {/* Input link */}
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="https://www.tiktok.com/@user/video/123456789"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={status === "searching"}
                    className="w-full rounded-xl border border-line bg-surface py-3.5 pl-10 pr-24 text-sm text-ink shadow-xs transition-colors outline-none focus:border-line-strong focus:ring-4 focus:ring-ink/5 disabled:bg-canvas disabled:text-muted"
                  />
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  {status === "searching" ? (
                    <button
                      type="button"
                      disabled
                      className="absolute top-1/2 right-2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white"
                    >
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Mencari...
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSearch}
                      disabled={!url.trim()}
                      className="absolute top-1/2 right-2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                    >
                      Cari
                    </button>
                  )}
                </div>

                {errorMessage && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {errorMessage}
                    <button
                      type="button"
                      onClick={handleReset}
                      className="mt-2 inline text-xs underline underline-offset-4 hover:text-red-700"
                    >
                      Coba lagi
                    </button>
                  </div>
                )}

                {/* Hasil: video preview + tombol preset */}
                {!idle && (
                  <div className="space-y-4">
                    {/* Video preview */}
                    <div className="overflow-hidden rounded-2xl border border-line bg-neutral-950">
                      {status === "searching" ? (
                        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                          <Loader2
                            className="size-6 animate-spin text-neutral-400"
                            aria-hidden="true"
                          />
                          <p className="text-sm text-neutral-300">
                            Memuat preview video dan mencari link AM...
                          </p>
                        </div>
                      ) : null}

                      {status === "done" && video ? (
                        <video
                          key={video.videoUrl}
                          ref={videoRef}
                          src={video.videoUrl}
                          controls
                          autoPlay
                          playsInline
                          preload="metadata"
                          onError={() => {
                            stopPlayback();
                            setData((prev) => ({ ...prev, video: null }));
                          }}
                          className="max-h-[50vh] w-full bg-neutral-950 object-contain"
                        />
                      ) : null}

                      {status === "done" && !video ? (
                        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                          <TriangleAlert className="size-6 text-neutral-400" aria-hidden="true" />
                          <p className="text-sm text-neutral-200">
                            Preview video tidak tersedia saat ini.
                          </p>
                          <p className="max-w-xs text-xs leading-relaxed text-neutral-400">
                            Link preset tetap bisa dicari dari komentar.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* Tombol / area link preset */}
                    <div className="rounded-xl border border-line bg-surface p-4">
                      {status === "searching" ? (
                        <div className="flex items-center justify-center gap-3 py-3">
                          <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
                          <span className="text-sm text-muted">Mencari link AM...</span>
                        </div>
                      ) : null}

                      {status === "done" && firstAm ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700">
                              <Check className="size-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <p
                                className="truncate text-base font-semibold text-ink"
                                title={data.author}
                              >
                                {data.author
                                  ? `@${data.author.replace(/^@/, "")}`
                                  : "Preset ditemukan"}
                              </p>
                              <p className="text-xs text-muted">Preset Alight Motion</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={firstAm.amUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                            >
                              Preset
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                            <button
                              type="button"
                              onClick={handleReset}
                              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                            >
                              Cari video lain
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {status === "done" && !firstAm ? (
                        <div className="flex items-center justify-center gap-3 py-5">
                          <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-500">
                            Belum ada
                          </span>
                          <button
                            type="button"
                            onClick={handleReset}
                            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                          >
                            Cari video lain
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
