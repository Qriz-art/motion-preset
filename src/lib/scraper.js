import { isHttpUrl } from "@/lib/url";
import { isTikTokUrl, normalizeTikTokUrl } from "@/lib/tiktok";

const ATTEMPT_TIMEOUT_MS = 15000;
const PROBE_TIMEOUT_MS = 5000;
const PROBE_BYTES = 262144;
const FALLBACK_GRACE_MS = 6000;
const RESULT_CACHE_TTL_MS = 5 * 60 * 1000;
const RESULT_CACHE_MAX_ENTRIES = 80;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;

/**
 * Catatan penting soal cache:
 * Cache di bawah ini hanya "best effort". Pada serverless (Vercel) setiap
 * instance bisa dingin kapan saja, sehingga cache boleh kosong dan sistem
 * tetap harus bekerja dengan mengambil data baru.
 */
const resultCache = new Map();
const rateLimitStore = new Map();

/**
 * Error dengan kode yang bisa dipetakan menjadi pesan ramah pengguna.
 */
export class PreviewError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "PreviewError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Membungkus promise dengan batas waktu agar tidak menggantung selamanya.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} melebihi batas waktu ${ms} ms`)),
      ms
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function qualityScore(quality) {
  const value = String(quality ?? "").toLowerCase();
  if (/2160|4k/.test(value)) return 2160;
  if (/1440/.test(value)) return 1440;
  if (/1080|full ?hd|\bhd\b/.test(value)) return 1080;
  if (/720/.test(value)) return 720;
  if (/480|normal|sd/.test(value)) return 480;
  if (/360/.test(value)) return 360;
  return 500;
}

/**
 * User agent browser yang dipakai saat memeriksa apakah tautan video bisa
 * diputar. Beberapa layanan menolak permintaan tanpa user agent browser.
 */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Tingkat kompatibilitas kodek video:
 * 3 = kompatibel luas (H.264/VP9/AV1), 2 = tidak diketahui, 1 = HEVC.
 *
 * Banyak browser (terutama Chrome/Edge tanpa dukungan hardware) tidak bisa
 * menampilkan video HEVC walaupun audionya tetap diputar, sehingga tautan
 * HEVC hanya dipakai sebagai pilihan terakhir.
 */
function detectCodecTier(bytes) {
  const header = Buffer.from(bytes).toString("latin1");
  if (/avc1|avc3|vp09|av01/.test(header)) return 3;
  if (/hvc1|hev1/.test(header)) return 1;
  return 2;
}

/**
 * Memeriksa apakah URL video benar-benar bisa diakses dan mendeteksi kodeknya.
 *
 * Sebagian tautan hasil scraper (contoh: endpoint HD snaptik) mengembalikan
 * 403 Forbidden saat diputar langsung oleh browser, sehingga video di modal
 * gagal dimuat. Pemeriksaan singkat dengan permintaan "Range" hanya mengambil
 * potongan awal berkas (256 KB) tanpa mengunduh video penuh.
 *
 * @param {unknown} url
 * @returns {Promise<{ codecTier: number } | null>}
 */
