import { NextResponse } from "next/server";

import { getPresets, SheetsError } from "@/lib/sheets";

/**
 * Endpoint untuk daftar preset.
 * Route ini tidak pernah menerima data dari pengunjung. Satu-satunya data
 * yang ditulis ke Google Sheets adalah username kreator hasil resolusi link
 * TikTok yang diambil server sendiri, dan hanya mengisi sel username yang
 * masih kosong.
 *
 * Selalu dirender saat diminta supaya build tidak bergantung pada Google
 * Sheets, lalu responsnya di-cache singkat lewat header Cache-Control
 * (60 detik, dengan stale-while-revalidate). Bila cache kosong, data tetap
 * diambil ulang secara normal.
 */
export const dynamic = "force-dynamic";

/**
 * Hanya bidang yang dibutuhkan frontend yang dikirim; metadata internal
 * seperti nomor baris Sheet tidak ikut dipublikasikan.
 */
function toPublicPreset(preset) {
  return {
    number: preset.number,
    username: preset.username,
    tiktokUrl: preset.tiktokUrl,
    presetUrl: preset.presetUrl,
  };
}

const PUBLIC_ERROR_MESSAGES = {
  not_configured:
    "Sumber data preset belum dikonfigurasi. Pengelola website perlu melengkapi environment variable Google Sheets.",
  auth_failed: "Website belum bisa mengakses Google Sheets saat ini. Coba beberapa saat lagi.",
  permission_denied:
    "Website belum mendapat izin membaca spreadsheet. Pastikan spreadsheet sudah dibagikan ke service account.",
  not_found: "Spreadsheet preset tidak ditemukan. Hubungi pengelola website.",
  rate_limited: "Permintaan ke Google Sheets sedang dibatasi. Coba lagi sebentar lagi.",
  timeout: "Google Sheets terlalu lama merespons. Coba lagi.",
  network_error: "Tidak dapat menghubungi Google Sheets. Periksa koneksi lalu coba lagi.",
  sheets_error: "Data preset gagal dimuat dari Google Sheets. Coba lagi.",
  unknown: "Terjadi kesalahan saat memuat data preset. Coba lagi.",
};

function toPublicMessage(code) {
  return PUBLIC_ERROR_MESSAGES[code] ?? PUBLIC_ERROR_MESSAGES.unknown;
}

export async function GET() {
  try {
    const { presets, skippedRows } = await getPresets();

    return NextResponse.json(
      {
        ok: true,
        presets: presets.map(toPublicPreset),
        total: presets.length,
        skippedRows,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    const code = error instanceof SheetsError ? error.code : "unknown";

    console.error(`[api/presets] gagal memuat data (${code}):`, error?.message ?? error);

    return NextResponse.json(
      { ok: false, code, error: toPublicMessage(code) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
