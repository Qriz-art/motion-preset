/**
 * Utilitas pengambilan dan ekstraksi komentar TikTok.
 *
 * Komentar diambil lewat endpoint internal TikTok yang dipakai aplikasi
 * webnya. Endpoint ini bisa berubah atau diblokir kapan saja, jadi fungsi
 * dibuat sebaik mungkin dan menyerah dengan tenang bila gagal.
 */

import { extractAmLinks } from "@/lib/am-url";
import { extractTikTokUsername, resolveTikTokUsername } from "@/lib/tiktok";
import { parseHttpUrl } from "@/lib/url";

const TIKTOK_COMMENT_API = "https://www.tiktok.com/api/comment/list/";
const TIKTOK_COMMENT_REPLY_API = "https://www.tiktok.com/api/comment/list/reply/";
const TIKTOK_EMBED_URL = "https://www.tiktok.com/embed/v2/";
const REQUEST_TIMEOUT_MS = 15000;
const RESOLVE_TIMEOUT_MS = 8000;
const MAX_COMMENTS = 100;
const MAX_REPLIES_PER_COMMENT = 30;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Mengekstrak aweme_id (video ID) dari URL TikTok.
 *
 * @param {string} url
 * @returns {string | null}
 */
export function extractAwemeId(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;

  const match = parsed.pathname.match(/\/video\/(\d+)/);
  if (match) return match[1];

  // Fallback: coba cari angka panjang di pathname
  const idMatch = parsed.pathname.match(/\/(\d{18,})/);
  if (idMatch) return idMatch[1];

  return null;
}

/**
 * Mendapatkan aweme_id (video ID) dari URL TikTok, termasuk link pendek
 * (vt.tiktok.com / vm.tiktok.com) yang tidak memuat ID langsung.
 *
 * Link pendek diikuti pengalihannya sampai mendapat URL kanonis, lalu ID
 * dibaca dari URL tersebut. Hanya dipanggil dari server.
 *
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function resolveAwemeId(url) {
  const direct = extractAwemeId(url);
  if (direct) return direct;

  const parsed = parseHttpUrl(url);
  if (!parsed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://www.tiktok.com/",
      },
      signal: controller.signal,
    });

    try {
      await response.body?.cancel();
    } catch {
      // abaikan: badan halaman tidak dibutuhkan
    }

    return extractAwemeId(response.url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mengambil komentar dari video TikTok melalui endpoint internal TikTok.
 *
 * @param {string} awemeId
 * @returns {Promise<Array<{ username: string, nickname: string, comment: string, create_time: string }>>}
 */
