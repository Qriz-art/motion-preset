import { JWT } from "google-auth-library";

import { buildPresets, enrichPresetUsernames, FALLBACK_USERNAME } from "@/lib/presets";

/**
 * Scope baca-tulis: selain membaca data, server juga mengisi kolom username
 * yang masih kosong dengan nama kreator hasil resolusi link TikTok.
 */
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_RANGE = "A1:E2000";
const REQUEST_TIMEOUT_MS = 12000;

/**
 * Error khusus Google Sheets supaya route handler bisa memetakan pesan yang
 * aman untuk pengunjung tanpa membocorkan detail internal.
 */
export class SheetsError extends Error {
  /**
   * @param {string} code
   * @param {string} message pesan internal, hanya dicatat di log server
   */
  constructor(code, message) {
    super(message);
    this.name = "SheetsError";
    this.code = code;
  }
}

/**
 * Memperbaiki format private key yang dibaca dari environment variable.
 *
 * Vercel menyimpan newline sebagai karakter literal "\n", sehingga perlu
 * diubah kembali menjadi baris baru. Nilai base64 juga didukung karena
 * lebih mudah ditempel pada dashboard hosting.
 *
 * @param {string | undefined} rawValue
 * @returns {string}
 */
export function normalizePrivateKey(rawValue) {
  if (typeof rawValue !== "string") return "";

  let key = rawValue.trim();
  if (!key) return "";

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  if (!key.includes("BEGIN") && /^[A-Za-z0-9+/=\s]+$/.test(key)) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN")) key = decoded;
    } catch {
      // Biarkan nilai asli dan biarkan tahap autentikasi yang melaporkan.
    }
  }

  return key
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

function readConfig() {
  const spreadsheetId = (process.env.GOOGLE_SHEETS_ID ?? "").trim();
  const clientEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const range = (process.env.GOOGLE_SHEETS_RANGE ?? "").trim() || DEFAULT_RANGE;

  const missing = [];
  if (!spreadsheetId) missing.push("GOOGLE_SHEETS_ID");
  if (!clientEmail) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!privateKey) missing.push("GOOGLE_PRIVATE_KEY");

  return { spreadsheetId, clientEmail, privateKey, range, missing };
}

async function getAccessToken(clientEmail, privateKey) {
  let accessToken;
  try {
    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [SHEETS_SCOPE],
    });
    const token = await auth.getAccessToken();
    accessToken = typeof token === "string" ? token : token?.token;
  } catch (error) {
    throw new SheetsError("auth_failed", `Gagal autentikasi: ${error?.message ?? error}`);
  }

  if (!accessToken) {
    throw new SheetsError("auth_failed", "Service account tidak mengembalikan access token.");
  }

  return accessToken;
}

/**
 * Membaca titik awal (baris) dan nama sheet dari range di environment variable,
 * supaya penulisan username bisa memakai alamat sel yang sama.
 *
 * Contoh: "Sheet1!A2:E2000" -> { sheetPrefix: "Sheet1!", startRow: 2 }
 *
 * @param {string} range
 * @returns {{ sheetPrefix: string, startRow: number }}
 */