async function probeVideoUrl(url) {
  if (!isHttpUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Range: `bytes=0-${PROBE_BYTES - 1}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // abaikan
      }
      return null;
    }

    const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("json") || contentType.includes("text/html")) {
      try {
        await response.body?.cancel();
      } catch {
        // abaikan
      }
      return null;
    }

    const bytes = await response.arrayBuffer();
    return { codecTier: detectCodecTier(bytes) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isVideoDownload(entry) {
  if (!entry || typeof entry.url !== "string" || !isHttpUrl(entry.url)) return false;

  const type = String(entry.type ?? "").toLowerCase();
  if (type === "photo" || type === "music" || type === "audio") return false;
  if (type === "video" || type === "mp4") return true;

  return /\.mp4(\?|#|$)/i.test(entry.url);
}

/**
 * Mengurutkan semua kandidat video dari kualitas terbaik ke terendah.
 *
 * @param {{ downloads?: Array<object> } | null | undefined} result
 * @returns {Array<object>}
 */
export function rankVideoDownloads(result) {
  const downloads = Array.isArray(result?.downloads) ? result.downloads : [];
  return downloads
    .filter(isVideoDownload)
    .slice()
    .sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality));
}

/**
 * Memilih satu URL video terbaik dari hasil scraper (tanpa validasi akses).
 *
 * @param {{ downloads?: Array<object> } | null | undefined} result
 * @returns {{ url: string, quality: string } | null}
 */
export function pickVideoDownload(result) {
  const best = rankVideoDownloads(result)[0];
  if (!best) return null;

  return { url: best.url, quality: String(best.quality ?? "video") };
}

/**
 * Memilih video terbaik yang benar-benar bisa diputar.
 *
 * Kandidat diuji dari kualitas tertinggi; tautan yang ditolak (misalnya 403
 * dari endpoint HD snaptik) dilewati. Kodek diprioritaskan: H.264/VP9/AV1
 * dulu, HEVC terakhir karena tidak semua browser bisa menampilkannya.
 *
 * @param {{ downloads?: Array<object> } | null | undefined} result
 * @returns {Promise<{ url: string, quality: string, codecTier: number } | null>}
 */
async function pickPlayableVideo(result) {
  const probed = [];

  for (const candidate of rankVideoDownloads(result)) {
    const probe = await probeVideoUrl(candidate.url);
    if (!probe) continue;

    probed.push({
      url: candidate.url,
      quality: String(candidate.quality ?? "video"),
      codecTier: probe.codecTier,
    });
  }

  if (probed.length === 0) return null;

  probed.sort(
    (a, b) => b.codecTier - a.codecTier || qualityScore(b.quality) - qualityScore(a.quality)
  );

  return probed[0];
}

function readAuthor(result) {
  const author = result?.author;
  if (typeof author === "string" && author.trim()) return author.trim();
  if (author && typeof author === "object" && typeof author.name === "string") {
    return author.name.trim() || null;
  }
  if (typeof result?.username === "string" && result.username.trim()) {
    return result.username.trim();
  }
  return null;
}

async function formatResult(rawResult, scraperName) {
  const video = await pickPlayableVideo(rawResult);
  if (!video) return null;

  const thumbnail = isHttpUrl(rawResult?.thumbnail) ? rawResult.thumbnail : null;

  return {
    videoUrl: video.url,
    quality: video.quality,
    codecTier: video.codecTier,
    scraper: scraperName,
    title: typeof rawResult?.title === "string" ? rawResult.title.slice(0, 200) : null,
    author: readAuthor(rawResult),
    thumbnail,
  };
}

async function loadTikTokScrapers() {
  const scraperModule = await import("@coflyn/scrapr");
  const tiktok = scraperModule?.tiktok ?? scraperModule?.default?.tiktok;
  if (!tiktok) {
    throw new PreviewError(
      "scraper_unavailable",
      "Modul scraper TikTok tidak tersedia pada versi paket yang terpasang."
    );
  }
  return tiktok;
}

/**
 * Mencoba beberapa metode scraper secara paralel dan memakai hasil valid
 * pertama yang selesai.
 *
 * Sebelumnya metode dijalankan berurutan sehingga satu metode yang menggantung
 * bisa menahan permintaan sampai puluhan detik sebelum metode berikutnya
 * dicoba. Dengan paralel, permintaan selesai secepat metode tercepat.
 *
 * Hasil berkodek HEVC (misalnya dari snaptik) tidak langsung dipakai karena
 * banyak browser hanya bisa memutar audionya. Hasil itu disimpan sebagai
 * cadangan sambil menunggu sebentar hasil berkodek yang lebih kompatibel.
 *
 * Metode yang butuh browser headless (savetik) sengaja dilewati karena tidak
 * cocok untuk lingkungan serverless Vercel.
 */
export async function scrapeTikTokVideo(tiktokUrl) {
  const tiktok = await loadTikTokScrapers();

  const chain = [
    ["snaptik", tiktok.snaptik],
    ["ssstik", tiktok.ssstik],
    ["tiktokio", tiktok.tiktokio],
    ["tikdownloader", tiktok.tikdownloader],
  ].filter(([, fn]) => typeof fn === "function");

  if (chain.length === 0) {
    throw new PreviewError(
      "scraper_unavailable",
      "Tidak ada metode scraper TikTok yang bisa dipakai."
    );
  }

  return new Promise((resolve, reject) => {
    const failures = [];
    let settled = false;
    let remaining = chain.length;
    let fallback = null;
    let fallbackTimer = null;

    const settle = (result) => {
      settled = true;
      clearTimeout(fallbackTimer);
      resolve(result);
    };

    const finish = () => {
      remaining -= 1;
      if (remaining > 0 || settled) return;

      if (fallback) {
        settle(fallback);
        return;
      }

      settled = true;
      reject(
        new PreviewError(
          "unavailable",
          `Semua metode scraper gagal. ${failures.join(" | ")}`,
          503
        )
      );
    };

    for (const [name, scrape] of chain) {
      (async () => {
        try {
          const response = await withTimeout(scrape(tiktokUrl), ATTEMPT_TIMEOUT_MS, name);

          if (!response || response.status !== true || !response.result) {
            failures.push(`${name}: ${response?.message ?? "tidak ada hasil"}`);
            return;
          }

          const formatted = await formatResult(response.result, name);
          if (!formatted) {
            failures.push(`${name}: tautan video tidak bisa diakses`);
            return;
          }

          if (settled || formatted.codecTier > 1) {
            if (!settled) settle(formatted);
            return;
          }

          if (!fallback) {
            fallback = formatted;
            fallbackTimer = setTimeout(() => {
              if (!settled) settle(fallback);
            }, FALLBACK_GRACE_MS);
          }
        } catch (error) {
          failures.push(`${name}: ${error?.message ?? error}`);
        } finally {
          finish();
        }
      })();
    }
  });
}

/**
 * Mengambil preview video dengan cache singkat supaya scraping tidak diulang
 * terus-menerus untuk video yang sama.
 */
export async function getVideoPreview(rawUrl) {
  if (!isTikTokUrl(rawUrl)) {
    throw new PreviewError("invalid_url", "Link TikTok tidak valid.", 400);
  }

  const cacheKey = normalizeTikTokUrl(rawUrl).toLowerCase();
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  const result = await scrapeTikTokVideo(rawUrl);

  if (resultCache.size >= RESULT_CACHE_MAX_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey !== undefined) resultCache.delete(oldestKey);
  }
  resultCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
  });

  return { ...result, cached: false };
}

/**
 * Pembatas permintaan sederhana per alamat IP (best effort, per instance).
 *
 * @param {string} identifier
 * @returns {{ limited: boolean, retryAfterSeconds: number }}
 */
export function checkRateLimit(identifier) {
  const now = Date.now();
  const key = String(identifier || "unknown");
  const bucket = rateLimitStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

export function getClientIdentifier(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
