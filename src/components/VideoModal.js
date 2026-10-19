"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, TriangleAlert, X } from "lucide-react";

const UNAVAILABLE_MESSAGE = "Preview video tidak tersedia saat ini.";

function trapFocus(event, container) {
  if (!container) return;

  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), video[controls], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const items = Array.from(focusable).filter(
    (element) => element.offsetWidth > 0 || element.offsetHeight > 0
  );
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Modal preview video TikTok.
 *
 * - Video diambil dari /api/preview hanya ketika modal dibuka.
 * - Saat modal ditutup, pemutaran dihentikan dan src video dibersihkan
 *   supaya video tidak berjalan di latar belakang.
 */
export default function VideoModal({ preset, onClose }) {
  const [status, setStatus] = useState("loading");
  const [video, setVideo] = useState(null);
  const [message, setMessage] = useState("");

  const dialogRef = useRef(null);
  const videoRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const stopPlayback = useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    try {
      node.pause();
    } catch {
      // abaikan: browser bisa menolak pause pada elemen yang sudah dilepas
    }
    node.removeAttribute("src");
    try {
      node.load();
    } catch {
      // abaikan
    }
  }, []);

  useEffect(() => {
    lastFocusedRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key === "Tab") {
        trapFocus(event, dialogRef.current);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      stopPlayback();

      const previous = lastFocusedRef.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [stopPlayback]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadPreview() {
      setStatus("loading");
      setMessage("");
      setVideo(null);

      try {
        const response = await fetch(
          `/api/preview?url=${encodeURIComponent(preset.tiktokUrl)}`,
          { signal: controller.signal }
        );
        const data = await response.json().catch(() => null);

        if (cancelled) return;

        if (!response.ok || !data?.ok || typeof data?.videoUrl !== "string") {
          setMessage(data?.error || UNAVAILABLE_MESSAGE);
          setStatus("error");
          return;
        }

        setVideo({ url: data.videoUrl, quality: data.quality ?? null });
        setStatus("ready");
      } catch (error) {
        if (cancelled || error?.name === "AbortError") return;
        setMessage(UNAVAILABLE_MESSAGE);
        setStatus("error");
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [preset.tiktokUrl]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full w-full items-center justify-center"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="judul-preview-video"
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                Preview Video
              </p>
              <h2
                id="judul-preview-video"
                className="truncate text-sm font-semibold text-ink"
                title={preset.username}
              >
                {preset.username}
              </h2>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Tutup preview"
              className="-mt-0.5 -mr-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="relative flex min-h-[240px] items-center justify-center bg-neutral-950 sm:min-h-[360px]">
            {status === "loading" ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Loader2 className="size-6 animate-spin text-neutral-400" aria-hidden="true" />
                <p className="text-sm text-neutral-300">Menyiapkan preview video...</p>
              </div>
            ) : null}

            {status === "error" ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <TriangleAlert className="size-6 text-neutral-400" aria-hidden="true" />
                <p className="text-sm text-neutral-200">{message || UNAVAILABLE_MESSAGE}</p>
                <p className="max-w-xs text-xs leading-relaxed text-neutral-400">
                  Kamu tetap bisa menonton video aslinya langsung di TikTok.
                </p>
              </div>
            ) : null}

            {status === "ready" && video ? (
              <video
                key={video.url}
                ref={videoRef}
                src={video.url}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={() => {
                  stopPlayback();
                  setMessage(UNAVAILABLE_MESSAGE);
                  setStatus("error");
                }}
                className="max-h-[60vh] w-full bg-neutral-950 object-contain"
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
            <span className="text-xs text-muted">
              {status === "ready" && video?.quality
                ? `Kualitas ${video.quality}`
                : "Video diputar langsung dari sumber TikTok."}
            </span>

            <a
              href={preset.tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Buka di TikTok
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
