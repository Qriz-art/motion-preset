import { NextResponse } from "next/server";

import { extractAmLinks } from "@/lib/am-url";
import {
  extractAmFromComments,
  extractAwemeId,
  fetchTikTokComments,
  resolveAwemeId,
} from "@/lib/tiktok-comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint untuk memeriksa satu video TikTok dan mencari link AM di komentarnya.
 * Dipakai oleh halaman input untuk pratinjau sebelum menyimpan.
 */

async function handleScrape(getInput) {
  const input = getInput();

  if (!input?.url) {
    return NextResponse.json(
      { ok: false, code: "missing_url", error: "Parameter url wajib diisi." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  let awemeId = extractAwemeId(input.url);
  if (!awemeId) awemeId = await resolveAwemeId(input.url);

  if (!awemeId) {
    return NextResponse.json(
      { ok: false, code: "invalid_url", error: "Link video TikTok tidak valid." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const comments = await fetchTikTokComments(awemeId);
    const amResults = extractAmFromComments(comments);

    return NextResponse.json(
      {
        ok: true,
        awemeId,
        totalComments: comments.length,
        amFound: amResults.length,
        results: amResults,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(`[api/scrape] gagal:`, error?.message ?? error);

    return NextResponse.json(
      { ok: false, code: "scrape_failed", error: "Gagal mengambil komentar TikTok." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  return handleScrape(() => ({ url: searchParams.get("url") }));
}

export async function POST(request) {
  return handleScrape(async () => {
    const body = await request.json().catch(() => ({}));
    return { url: body?.url };
  });
}
