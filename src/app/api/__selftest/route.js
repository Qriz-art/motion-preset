import { NextResponse } from "next/server";

import { buildPresets } from "@/lib/presets";
import { extractTikTokUsername, isTikTokVideoUrl, normalizeUsername } from "@/lib/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results = [];
  const check = (name, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, pass, actual, expected });
  };

  check(
    "url standar",
    extractTikTokUsername("https://www.tiktok.com/@editz.id/video/123456789"),
    "@editz.id"
  );
  check(
    "query string dibuang",
    extractTikTokUsername(
      "https://www.tiktok.com/@editz.id/video/123?is_from_webapp=1&sender_device=pc"
    ),
    "@editz.id"
  );
  check(
    "url profil",
    extractTikTokUsername("https://tiktok.com/@editz.id"),
    "@editz.id"
  );
  check("vm.tiktok.com", extractTikTokUsername("https://vm.tiktok.com/ZMabcdef/"), null);
  check("vt.tiktok.com", extractTikTokUsername("https://vt.tiktok.com/ZS12345/"), null);
  check(
    "host bukan tiktok",
    extractTikTokUsername("https://example.com/@editz.id/video/1"),
    null
  );
  check(
    "domain palsu",
    extractTikTokUsername("https://tiktok.com.evil.com/@hack/video/1"),
    null
  );
  check("bukan url", extractTikTokUsername("not-a-url"), null);
  check("root tiktok", extractTikTokUsername("https://www.tiktok.com/"), null);
  check("string kosong", extractTikTokUsername(""), null);
  check("null", extractTikTokUsername(null), null);
  check(
    "username tidak wajar",
    extractTikTokUsername("https://www.tiktok.com/@a b/video/1"),
    null
  );

  check("normalizeUsername pakai @", normalizeUsername("@editz.id"), "@editz.id");
  check("normalizeUsername tanpa @", normalizeUsername(" editz.id "), "@editz.id");
  check("normalizeUsername spasi", normalizeUsername("bukan username"), null);

  check(
    "isTikTokVideoUrl video",
    isTikTokVideoUrl("https://www.tiktok.com/@a/video/123"),
    true
  );
  check("isTikTokVideoUrl profil", isTikTokVideoUrl("https://www.tiktok.com/@a"), false);
  check("isTikTokVideoUrl short", isTikTokVideoUrl("https://vm.tiktok.com/ZM1/"), true);

  const rows = [
    ["Username", "Link TikTok", "Link Preset"],
    ["", "https://www.tiktok.com/@editz.id/video/111", "https://contoh.com/preset-a"],
    [
      "@manual.user",
      "https://www.tiktok.com/@other.user/video/222",
      "https://contoh.com/preset-b",
    ],
    ["https://vm.tiktok.com/ZMxyz/", "https://contoh.com/preset-c"],
    ["", "", ""],
    ["", "https://www.tiktok.com/@broken/video/333"],
    ["", "https://www.tiktok.com/@dup/video/444", "https://contoh.com/preset-d"],
    ["", "https://www.tiktok.com/@dup/video/444", "https://contoh.com/preset-d"],
    ["", "bukan url", "https://contoh.com/preset-e"],
  ];

  const { presets, skippedRows } = buildPresets(rows);

  check("jumlah preset", presets.length, 4);
  check("jumlah baris dilewati", skippedRows, 4);
  check(
    "username otomatis",
    presets.map((p) => p.username),
    ["@editz.id", "@other.user", "Kreator TikTok", "@dup"]
  );
  check(
    "nomor urut",
    presets.map((p) => p.number),
    [1, 2, 3, 4]
  );
  check("preset url dipertahankan", presets[0].presetUrl, "https://contoh.com/preset-a");

  const empty = buildPresets([]);
  check("sheet kosong", [empty.presets.length, empty.skippedRows], [0, 0]);

  const passed = results.filter((r) => r.pass).length;
  return NextResponse.json({
    passed,
    failed: results.length - passed,
    total: results.length,
    failures: results.filter((r) => !r.pass),
  });
}