export async function fetchTikTokComments(awemeId) {
  const comments = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore && comments.length < MAX_COMMENTS) {
    const params = new URLSearchParams({
      aweme_id: awemeId,
      count: "50",
      cursor: String(cursor),
          device_platform: "webapp",
          aid: "1988",
        });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${TIKTOK_COMMENT_API}?${params}`, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "application/json",
          Referer: "https://www.tiktok.com/",
        },
        signal: controller.signal,
      });

      if (!response.ok) break;

      const data = await response.json().catch(() => null);
      if (!data) break;

      const list = Array.isArray(data?.comments) ? data.comments : [];
      for (const item of list) {
        if (comments.length >= MAX_COMMENTS) break;
        comments.push({
          username: item.user?.unique_id || item.user?.username || "",
          nickname: item.user?.nickname || "",
          comment: item.text || "",
          create_time: item.create_time || "",
                cid: String(item.cid || ""),
                reply_comment_total: Number(item.reply_comment_total || 0),
                reply_comment: Array.isArray(item.reply_comment) ? item.reply_comment : [],
              });
            }

      hasMore = Boolean(data.has_more);
      cursor = Number(data.cursor ?? cursor + list.length);
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  return comments;
}

  /**
   * Mengambil balasan (reply) dari sebuah komentar TikTok.
   *
   * Endpoint balasan dipisah dari komentar utama. Balasan yang sudah di-embed
   * di komentar utama ikut digabung agar tidak ada yang terlewat.
   *
   * @param {string} awemeId
   * @param {string} commentId (cid)
   * @param {Array<object>} [embeddedReplies] balasan yang sudah ada di komentar utama
   * @returns {Promise<Array<{ username: string, nickname: string, comment: string, create_time: string, isReply: boolean }>>}
   */
  export async function fetchCommentReplies(awemeId, commentId, embeddedReplies = []) {
    const replies = [];

    // Balasan yang sudah di-embed di komentar utama.
    for (const item of embeddedReplies) {
      replies.push({
        username: item.user?.unique_id || item.user?.username || "",
        nickname: item.user?.nickname || "",
        comment: item.text || "",
        create_time: item.create_time || "",
        isReply: true,
      });
    }

    let cursor = 0;
    let hasMore = true;

    while (hasMore && replies.length < MAX_REPLIES_PER_COMMENT) {
      const params = new URLSearchParams({
        comment_id: commentId,
        aweme_id: awemeId,
        count: "30",
        cursor: String(cursor),
        device_platform: "webapp",
        aid: "1988",
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${TIKTOK_COMMENT_REPLY_API}?${params}`, {
          method: "GET",
          redirect: "follow",
          cache: "no-store",
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Accept: "application/json",
            Referer: "https://www.tiktok.com/",
          },
          signal: controller.signal,
        });

        if (!response.ok) break;

        const data = await response.json().catch(() => null);
        if (!data) break;

        const list = Array.isArray(data?.comments) ? data.comments : [];
        if (list.length === 0) break;

        // Hindari duplikat dengan balasan embedded (bandingkan cid).
        const existingCids = new Set(
          embeddedReplies.map((item) => String(item.cid || ""))
        );

        for (const item of list) {
          if (replies.length >= MAX_REPLIES_PER_COMMENT) break;
          if (existingCids.has(String(item.cid || ""))) continue;
          replies.push({
            username: item.user?.unique_id || item.user?.username || "",
            nickname: item.user?.nickname || "",
            comment: item.text || "",
            create_time: item.create_time || "",
            isReply: true,
          });
        }

        hasMore = Boolean(data.has_more);
        cursor = Number(data.cursor ?? cursor + list.length);
      } catch {
        break;
      } finally {
        clearTimeout(timer);
      }
    }

    return replies;
  }

/**
 * Mengekstrak link AM unik dari daftar komentar.
 *
 * @param {Array<object>} comments
 * @returns {Array<{ username: string, nickname: string, comment: string, amUrl: string, create_time: string }>}
 */
export function extractAmFromComments(comments) {
  const results = [];

  for (const comment of comments) {
    const amLinks = extractAmLinks(comment.comment);
    for (const amUrl of amLinks) {
      results.push({
        username: comment.username,
        nickname: comment.nickname,
        comment: comment.comment,
        amUrl,
        create_time: comment.create_time,
      });
    }
  }

  return results;
}

/**
 * Mengambil informasi video (termasuk deskripsi/caption) dari endpoint embed
 * publik TikTok. Tidak butuh autentikasi, tapi bisa diblokir TikTok.
 *
 * @param {string} awemeId
 * @returns {Promise<{ title: string, author: string, authorUniqueId: string } | null>}
 */