function parseRangeAnchor(range) {
  const match = String(range).match(/^(?:(?:'([^']+)'|([^!]+))!)?\$?[A-Z]+\$?(\d+)/i);

  if (!match) return { sheetPrefix: "", startRow: 1 };

  const title = match[1] ?? match[2] ?? "";
  const startRow = Number(match[3]);

  return {
    sheetPrefix: title ? `${title}!` : "",
    startRow: Number.isInteger(startRow) && startRow > 0 ? startRow : 1,
  };
}

async function requestSheetValues({ spreadsheetId, clientEmail, privateKey, range }) {
  const accessToken = await getAccessToken(clientEmail, privateKey);

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SheetsError(
        mapHttpStatusToCode(response.status),
        `Google Sheets merespons ${response.status}: ${detail.slice(0, 300)}`
      );
    }

    const payload = await response.json();
    return Array.isArray(payload?.values) ? payload.values : [];
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    if (error?.name === "AbortError") {
      throw new SheetsError("timeout", "Permintaan ke Google Sheets melebihi batas waktu.");
    }
    throw new SheetsError("network_error", `Gagal menghubungi Google Sheets: ${error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
}

function mapHttpStatusToCode(status) {
  if (status === 401) return "auth_failed";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "sheets_error";
}

/**
 * Menambahkan baris baru ke Google Sheets (append).
 *
 * @param {{ spreadsheetId: string, clientEmail: string, privateKey: string }} config
 * @param {string} range contoh: "Sheet1!A:D"
 * @param {Array<Array<string>>} values baris data yang akan ditambahkan
 */
async function appendRows({ spreadsheetId, clientEmail, privateKey }, range, values) {
  const accessToken = await getAccessToken(clientEmail, privateKey);

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SheetsError(
        mapHttpStatusToCode(response.status),
        `Google Sheets menolak penambahan baris ${response.status}: ${detail.slice(0, 300)}`
      );
    }
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    if (error?.name === "AbortError") {
      throw new SheetsError("timeout", "Penambahan baris ke Google Sheets melebihi batas waktu.");
    }
    throw new SheetsError(
      "network_error",
      `Gagal menambahkan baris ke Google Sheets: ${error?.message ?? error}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Menulis username ke sel-sel kosong pada Google Sheets dalam satu permintaan.
 *
 * Gagal menulis bukan kesalahan fatal: pemanggil menangkap error ini dan
 * daftar preset tetap ditampilkan (username hanya tidak tersimpan ke Sheet).
 *
 * @param {{ spreadsheetId: string, clientEmail: string, privateKey: string }} config
 * @param {Array<{ range: string, username: string }>} writes
 */
async function writeUsernames({ spreadsheetId, clientEmail, privateKey }, writes) {
  const accessToken = await getAccessToken(clientEmail, privateKey);

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: writes.map(({ range, username }) => ({
          range,
          values: [[username]],
        })),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SheetsError(
        mapHttpStatusToCode(response.status),
        `Google Sheets menolak penulisan ${response.status}: ${detail.slice(0, 300)}`
      );
    }
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    if (error?.name === "AbortError") {
      throw new SheetsError("timeout", "Penulisan ke Google Sheets melebihi batas waktu.");
    }
    throw new SheetsError(
      "network_error",
      `Gagal menulis ke Google Sheets: ${error?.message ?? error}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mengambil daftar preset dari Google Sheets.
 *
 * Setelah preset dibangun, username yang belum diketahui (link pendek) diisi
 * hasil resolusi, lalu username yang belum ada di Sheet ditulis ke kolom
 * username pada baris terkait. Fungsi ini hanya boleh dipanggil dari server.
 *
 * @returns {Promise<{ presets: Array<object>, skippedRows: number }>}
 */
export async function getPresets() {
  const config = readConfig();

  if (config.missing.length > 0) {
    throw new SheetsError(
      "not_configured",
      `Environment variable belum lengkap: ${config.missing.join(", ")}`
    );
  }

  const rows = await requestSheetValues(config);
  const { sheetPrefix, startRow } = parseRangeAnchor(config.range);
  const { presets, skippedRows } = buildPresets(rows, { startRow });

  await enrichPresetUsernames(presets);

  const writes = presets
    .filter(
      (preset) =>
        preset.username !== FALLBACK_USERNAME && Boolean(preset.sheetUsernameColumn)
    )
    .map((preset) => ({
      range: `${sheetPrefix}${preset.sheetUsernameColumn}${preset.sheetRow}`,
      username: preset.username,
    }));

  if (writes.length > 0) {
    try {
      await writeUsernames(config, writes);
    } catch (error) {
      console.error(`[sheets] gagal menyimpan username: ${error?.message ?? error}`);
    }
  }

  return { presets, skippedRows };
}

/**
 * Menambahkan entri preset baru ke Google Sheets (Link TikTok, Link AM, Username, Tanggal).
 *
 * @param {string} tiktokUrl
 * @param {string} amUrl
 * @param {string} username
 * @param {string} date ISO string
 * @returns {Promise<void>}
 */
export async function appendPresetEntry(tiktokUrl, amUrl, username, date) {
  const config = readConfig();

  if (config.missing.length > 0) {
    throw new SheetsError(
      "not_configured",
      `Environment variable belum lengkap: ${config.missing.join(", ")}`
    );
  }

  const { sheetPrefix, startRow } = parseRangeAnchor(config.range);
  const range = `${sheetPrefix}A${startRow}:D`;

  await appendRows(config, range, [[tiktokUrl, amUrl, username, date]]);
}

/**
 * Menambahkan entri preset baru hanya bila URL TikTok belum pernah disimpan.
 *
 * Membaca isi kolom A (link TikTok) pada range yang sama, lalu melewati
 * penulisan bila sudah ada baris dengan URL yang sama (setelah dinormalkan).
 * Mengembalikan `true` bila baris baru ditulis, `false` bila dilewati karena
 * sudah ada.
 *
 * @param {string} tiktokUrl
 * @param {string} amUrl
 * @param {string} username
 * @param {string} date ISO string
 * @returns {Promise<boolean>}
 */
export async function appendPresetEntryIfNew(tiktokUrl, amUrl, username, date) {
  const config = readConfig();

  if (config.missing.length > 0) {
    throw new SheetsError(
      "not_configured",
      `Environment variable belum lengkap: ${config.missing.join(", ")}`
    );
  }

  const { sheetPrefix, startRow } = parseRangeAnchor(config.range);

  // Baca kolom A saja untuk memeriksa duplikat.
  const existingRows = await requestSheetValues({
    ...config,
    range: `${sheetPrefix}A${startRow}:A`,
  });

  const normalizedNew = normalizeTikTokUrlForDedupe(tiktokUrl);
  const alreadyExists = (Array.isArray(existingRows) ? existingRows : []).some((row) => {
    const cell = String(row?.[0] ?? "").trim();
    return cell && normalizeTikTokUrlForDedupe(cell) === normalizedNew;
  });

  if (alreadyExists) return false;

  const range = `${sheetPrefix}A${startRow}:D`;
  await appendRows(config, range, [[tiktokUrl, amUrl, username, date]]);
  return true;
}

function normalizeTikTokUrlForDedupe(value) {
  try {
    const url = new URL(value.trim());
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

/**
 * Memperbarui nilai sel tertentu di Google Sheets.
 *
 * @param {{ spreadsheetId: string, clientEmail: string, privateKey: string }} config
 * @param {string} range contoh: "Sheet1!B5"
 * @param {string} value nilai yang akan ditulis
 * @returns {Promise<void>}
 */
async function updateCell({ spreadsheetId, clientEmail, privateKey }, range, value) {
  const accessToken = await getAccessToken(clientEmail, privateKey);

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        values: [[value]],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SheetsError(
        mapHttpStatusToCode(response.status),
        `Google Sheets menolak pembaruan sel ${response.status}: ${detail.slice(0, 300)}`
      );
    }
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    if (error?.name === "AbortError") {
      throw new SheetsError("timeout", "Pembaruan sel Google Sheets melebihi batas waktu.");
    }
    throw new SheetsError(
      "network_error",
      `Gagal memperbarui sel Google Sheets: ${error?.message ?? error}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Memperbarui banyak sekaligus sel di Google Sheets dalam satu permintaan.
 *
 * @param {{ spreadsheetId: string, clientEmail: string, privateKey: string }} config
 * @param {Array<{ range: string, value: string }>} writes
 * @returns {Promise<void>}
 */
async function batchUpdateCells({ spreadsheetId, clientEmail, privateKey }, writes) {
  const accessToken = await getAccessToken(clientEmail, privateKey);

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: writes.map(({ range, value }) => ({
          range,
          values: [[value]],
        })),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SheetsError(
        mapHttpStatusToCode(response.status),
        `Google Sheets menolak pembaruan batch ${response.status}: ${detail.slice(0, 300)}`
      );
    }
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    if (error?.name === "AbortError") {
      throw new SheetsError("timeout", "Pembaruan batch Google Sheets melebihi batas waktu.");
    }
    throw new SheetsError(
      "network_error",
      `Gagal memperbarui batch Google Sheets: ${error?.message ?? error}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Membaca semua baris dari Google Sheet untuk diproses batch.
 * Mengembalikan array baris dengan nomor baris (1-based) dan sel-selnya.
 *
 * @returns {Promise<Array<{ row: number, cells: Array<string> }>>}
 */
export async function readSheetRows() {
  const config = readConfig();

  if (config.missing.length > 0) {
    throw new SheetsError(
      "not_configured",
      `Environment variable belum lengkap: ${config.missing.join(", ")}`
    );
  }

  const rows = await requestSheetValues(config);
  const { startRow } = parseRangeAnchor(config.range);

  return rows
    .map((cells, index) => ({
      row: startRow + index,
      cells: Array.isArray(cells) ? cells : [],
    }))
    .filter(({ cells }) => cells.length > 0);
}

/**
 * Menulis link AM ke kolom B pada baris yang sesuai di Google Sheet.
 *
 * @param {number} row nomor baris (1-based)
 * @param {string} amUrl link Alight Motion
 * @param {string} username username kreator (opsional)
 * @param {string} date tanggal proses (ISO string, opsional)
 * @returns {Promise<void>}
 */
export async function writeAmToRow(row, amUrl, username = "", date = "") {
  const config = readConfig();

  if (config.missing.length > 0) {
    throw new SheetsError(
      "not_configured",
      `Environment variable belum lengkap: ${config.missing.join(", ")}`
    );
  }

  const { sheetPrefix } = parseRangeAnchor(config.range);

  const writes = [
    { range: `${sheetPrefix}B${row}`, value: amUrl },
  ];

  if (username) {
    writes.push({ range: `${sheetPrefix}C${row}`, value: username });
  }

  if (date) {
    writes.push({ range: `${sheetPrefix}D${row}`, value: date });
  }

  await batchUpdateCells(config, writes);
}
