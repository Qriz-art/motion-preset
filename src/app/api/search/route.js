import { NextResponse } from "next/server";

import { extractAmLinks } from "@/lib/am-url";
import { getVideoPreview, PreviewError } from "@/lib/scraper";
import { appendPresetEntryIfNew } from "@/lib/sheets";
import {
  extractAwemeId,
  fetchAuthorComments,
  fetchTikTokVideoInfo,
  resolveAwemeId,
} from "@/lib/tiktok-comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint pencarian satu video:
 *  1. Ambil preview video (URL download) supaya bisa diputar di halaman.
 *  2. Ambil komentar milik pembuat video + deskripsi video.
 *  3. Cari link AM di komentar pembuat dan deskripsi.
 *  4. Bila ketemu, simpan otomatis ke Google Sheets (link TikTok, link AM,
 *     username, tanggal).
 *
 * Tidak menerima input dari pengunjung selain URL TikTok yang akan dicek.
 * Penulisan ke Sheets hanya dilakukan untuk link AM yang ditemukan.
 */

const NO_AM_MESSAGE = "Belum ada";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const autoSave = searchParams.get("save") !== "0";

  if (!url) {
    return NextResponse.json(
      { ok: false, code: "missing_url", error: "Parameter url wajib diisi." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  let awemeId = extractAwemeId(url);
  if (!awemeId) {
      // Link pendek tidak memuat ID; ikuti redirect untuk mendapat URL kanonis.
      awemeId = await resolveAwemeId(url);
    }

    if (!awemeId) {
      return NextResponse.json(
        { ok: false, code: "invalid_url", error: "Link video TikTok tidak valid." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const previewPromise = getVideoPreview(url).catch((error) => {
    console.error(`[api/search] preview gagal:`, error?.message ?? error);
    return null;
  });

  const [preview, authorCommentsResult, videoInfo] = await Promise.all([
    previewPromise,
    fetchAuthorComments(awemeId, url),
    fetchTikTokVideoInfo(awemeId),
  ]);

  // Kumpulkan link AM dari komentar pembuat + deskripsi video.
  const amLinks = [];
  const seen = new Set();

  const pushAm = (amUrl, source) => {
    const clean = String(amUrl ?? "").trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    amLinks.push({ amUrl: clean, source });
  };

  for (const comment of authorCommentsResult.authorComments) {
    for (const amUrl of extractAmLinks(comment.comment)) {
      pushAm(amUrl, "comment");
    }
  }

  if (videoInfo?.title) {
    for (const amUrl of extractAmLinks(videoInfo.title)) {
      pushAm(amUrl, "description");
    }
  }

  const author = authorCommentsResult.author || videoInfo?.authorUniqueId || null;
  const username = author ? author.replace(/^@/, "") : "";

  let saved = false;
  let saveError = null;
    let duplicate = false;
    const firstAm = amLinks.length > 0 ? amLinks[0] : null;

    if (firstAm && autoSave) {
      try {
        const written = await appendPresetEntryIfNew(url, firstAm.amUrl, username, new Date().toISOString());
        saved = written;
        duplicate = !written;
      } catch (error) {
        console.error(`[api/search] gagal simpan:`, error?.message ?? error);
        saveError = error?.message ?? "Gagal menyimpan";
      }
    }

  return NextResponse.json(
    {
      ok: true,
      awemeId,
      author,
      video: preview
        ? {
            videoUrl: preview.videoUrl,
            quality: preview.quality,
            title: preview.title,
            thumbnail: preview.thumbnail,
            cached: preview.cached,
          }
        : null,
      totalComments: authorCommentsResult.totalComments,
      amFound: amLinks.length,
      amLinks,
      autoSaved: saved,
            duplicate,
            saveError,
            message: amLinks.length > 0 ? "Link AM ditemukan." : NO_AM_MESSAGE,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}