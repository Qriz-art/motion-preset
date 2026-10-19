import { NextResponse } from "next/server";

import {
  checkRateLimit,
  getClientIdentifier,
  getVideoPreview,
  PreviewError,
} from "@/lib/scraper";

/**
 * Runtime Node.js wajib: @coflyn/scrapr memakai axios + cheerio dan tidak
 * bisa berjalan pada runtime Edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAVAILABLE_MESSAGE = "Preview video tidak tersedia saat ini.";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { ok: false, code: "missing_url", error: "Parameter url wajib diisi." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { limited, retryAfterSeconds } = checkRateLimit(getClientIdentifier(request));
  if (limited) {
    return NextResponse.json(
      {
        ok: false,
        code: "rate_limited",
        error: "Terlalu banyak permintaan preview. Tunggu sebentar lalu coba lagi.",
      },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds) },
      }
    );
  }

  try {
    const preview = await getVideoPreview(targetUrl);

    return NextResponse.json(
      {
        ok: true,
        videoUrl: preview.videoUrl,
        quality: preview.quality,
        title: preview.title,
        author: preview.author,
        thumbnail: preview.thumbnail,
        cached: preview.cached,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const isKnown = error instanceof PreviewError;
    const code = isKnown ? error.code : "unavailable";
    const status = isKnown ? error.status : 503;

    console.error(`[api/preview] gagal (${code}):`, error?.message ?? error);

    return NextResponse.json(
      {
        ok: false,
        code,
        error: code === "invalid_url" ? "Link TikTok tidak valid." : UNAVAILABLE_MESSAGE,
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
