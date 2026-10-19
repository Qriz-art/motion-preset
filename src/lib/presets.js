import { isHttpUrl, parseHttpUrl } from "@/lib/url";
import {
  extractTikTokUsername,
  isTikTokVideoUrl,
  normalizeTikTokUrl,
  normalizeUsername,
  presetDedupeKey,
  resolveTikTokUsername,
} from "@/lib/tiktok";

/** Username yang dipakai bila tidak ada satu pun sumber yang bisa dipercaya. */
export const FALLBACK_USERNAME = "Kreator TikTok";

/**
 * Menganalisis satu baris Google Sheets.
 *
 * Baris boleh berbentuk 2 kolom (Link TikTok, Link Preset) maupun 3 kolom
 * (Username, Link TikTok, Link Preset). Kolom Username bersifat opsional dan
 * hanya dipakai sebagai cadangan ketika URL TikTok tidak memuat username.
 *
 * Fungsi juga melaporkan posisi kolom tiap nilai supaya username hasil
 * resolusi bisa ditulis kembali ke sel yang kosong.
 *
 * @param {unknown} row
 */
function classifyRow(row) {
  const cells = Array.isArray(row) ? row : [];

  let tiktokUrl = null;
  let presetUrl = null;
  let sheetUsername = null;
  let tiktokColumn = null;
  let presetColumn = null;
  let usernameColumn = null;
  let hasContent = false;

  cells.forEach((rawCell, column) => {
    const cell = typeof rawCell === "string" ? rawCell.trim() : "";
    if (!cell) return;
    hasContent = true;

    if (!tiktokUrl && isTikTokVideoUrl(cell)) {
      tiktokUrl = cell;
      tiktokColumn = column;
      return;
    }

    if (isHttpUrl(cell)) {
      if (tiktokUrl && !presetUrl) {
        presetUrl = cell;
        presetColumn = column;
      }
      return;
    }

    if (!sheetUsername) {
      const normalized = normalizeUsername(cell);
      if (normalized) {
        sheetUsername = normalized;
        usernameColumn = column;
      }
    }
  });

  return {
    tiktokUrl,
    presetUrl,
    sheetUsername,
    tiktokColumn,
    presetColumn,
    usernameColumn,
    hasContent,
  };
}

/**
 * Mengubah indeks kolom (0-based) menjadi huruf kolom A1 (A, B, ..., AA).
 *
 * @param {number} index
 * @returns {string}
 */
function columnIndexToLetter(index) {
  let letter = "";
  let remaining = index;

  while (remaining >= 0) {
    letter = String.fromCharCode((remaining % 26) + 65) + letter;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return letter;
}

/**
 * Mengubah baris mentah Google Sheets menjadi daftar preset yang siap dikirim
 * ke frontend.
 *
 * Aturan:
 * - Baris pertama (header) otomatis terlewat karena tidak berisi URL yang sah.
 * - Baris kosong atau baris dengan link tidak valid diabaikan.
 * - Urutan mengikuti urutan baris pada Sheet.
 * - Nomor urut dibuat di sini, bukan diketik manual di Sheet.
 *
 * Tiap preset menyimpan `sheetRow` dan `sheetUsernameColumn` (null bila kolom
 * username sudah terisi) supaya username hasil resolusi bisa ditulis kembali
 * ke sel yang masih kosong.
 *
 * @param {unknown[][]} rows
 * @param {{ startRow?: number }} [options] baris awal data di Sheet (default 1)
 * @returns {{ presets: Array<object>, skippedRows: number }}
 */
export function buildPresets(rows, { startRow = 1 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const presets = [];
  const seen = new Set();
  let skippedRows = 0;

  list.forEach((row, index) => {
    const {
      tiktokUrl,
      presetUrl,
      sheetUsername,
      tiktokColumn,
      presetColumn,
      usernameColumn,
      hasContent,
    } = classifyRow(row);

    if (!hasContent) return;
    if (!tiktokUrl || !presetUrl) {
      skippedRows += 1;
      return;
    }

    const safeTiktokUrl = normalizeTikTokUrl(tiktokUrl);
    const safePresetUrl = parseHttpUrl(presetUrl)?.toString() ?? null;
    if (!safePresetUrl) {
      skippedRows += 1;
      return;
    }

    const key = presetDedupeKey(safeTiktokUrl, safePresetUrl);
    if (seen.has(key)) {
      skippedRows += 1;
      return;
    }
    seen.add(key);

    const derivedUsername = extractTikTokUsername(safeTiktokUrl);

    let sheetUsernameColumn = null;
    if (usernameColumn === null && tiktokColumn !== null && presetColumn !== null) {
      sheetUsernameColumn = columnIndexToLetter(Math.max(tiktokColumn, presetColumn) + 1);
    }

    presets.push({
      number: presets.length + 1,
      username: derivedUsername ?? sheetUsername ?? FALLBACK_USERNAME,
      tiktokUrl: safeTiktokUrl,
      presetUrl: safePresetUrl,
      sheetRow: startRow + index,
      sheetUsernameColumn,
    });
  });

  return { presets, skippedRows };
}

/**
 * Mengisi username yang masih memakai nilai cadangan dengan username asli
 * hasil resolusi link pendek TikTok.
 *
 * Hanya preset yang tidak punya sumber username lain (dari URL kanonis atau
 * kolom Sheets) yang di-resolve. Resolusi berjalan paralel dan hasilnya
 * di-cache, jadi permintaan berikutnya tidak menghubungi TikTok lagi.
 *
 * @param {Array<object>} presets
 * @returns {Promise<Array<object>>}
 */
export async function enrichPresetUsernames(presets) {
  const list = Array.isArray(presets) ? presets : [];
  const pending = list.filter((preset) => preset?.username === FALLBACK_USERNAME);
  if (pending.length === 0) return list;

  await Promise.all(
    pending.map(async (preset) => {
      const resolved = await resolveTikTokUsername(preset.tiktokUrl);
      if (resolved) preset.username = resolved;
    })
  );

  return list;
}
