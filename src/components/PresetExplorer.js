"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import Hero from "@/components/Hero";
import PresetCard from "@/components/PresetCard";
import PresetListSkeleton from "@/components/PresetListSkeleton";
import VideoModal from "@/components/VideoModal";

const GENERIC_ERROR =
  "Tidak dapat memuat data preset. Periksa koneksi internet lalu coba lagi.";

function normalizeSearchTerm(value) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

/**
 * Komponen utama halaman: memuat daftar preset sekali dari /api/presets,
 * lalu melakukan pencarian di sisi klien tanpa permintaan API tambahan.
 */
export default function PresetExplorer() {
  const [status, setStatus] = useState("loading");
  const [presets, setPresets] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [activePreset, setActivePreset] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const response = await fetch("/api/presets", { signal: controller.signal });
        const data = await response.json().catch(() => null);

        if (controller.signal.aborted) return;

        if (!response.ok || !data?.ok) {
          setErrorMessage(data?.error || GENERIC_ERROR);
          setStatus("error");
          return;
        }

        setPresets(Array.isArray(data.presets) ? data.presets : []);
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setErrorMessage(GENERIC_ERROR);
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, [reloadKey]);

  const retryLoad = useCallback(() => {
    setStatus("loading");
    setErrorMessage("");
    setReloadKey((key) => key + 1);
  }, []);

  const searchTerm = normalizeSearchTerm(query);

  const filteredPresets = useMemo(() => {
    if (!searchTerm) return presets;
    return presets.filter((preset) =>
      normalizeSearchTerm(preset.username).includes(searchTerm)
    );
  }, [presets, searchTerm]);

  const isSearching = searchTerm.length > 0;
  const closeModal = useCallback(() => setActivePreset(null), []);

  function renderCountLabel() {
    if (status === "loading") return "Memuat daftar preset...";
    if (status === "error") return "Daftar preset belum bisa ditampilkan.";
    if (presets.length === 0) return "Belum ada preset pada sumber data.";

    if (isSearching) {
      return `${filteredPresets.length} dari ${presets.length} preset cocok dengan pencarian.`;
    }

    return `${presets.length} preset berhasil dimuat.`;
  }

  function renderContent() {
    if (status === "loading") return <PresetListSkeleton />;

    if (status === "error") {
      return <ErrorState message={errorMessage} onRetry={retryLoad} />;
    }

    if (presets.length === 0) return <EmptyState variant="empty" />;

    if (filteredPresets.length === 0) {
      return (
        <EmptyState variant="search" query={query.trim()} onClearSearch={() => setQuery("")} />
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredPresets.map((preset) => (
          <PresetCard key={preset.number} preset={preset} onPreview={setActivePreset} />
        ))}
      </div>
    );
  }

  return (
    <>
      <Hero query={query} onSearchChange={setQuery} />

      <section
        id="koleksi"
        aria-labelledby="judul-koleksi"
        className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 py-8 sm:px-6 sm:py-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="judul-koleksi"
              className="text-lg font-semibold tracking-tight text-ink sm:text-xl"
            >
              Koleksi Preset
            </h2>
            <p aria-live="polite" className="mt-1 text-sm text-muted">
              {renderCountLabel()}
            </p>
          </div>

          {isSearching && status === "ready" && filteredPresets.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Reset pencarian
            </button>
          ) : null}
        </div>

        <div className="mt-5">{renderContent()}</div>
      </section>

      {activePreset ? <VideoModal preset={activePreset} onClose={closeModal} /> : null}
    </>
  );
}
