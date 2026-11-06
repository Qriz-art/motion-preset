/**
 * Utilitas validasi dan ekstraksi link Alight Motion dari teks komentar.
 * Link AM biasanya berbentuk alightmotion.com atau presets.alightmotion.com
 * dengan path yang mengandung preset atau template.
 */

const AM_HOST_PATTERNS = [
  "alightmotion.com",
  "presets.alightmotion.com",
  "alightmotioncreative.com",
  "alight.link",
  "alightcreative.com",
  "alight-motion.com",
  "p.alightmotion.com",
];

/**
 * Mengecek apakah hostname adalah domain Alight Motion.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isAmHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return AM_HOST_PATTERNS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Mengecek apakah sebuah URL adalah link Alight Motion yang valid.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAmUrl(value) {
  const url = parseHttpUrl(value);
  if (!url) return false;
  return isAmHost(url.hostname);
}

/**
 * Mengekstrak semua link Alight Motion dari teks komentar.
 *
 * @param {string} text
 * @returns {Array<string>}
 */
export function extractAmLinks(text) {
  if (typeof text !== "string") return [];

  const urlRegex = /https?:\/\/[^\s<>"'()]+/gi;
  const matches = text.match(urlRegex) ?? [];

  const seen = new Set();
  const links = [];

  for (const match of matches) {
    const url = parseHttpUrl(match);
    if (!url || !isAmHost(url.hostname)) continue;

    const clean = url.toString();
    if (!seen.has(clean)) {
      seen.add(clean);
      links.push(clean);
    }
  }

  return links;
}

function parseHttpUrl(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!/^https?:$/i.test(url.protocol)) return null;
  if (!url.hostname) return null;

  return url;
}
