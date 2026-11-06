import { NextResponse } from "next/server";

import { appendPresetEntry } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { tiktokUrl, amUrl, username, date } = await request.json().catch(() => ({}));

  if (!tiktokUrl || !amUrl) {
    return NextResponse.json(
      { ok: false, code: "missing_fields", error: "Link TikTok dan link AM wajib diisi." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    await appendPresetEntry(tiktokUrl, amUrl, username || "", date || new Date().toISOString());

    return NextResponse.json(
      { ok: true, message: "Data berhasil disimpan ke Google Sheets." },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error?.code ?? "sheets_error";
    console.error(`[api/save] gagal (${code}):`, error?.message ?? error);

    return NextResponse.json(
      { ok: false, code, error: "Gagal menyimpan data ke Google Sheets." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
