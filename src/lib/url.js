/**
 * Utilitas validasi URL yang dipakai bersama oleh server dan klien.
 * Tidak ada dependensi eksternal supaya aman dijalankan di runtime mana pun.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Mengubah string menjadi objek URL bila valid dan memakai protokol http/https.
 * Mengembalikan null bila tidak valid.
 *
 * @param {unknown} value
 * @returns {URL | null}
 */
export function parseHttpUrl(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (!url.hostname) return null;

  return url;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHttpUrl(value) {
  return parseHttpUrl(value) !== null;
}

/**
 * Membersihkan URL agar aman dipakai sebagai href.
 * Mengembalikan null bila bukan URL http/https yang valid.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function toSafeHref(value) {
  const url = parseHttpUrl(value);
  return url ? url.toString() : null;
}

/**
 * Membuang parameter pelacak (utm_*, fbclid, dsb) dan hash dari sebuah URL.
 *
 * @param {string} value
 * @returns {string}
 */
export function stripTrackingParams(value) {
  const url = parseHttpUrl(value);
  if (!url) return typeof value === "string" ? value.trim() : "";

  const removable = [];
  for (const key of url.searchParams.keys()) {
    if (/^(utm_|fbclid$|gclid$|si$|_r$|_t$|is_from_webapp$|sender_device$)/i.test(key)) {
      removable.push(key);
    }
  }
  for (const key of removable) url.searchParams.delete(key);

  url.hash = "";
  return url.toString();
}

/**
 * Membandingkan apakah hostname sama atau merupakan subdomain dari host tertentu.
 *
 * @param {string} hostname
 * @param {string} domain contoh: "tiktok.com"
 * @returns {boolean}
 */
export function hostnameMatches(hostname, domain) {
  const host = String(hostname || "").toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}
