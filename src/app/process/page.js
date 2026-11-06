"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ProcessPage() {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const abortRef = useRef(null);

  const addLog = useCallback((message, type = "info") => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString("id-ID"), message, type },
    ]);
  }, []);

  const runProcess = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("running");
    setErrorMessage("");
    setLogs([]);
    setResult(null);

    addLog("Memulai proses batch dari Google Sheet...");

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);

      if (controller.signal.aborted) return;

      if (!response.ok || !data?.ok) {
        setErrorMessage(data?.error || "Gagal memproses batch.");
        setStatus("error");
        addLog(`Error: ${data?.error || "Gagal memproses batch."}`, "error");
        return;
      }

      setResult(data);
      setStatus("done");
      addLog(
        `Selesai: ${data.processed} video diproses, ${data.found} link AM ditemukan.`,
        "success"
      );

      for (const item of data.results) {
        if (item.error) {
          addLog(`Baris ${item.row}: ${item.error}`, "error");
        } else if (item.amUrl) {
          addLog(
            `Baris ${item.row}: link AM ditemukan (${item.amFound})`,
            "success"
          );
        } else {
          addLog(`Baris ${item.row}: tidak ada link AM`, "muted");
        }
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") return;
      setErrorMessage("Terjadi kesalahan saat memproses.");
      setStatus("error");
      addLog(`Error: ${error?.message ?? "Terjadi kesalahan."}`, "error");
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setErrorMessage("");
    setLogs([]);
    setResult(null);
  }, []);

  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex items-center gap-2.5 mb-6">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-white">
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Proses Batch Google Sheet</h1>
              <p className="text-sm text-muted">
                Baca link TikTok dari sheet → scrape komentar → cari link AM → tulis ke baris yang sama.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-ink">Status</span>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    status === "idle"
                      ? "bg-canvas text-muted border border-line"
                      : status === "running"
                      ? "bg-blue-50 text-blue-700 border border-blue-100"
                      : status === "done"
                      ? "bg-green-50 text-green-700 border border-green-100"
                      : "bg-red-50 text-red-700 border border-red-100"
                  }`}
                >
                  {status === "idle" ? "Siap" : status === "running" ? "Sedang memproses..." : status === "done" ? "Selesai" : "Error"}
                </span>
              </div>

              <button
                type="button"
                onClick={runProcess}
                disabled={status === "running"}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  status === "running"
                    ? "bg-neutral-400 text-white disabled:cursor-not-allowed"
                    : "bg-ink text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                }`}
              >
                {status === "running" ? "Sedang memproses..." : "Mulai Proses Batch"}
              </button>

              {status === "done" && result && (
                <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-sm text-green-800">
                    {result.message}
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-sm text-red-800">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-2 inline text-xs underline underline-offset-4 hover:text-red-700"
                  >
                    Coba lagi
                  </button>
                </div>
              )}
            </div>

            {logs.length > 0 && (
              <div className="rounded-xl border border-line bg-surface">
                <h2 className="px-4 py-3 text-sm font-semibold text-ink border-b border-line">
                  Log Proses
                </h2>
                <div className="max-h-96 overflow-y-auto">
                  <div className="space-y-1">
                    {logs.map((log, index) => (
                      <div
                        key={index}
                        className="px-4 py-2 text-xs border-b border-neutral-50/50 last:border-0 flex justify-between"
                      >
                        <span className="text-muted">{log.time}</span>
                        <span
                          className={`truncate ml-2 ${
                            log.type === "success"
                              ? "text-green-700"
                              : log.type === "error"
                              ? "text-red-700"
                              : log.type === "muted"
                              ? "text-neutral-500"
                              : "text-ink"
                          }`}
                        >
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {status === "idle" && (
              <div className="rounded-xl border border-line bg-surface p-6">
                <h2 className="text-sm font-semibold text-ink mb-3">Cara kerja</h2>
                <ol className="list-disc list-inside text-sm text-muted space-y-2">
                  <li>Membaca semua baris dari Google Sheet yang terhubung dengan Google Form.</li>
                  <li>Mencari link video TikTok di setiap baris.</li>
                  <li>Mengambil komentar dari setiap video TikTok.</li>
                  <li>Mencari link Alight Motion (alightmotion.com) di komentar.</li>
                  <li>Menulis link AM yang ditemukan ke kolom B pada baris yang sama.</li>
                </ol>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
