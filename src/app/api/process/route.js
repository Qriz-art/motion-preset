import { NextResponse } from "next/server";

import {
  extractAmFromComments,
  extractAwemeId,
  fetchTikTokComments,
  resolveAwemeId,
} from "@/lib/tiktok-comments";
import { readSheetRows, writeAmToRow } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Jeda antar permintaan ke TikTok agar tidak memicu rate limit.
 */
const DELAY_BETWEEN_REQUESTS_MS = 1500;

/**
 * Proses semua baris dari Google Sheets:
 *  1. Baca semua baris (kolom A = link TikTok, kolom B = link AM).
 *  2. Skip baris yang kolom B-nya sudah terisi (tidak menimpa).
 *  3. Untuk baris kosong, ambil komentar video lalu cari link AM.
 *  4. Bila ditemukan, tulis link AM ke kolom B (dan username/tanggal bila ada).
 *
 * Endpoint ini aman dipanggil berulang kali: baris yang sudah punya link AM
 * tidak akan di-scrape ulang.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Menentukan apakah sel kolom B berisi link AM yang sudah valid.
 */
function hasAmLink(cell) {
  const value = String(cell ?? "").trim();
  return value.length > 0;
}

/**
 * Memproses satu baris: ambil komentar, cari link AM, tulis ke kolom B.
 */
async function processRow({ row, cells }) {
  const tiktokUrl = String(cells[0] ?? "").trim();
  const existingAm = String(cells[1] ?? "").trim();

  if (!tiktokUrl) {
    return { row, tiktokUrl: "", amUrlFound: null, amLinksCount: 0, status: "no_tiktok_url", skipped: true };
  }

  if (hasAmLink(existingAm)) {
    return { row, tiktokUrl, amUrlFound: null, amLinksCount: 0, status: "already_has_am", skipped: true };
  }

  let awemeId = extractAwemeId(tiktokUrl);
  if (!awemeId) awemeId = await resolveAwemeId(tiktokUrl);

  if (!awemeId) {
    return { row, tiktokUrl, amUrlFound: null, amLinksCount: 0, status: "invalid_tiktok_url" };
  }

  const comments = await fetchTikTokComments(awemeId);
  const amResults = extractAmFromComments(comments);

  if (amResults.length === 0) {
    return {
      row,
      tiktokUrl,
      amUrlFound: null,
      amLinksCount: 0,
      totalComments: comments.length,
      status: "no_am_found",
    };
  }

  const first = amResults[0];
  await writeAmToRow(row, first.amUrl, first.username || "", new Date().toISOString());

  return {
    row,
    tiktokUrl,
    amUrl: first.amUrl,
    amUrlFound: first.amUrl,
    amLinksCount: amResults.length,
    totalComments: comments.length,
    username: first.username,
    status: "updated",
  };
}

/**
 * Handler bersama untuk GET dan POST.
 * Mendukung parameter query `limit` (misal /api/process?limit=5) untuk
 * membatasi jumlah baris per eksekusi. Berguna untuk cron agar tidak
 * melewati batas waktu eksekusi Vercel.
 */
async function handler(request) {
  // Bila CRON_SECRET diisi, endpoint hanya bisa dipanggil dengan header
  // Authorization: Bearer <CRON_SECRET> (dipakai oleh cron eksternal).
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (cronSecret) {
    const authorization = request?.headers?.get("authorization") ?? "";
    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, code: "unauthorized", error: "Unauthorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  try {
    let rows;
    try {
      rows = await readSheetRows();
    } catch (error) {
      console.error("[api/process] gagal membaca Sheets:", error?.message ?? error);
      return NextResponse.json(
        { ok: false, code: error?.code ?? "sheets_error", error: "Gagal membaca Google Sheets." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        ok: true,
        total: 0,
        processed: 0,
        skipped: 0,
        found: 0,
        updated: 0,
        results: [],
        message: "Tidak ada baris untuk diproses.",
      });
    }

    // Batasi jumlah baris bila parameter limit dikirim (misal dari cron)
    // atau lewat env PROCESS_BATCH_LIMIT. Tanpa keduanya, semua baris diproses.
    const url = new URL(request?.url ?? "http://localhost");
    const limitParam = Number(url.searchParams.get("limit"));
    const envLimit = Number(process.env.PROCESS_BATCH_LIMIT ?? "");
    const rawLimit = Number.isInteger(limitParam) && limitParam > 0
      ? limitParam
      : Number.isInteger(envLimit) && envLimit > 0
      ? envLimit
      : rows.length;
    const limit = Math.min(rawLimit, rows.length);
    const limitedRows = rows.slice(0, limit);

    const results = [];
    let processed = 0;
    let skipped = 0;
    let found = 0;
    let updated = 0;

    for (let i = 0; i < limitedRows.length; i++) {
      const entry = limitedRows[i];

      try {
        const result = await processRow(entry);

        if (result.skipped) {
          skipped += 1;
        } else {
          processed += 1;
        }

        if (result.amLinksCount > 0) found += result.amLinksCount;
        if (result.status === "updated") updated += 1;

        results.push(result);
      } catch (error) {
        console.error(`[api/process] error row ${entry.row}:`, error?.message ?? error);
        results.push({
          row: entry.row,
          tiktokUrl: String(entry.cells?.[0] ?? "").trim(),
          amUrlFound: null,
          amLinksCount: 0,
          status: "error",
          error: error?.message ?? "Unknown error",
        });
      }

      // Jeda antar permintaan agar tidak kena rate limit TikTok.
      if (i < limitedRows.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    return NextResponse.json({
      ok: true,
      total: limitedRows.length,
      processed,
      skipped,
      found,
      updated,
      results,
      message: `Selesai: ${processed} diproses, ${skipped} dilewati, ${found} link AM ditemukan, ${updated} baris diupdate.`,
    });
  } catch (error) {
    console.error("[api/process] fatal error:", error?.message ?? error);

    return NextResponse.json(
      { ok: false, code: "process_failed", error: "Gagal memproses data." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const GET = handler;
export const POST = handler;
