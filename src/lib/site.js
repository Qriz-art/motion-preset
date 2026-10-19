export const SITE_NAME = "Motion Presets";
export const SITE_TAGLINE = "Alight Motion Community";
export const SITE_TITLE =
  "Kumpulan Preset Alight Motion (AM) Gratis dari TikTok — Motion Presets";
export const SITE_DESCRIPTION =
  "Preset Alight Motion (AM) pilihan dari kreator TikTok — gratis, aesthetic, dan langsung siap pakai. Tonton previewnya lalu buka link XML preset dari halaman ini.";

export const SITE_KEYWORDS = [
  "preset alight motion",
  "preset alight motion gratis",
  "preset alight motion tiktok",
  "preset am",
  "preset am gratis",
  "preset am aesthetic",
  "preset am keren",
  "preset am viral",
  "preset am terbaru",
  "preset am tanpa watermark",
  "link preset am",
  "xml preset alight motion",
  "preset xml am",
  "download preset alight motion",
  "download xml alight motion",
  "kumpulan preset alight motion",
  "alight motion preset",
  "alight motion xml",
  "template alight motion",
  "preset edit tiktok",
  "preset edit video",
  "preset video aesthetic",
  "preset tiktok viral",
  "komunitas alight motion",
];

/**
 * Menentukan URL dasar website.
 *
 * Diutamakan NEXT_PUBLIC_SITE_URL, lalu domain produksi Vercel, dan terakhir
 * localhost untuk pengembangan lokal.
 */
export function getSiteUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // lanjut ke fallback berikutnya
    }
  }

  const vercelUrl = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    ""
  ).trim();

  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}
