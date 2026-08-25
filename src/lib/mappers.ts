import type { NormalizedPost, Platform } from "./types";

/**
 * Maps raw Apify actor items into our normalized post shape.
 *
 * Actor output schemas differ between actors and change over time, so every
 * field lookup is defensive (tries several likely keys). If you switch actors
 * and a column comes through empty, adjust the key lists below — this file is
 * the one place that knows about actor-specific field names.
 */

// ── small helpers ───────────────────────────────────────────────────────
type Raw = Record<string, unknown>;

function pick(obj: Raw, keys: string[]): unknown {
  for (const key of keys) {
    if (key.includes(".")) {
      const value = key.split(".").reduce<unknown>((acc, part) => {
        if (acc && typeof acc === "object") return (acc as Raw)[part];
        return undefined;
      }, obj);
      if (value !== undefined && value !== null) return value;
    } else if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Like toNumber, but for counts that can never legitimately be negative
 * (likes, comments, shares, views, followers). Some actors return -1 as a
 * sentinel for "this platform hid the count", which otherwise flows straight
 * into the dashboard as a negative number. Clamp it to 0 instead; keep null
 * as null so it still renders as "—" rather than a false zero.
 */
function toCount(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : Math.max(0, n);
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let date: Date;
  if (typeof value === "number") {
    // epoch seconds (TikTok createTime) or ms
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else {
    date = new Date(String(value));
  }
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function extractHashtags(item: Raw, caption: string | null): string[] {
  const raw = pick(item, ["hashtags", "challenges"]);
  const tags = new Set<string>();
  if (Array.isArray(raw)) {
    for (const t of raw) {
      if (typeof t === "string") tags.add(t.replace(/^#/, ""));
      else if (t && typeof t === "object") {
        const name = (t as Raw).name ?? (t as Raw).title;
        if (name) tags.add(String(name).replace(/^#/, ""));
      }
    }
  }
  // Fall back to parsing the caption.
  if (tags.size === 0 && caption) {
    for (const m of caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) tags.add(m[1]);
  }
  return [...tags];
}

/**
 * Usernames a post references but that never appear in the caption text:
 * @-mentions parsed out by the actor, tagged/collab users, and the sponsor
 * fields some actors expose. A creator who *tags* the brand instead of typing
 * the hashtag would otherwise fail the keyword filter and be dropped silently.
 */
function extractMentions(item: Raw): string[] {
  const out = new Set<string>();

  const add = (value: unknown) => {
    if (typeof value === "string") {
      const s = value.trim().replace(/^@/, "");
      if (s) out.add(s);
    } else if (value && typeof value === "object") {
      const o = value as Raw;
      for (const key of ["username", "name", "full_name", "fullName", "title"]) {
        if (typeof o[key] === "string") add(o[key]);
      }
    }
  };

  const sources = [
    "mentions",
    "taggedUsers",
    "tagged_users",
    "usertags",
    "coauthorProducers",
    "sponsorUsers",
    "musicInfo.artist_name",
    "locationName",
    "location.name",
    "title",
    "alt",
  ];
  for (const key of sources) {
    const value = pick(item, [key]);
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
  }
  return [...out];
}

/**
 * Everything a keyword may legitimately be found in, for one post. Kept next
 * to the field mappings because it depends on actor-specific keys, and read by
 * keywords.ts via the stored `raw` item.
 */
export function matchableText(post: NormalizedPost): string {
  const parts: string[] = [post.caption ?? "", ...(post.hashtags ?? [])];
  if (post.raw && typeof post.raw === "object") {
    parts.push(...extractMentions(post.raw as Raw));
  }
  return parts.join(" ");
}

// ── Instagram ───────────────────────────────────────────────────────────
function instagramPostType(item: Raw): string {
  const productType = String(pick(item, ["productType"]) ?? "").toLowerCase();
  const type = String(pick(item, ["type"]) ?? "").toLowerCase();
  if (productType === "clips") return "Reel";
  if (type === "video") return "Reel";
  if (type === "sidecar" || type === "carousel") return "Carousel";
  if (type === "image") return "Post";
  return "Post";
}

/**
 * Instagram's stable identifier is the post shortcode. Build the canonical
 * permalink from it and only fall back to the actor-supplied URL.
 *
 * `inputUrl` is deliberately NOT consulted: on apify/instagram-post-scraper it
 * is the *profile* URL that was passed in, so every item missing `url` would
 * collapse onto the same key — corrupting dedup and making the batch upsert
 * fail outright (Postgres rejects two conflicting rows in one statement).
 */
function instagramStableUrl(item: Raw): string | null {
  const shortCode = toText(pick(item, ["shortCode", "shortcode", "code"]));
  if (shortCode) return `https://www.instagram.com/p/${shortCode}/`;
  return toText(pick(item, ["url", "postUrl"]));
}

function mapInstagram(item: Raw, fallbackFollowers: number | null): NormalizedPost | null {
  const post_url = instagramStableUrl(item);
  if (!post_url) return null;

  const caption = toText(
    pick(item, ["caption", "description", "text", "edge_media_to_caption.edges.0.node.text"])
  );
  const followers =
    toCount(pick(item, ["followersCount", "ownerFollowersCount", "owner.followersCount"])) ??
    fallbackFollowers;

  return {
    post_url,
    platform: "instagram",
    influencer_name: toText(pick(item, ["ownerUsername", "username", "owner.username"])) ?? "",
    caption,
    post_type: instagramPostType(item),
    hashtags: extractHashtags(item, caption),
    video_plays: toCount(
      pick(item, ["videoPlayCount", "videoViewCount", "playCount", "viewCount"])
    ),
    follower_count: followers,
    comments_count: toCount(pick(item, ["commentsCount", "commentCount"])),
    share_count: null, // Instagram does not expose share counts publicly
    likes: toCount(pick(item, ["likesCount", "likeCount"])),
    post_date: toIsoDate(pick(item, ["timestamp", "takenAtTimestamp", "createTime"])),
    data_date: toIsoDate(Date.now()),
    raw: item,
  };
}

// ── TikTok ──────────────────────────────────────────────────────────────
/**
 * TikTok's stable identifier is the numeric video id.
 *
 * `videoUrl` is deliberately NOT consulted: it is a signed CDN address that
 * rotates between scrapes, so using it as the dedup key re-inserted the same
 * video as a brand-new post on every run.
 */
function tiktokStableUrl(item: Raw): string | null {
  const direct = toText(pick(item, ["webVideoUrl", "postPage"]));
  if (direct) return direct;

  const id = toText(pick(item, ["id", "awemeId", "videoId"]));
  const author = toText(
    pick(item, ["authorMeta.name", "authorMeta.uniqueId", "author.uniqueId"])
  );
  if (id && author) return `https://www.tiktok.com/@${author}/video/${id}`;

  const url = toText(pick(item, ["url"]));
  return url && !/\.mp4|tiktokcdn/i.test(url) ? url : null;
}

function mapTiktok(item: Raw, fallbackFollowers: number | null): NormalizedPost | null {
  const post_url = tiktokStableUrl(item);
  if (!post_url) return null;

  const caption = toText(pick(item, ["text", "desc", "description", "caption"]));
  const followers =
    toCount(pick(item, ["authorMeta.fans", "authorMeta.followers", "fans"])) ??
    fallbackFollowers;

  return {
    post_url,
    platform: "tiktok",
    influencer_name:
      toText(pick(item, ["authorMeta.name", "authorMeta.uniqueId", "author.uniqueId"])) ?? "",
    caption,
    post_type: "Video",
    hashtags: extractHashtags(item, caption),
    video_plays: toCount(pick(item, ["playCount", "viewCount"])),
    follower_count: followers,
    comments_count: toCount(pick(item, ["commentCount", "comments"])),
    share_count: toCount(pick(item, ["shareCount", "shares"])),
    likes: toCount(pick(item, ["diggCount", "likeCount", "likes"])),
    post_date: toIsoDate(pick(item, ["createTimeISO", "createTime", "timestamp"])),
    data_date: toIsoDate(Date.now()),
    raw: item,
  };
}

/**
 * Facebook's permalink carries a `story_fbid=pfbid...` token that ROTATES
 * between scrapes for the same post, so the raw permalink is not a stable
 * dedup key. Build a canonical URL from the stable numeric `postId` instead
 * (falling back to the raw URL only when no postId is available).
 */
function facebookStableUrl(item: Raw): string | null {
  const postId = toText(pick(item, ["postId", "post_id", "topLevelPostId"]));
  const rawUrl = toText(
    pick(item, [
      "url",
      "postUrl",
      "facebookUrl",
      "permalinkUrl",
      "topLevelUrl",
      "post_url",
    ])
  );

  let pageId = toText(pick(item, ["pageId", "user.id"]));
  if (!pageId && rawUrl) {
    try {
      pageId = new URL(rawUrl).searchParams.get("id");
    } catch {
      /* not a parseable URL */
    }
  }

  if (postId && pageId) {
    return `https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${pageId}`;
  }
  if (postId) return `https://www.facebook.com/${postId}`;
  return rawUrl;
}

function mapFacebook(item: Raw, fallbackFollowers: number | null): NormalizedPost | null {
  const post_url = facebookStableUrl(item);
  if (!post_url) return null;

  const caption = toText(
    pick(item, ["text", "message", "description", "caption", "postText"])
  );

  return {
    post_url,
    platform: "facebook",
    influencer_name:
      toText(
        pick(item, [
          "user.name",
          "from.name",
          "authorName",
          "profileName",
          "pageName",
          "owner.name",
        ])
      ) ?? "",
    caption,
    post_type: toText(pick(item, ["type", "mediaType", "postType"])) ?? "Post",
    hashtags: extractHashtags(item, caption),
    video_plays: toCount(
      pick(item, ["videoViewCount", "viewCount", "viewsCount", "statistics.views"])
    ),
    follower_count: fallbackFollowers,
    comments_count: toCount(
      pick(item, ["comments", "commentsCount", "commentCount", "statistics.comments"])
    ),
    share_count: toCount(
      pick(item, ["shares", "sharesCount", "shareCount", "statistics.shares"])
    ),
    likes: toCount(
      pick(item, [
        "likes",
        "likesCount",
        "likeCount",
        "reactionLikeCount",
        "reactionsCount",
        "reactionCount",
        "statistics.likes",
        "statistics.reactions",
      ])
    ),
    post_date: toIsoDate(
      pick(item, ["time", "timestamp", "date", "createdAt", "created_time"])
    ),
    data_date: toIsoDate(Date.now()),
    raw: item,
  };
}

export function mapItems(
  platform: Platform,
  items: Raw[],
  fallbackFollowers: number | null,
  expectedUsername: string
): NormalizedPost[] {
  const mapped = items
    .map((item) =>
      platform === "instagram"
        ? mapInstagram(item, fallbackFollowers)
        : platform === "facebook"
          ? mapFacebook(item, fallbackFollowers)
          : mapTiktok(item, fallbackFollowers)
    )
    .filter((p): p is NormalizedPost => p !== null && Boolean(p.post_url));

  // Ensure influencer_name is always populated, even if the actor omitted it.
  for (const p of mapped) {
    if (!p.influencer_name) p.influencer_name = expectedUsername;
  }
  return mapped;
}