export async function fetchTikTokVideoInfo(awemeId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${TIKTOK_EMBED_URL}${encodeURIComponent(awemeId)}`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://www.tiktok.com/",
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const html = await response.text().catch(() => "");
    if (!html) return null;

    // Endpoint embed memuat JSON-LD atau objek __UNIVERSAL_DATA_FOR_REHYDRATION__
    const author =
      html.match(/"author":\s*\{[^}]*"uniqueId":\s*"([^"]+)"/i)?.[1] ||
      html.match(/"author_name":\s*"([^"]+)"/i)?.[1] ||
      "";

    const title =
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i)?.[1] ||
      html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] ||
      "";

    return {
      title: decodeHtmlEntities(title),
      author: author,
      authorUniqueId: author,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mengambil komentar milik pembuat video, plus balasan yang ditulis pembuat
 * di komentar mana pun (termasuk di komentar orang lain yang berisi gambar).
 *
 * Endpoint komentar TikTok mengembalikan field `user.unique_id` dan
 * `user.nickname`. Pembuat video diambil dari URL video (username di path
 * `/@username/`) atau dari deskripsi bila URL adalah link pendek.
 *
 * Bila pembuat video tidak dapat diketahui (misalnya link pendek gagal
 * di-resolve), seluruh komentar dipakai sebagai cadangan supaya link AM
 * tidak terlewat.
 *
 * @param {string} awemeId
 * @param {string} tiktokUrl
 * @returns {Promise<{ author: string | null, authorComments: Array<object>, totalComments: number, fallbackAll: boolean }>}
 */
export async function fetchAuthorComments(awemeId, tiktokUrl) {
  const authorFromUrl = extractTikTokUsername(tiktokUrl);

  let author = authorFromUrl;
  if (!author) {
    const resolved = await resolveTikTokUsername(tiktokUrl);
    author = resolved;
  }

  const comments = await fetchTikTokComments(awemeId);

  if (!author) {
    return {
      author: null,
      authorComments: comments,
      totalComments: comments.length,
      fallbackAll: true,
    };
  }

  const authorNormalized = author.toLowerCase().replace(/^@/, "");

  // Komentar utama milik pembuat.
  const authorComments = comments.filter((comment) => {
    const uniqueId = String(comment.username || "").trim().toLowerCase().replace(/^@/, "");
    const nickname = String(comment.nickname || "").trim().toLowerCase();
    return isAuthorMatch(uniqueId, nickname, authorNormalized);
  });

    // Tarik balasan dari SEMUA komentar yang punya balasan (bukan hanya
    // komentar pembuat). Skenario umum: orang lain komen, pembuat membalas
    // dengan link AM. Balasan tersebut tidak akan muncul kalau kita hanya
    // melihat komentar pembuat.
    const repliesFromAllComments = [];
    for (const comment of comments) {
      const cid = String(comment.cid || "");
      const replyTotal = Number(comment.reply_comment_total || 0);
      const hasReply = cid && (replyTotal > 0 || (Array.isArray(comment.reply_comment) && comment.reply_comment.length > 0));
      if (!hasReply) continue;

      const embedded = Array.isArray(comment.reply_comment) ? comment.reply_comment : [];
      const replies = await fetchCommentReplies(awemeId, cid, embedded).catch(() => []);
      repliesFromAllComments.push(...replies);
    }

    // Filter balasan: hanya balasan milik pembuat, atau fallback semua balasan.
    const authorReplies = repliesFromAllComments.filter((reply) => {
      const uniqueId = String(reply.username || "").trim().toLowerCase().replace(/^@/, "");
      const nickname = String(reply.nickname || "").trim().toLowerCase();
      return isAuthorMatch(uniqueId, nickname, authorNormalized);
    });

    const repliesToUse =
      authorReplies.length > 0 ? authorReplies : repliesFromAllComments;

    // Gabungkan komentar utama pembuat + balasan (yang relevan).
    const combined = [...authorComments, ...repliesToUse];

  // Fallback berlapis: jika tidak ada komentar utama pembuat yang cocok,
  // pakai semua komentar (kasus username beda format).
  const effectiveComments = combined.length > 0 ? combined : comments;

  return {
    author,
    authorComments: effectiveComments,
    totalComments: comments.length,
      fallbackAll: authorComments.length === 0 && repliesFromAllComments.length === 0,
  };
}

/**
 * Membandingkan username unique_id dan nickname komentar dengan username
 * pembuat video. Mendukung pencocokan sebagian.
 *
 * @param {string} uniqueId
 * @param {string} nickname
 * @param {string} authorNormalized username pembuat tanpa @ dan lowercase
 * @returns {boolean}
 */
function isAuthorMatch(uniqueId, nickname, authorNormalized) {
  const uid = String(uniqueId || "").trim().toLowerCase().replace(/^@/, "");
  const nick = String(nickname || "").trim().toLowerCase();

  return (
    uid !== "" &&
    (uid === authorNormalized ||
      uid.includes(authorNormalized) ||
      authorNormalized.includes(uid) ||
      (nick !== "" &&
        (nick.includes(authorNormalized) || authorNormalized.includes(nick))))
  );
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}