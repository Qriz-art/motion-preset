import { hostnameMatches, parseHttpUrl, stripTrackingParams } from "@/lib/url";

/**
 * Host TikTok yang tidak memuat username di dalam URL.
 * Link seperti ini harus di-resolve dulu, jadi username tidak bisa dibaca langsung.
 */
const SHORTENER_HOSTS = new Set([
  "vm.tiktok.com",
  "vt.tiktok.com",
  "m.tiktok.com",
]);

/** Pola username TikTok: huruf, angka, titik, dan garis bawah. */
const USERNAME_PATTERN = /^[A-Za-z0-9._]{2,24}$/;

const RESOLVE_TIMEOUT_MS = 5000;
const USERNAME_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Cache hasil resolusi link pendek agar TikTok tidak dihubungi berulang kali
 * untuk link yang sama. Best effort, per instance server.
 */
const resolvedUsernameCache = new Map();

/**
 * Memeriksa apakah sebuah URL mengarah ke TikTok (termasuk subdomain).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTikTokUrl(value) {
  const url = parseHttpUrl(value);
  if (!url) return false;
  return hostnameMatches(url.hostname, "tiktok.com");
}

/**
 * Mengecek apakah URL mengarah ke halaman video/foto TikTok.
 * Link pendek (vm.tiktok.com) tetap dianggap link TikTok yang sah.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTikTokVideoUrl(value) {
  const url = parseHttpUrl(value);
  if (!url) return false;
  if (!hostnameMatches(url.hostname, "tiktok.com")) return false;

  const host = url.hostname.toLowerCase();
  if (SHORTENER_HOSTS.has(host)) {
    return url.pathname.replace(/\/+$/, "").length > 1;
  }

  return /\/@[^/]+\/video\/\d+/.test(url.pathname) || /\/@[^/]+\/photo\/\d+/.test(url.pathname);
}

/**
 * Mengambil username kreator dari URL TikTok.
 *
 * Contoh:
 *   https://www.tiktok.com/@editz.id/video/123456789  ->  "@editz.id"
 *
 * Mengembalikan null bila username tidak dapat diketahui dengan pasti
 * (misalnya pada link pendek vm.tiktok.com atau URL yang tidak valid).
 * Fungsi ini tidak pernah mengarang username.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function extractTikTokUsername(value) {
  const url = parseHttpUrl(value);
  if (!url) return null;
  if (!hostnameMatches(url.hostname, "tiktok.com")) return null;

  const host = url.hostname.toLowerCase();
  if (SHORTENER_HOSTS.has(host)) return null;

  const match = url.pathname.match(/\/@([^/?#]+)/);
  if (!match) return null;

  const username = decodeURIComponentSafe(match[1]).trim();
  if (!USERNAME_PATTERN.test(username)) return null;

  return `@${username}`;
}

/**
 * Mengambil username kreator dari URL TikTok, termasuk dari link pendek.
 *
 * Link pendek (vm.tiktok.com / vt.tiktok.com) tidak memuat username, jadi
 * URL diikuti pengalihannya sampai mendapat URL kanonis, lalu username
 * dibaca dari URL tersebut. Hanya dipanggil dari server.
 *
 * @param {unknown} value
 * @returns {Promise<string | null>}
 */
export async function resolveTikTokUsername(value) {
  const url = parseHttpUrl(value);
  if (!url) return null;

  const direct = extractTikTokUsername(url);
  if (direct) return direct;

  if (!SHORTENER_HOSTS.has(url.hostname.toLowerCase())) return null;

  const cacheKey = url.toString().toLowerCase();
  const cached = resolvedUsernameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.username;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": BROWSER_USER_AGENT },
      signal: controller.signal,
    });

    try {
      await response.body?.cancel();
    } catch {
      // abaikan: badan halaman tidak dibutuhkan
    }

    const username = extractTikTokUsername(response.url);
    if (username) {
      resolvedUsernameCache.set(cacheKey, {
        username,
        expiresAt: Date.now() + USERNAME_CACHE_TTL_MS,
      });
    }

    return username;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Menormalkan username dari kolom Google Sheets (misalnya "editz.id" -> "@editz.id").
 * Mengembalikan null bila bentuknya tidak wajar.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeUsername(value) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim().replace(/^@+/, "");
  if (!cleaned) return null;
  if (!USERNAME_PATTERN.test(cleaned)) return null;

  return `@${cleaned}`;
}

/**
 * Membersihkan URL TikTok dari parameter pelacak agar tidak duplikat di daftar.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeTikTokUrl(value) {
  return stripTrackingParams(value);
}

/**
 * Membuat key unik untuk deteksi duplikat.
 *
 * @param {string} tiktokUrl
 * @param {string} presetUrl
 * @returns {string}
 */
export function presetDedupeKey(tiktokUrl, presetUrl) {
  return `${normalizeTikTokUrl(tiktokUrl).toLowerCase()}::${String(presetUrl)
    .trim()
    .toLowerCase()}`;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
