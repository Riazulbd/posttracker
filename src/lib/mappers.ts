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

function mapInstagram(item: Raw, fallbackFollowers: number | null): NormalizedPost | null {
  const post_url = toText(pick(item, ["url", "postUrl", "inputUrl"]));
  if (!post_url) return null;

  const caption = toText(
    pick(item, ["caption", "description", "text", "edge_media_to_caption.edges.0.node.text"])
  );
  const followers =
    toNumber(pick(item, ["followersCount", "ownerFollowersCount", "owner.followersCount"])) ??
    fallbackFollowers;

  return {
    post_url,
    platform: "instagram",
    influencer_name: toText(pick(item, ["ownerUsername", "username", "owner.username"])) ?? "",
    caption,
    post_type: instagramPostType(item),
    hashtags: extractHashtags(item, caption),
    video_plays: toNumber(
      pick(item, ["videoPlayCount", "videoViewCount", "playCount", "viewCount"])
    ),
    follower_count: followers,
    comments_count: toNumber(pick(item, ["commentsCount", "commentCount"])),
    share_count: null, // Instagram does not expose share counts publicly
    likes: toNumber(pick(item, ["likesCount", "likeCount"])),
    post_date: toIsoDate(pick(item, ["timestamp", "takenAtTimestamp", "createTime"])),
    data_date: toIsoDate(Date.now()),
    raw: item,
  };
}

// ── TikTok ──────────────────────────────────────────────────────────────
function mapTiktok(item: Raw, fallbackFollowers: number | null): NormalizedPost | null {
  const post_url = toText(
    pick(item, ["webVideoUrl", "postPage", "url", "videoUrl"])
  );
  if (!post_url) return null;

  const caption = toText(pick(item, ["text", "desc", "description", "caption"]));
  const followers =
    toNumber(pick(item, ["authorMeta.fans", "authorMeta.followers", "fans"])) ??
    fallbackFollowers;

  return {
    post_url,
    platform: "tiktok",
    influencer_name:
      toText(pick(item, ["authorMeta.name", "authorMeta.uniqueId", "author.uniqueId"])) ?? "",
    caption,
    post_type: "Video",
    hashtags: extractHashtags(item, caption),
    video_plays: toNumber(pick(item, ["playCount", "viewCount"])),
    follower_count: followers,
    comments_count: toNumber(pick(item, ["commentCount", "comments"])),
    share_count: toNumber(pick(item, ["shareCount", "shares"])),
    likes: toNumber(pick(item, ["diggCount", "likeCount", "likes"])),
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
    video_plays: toNumber(
      pick(item, ["videoViewCount", "viewCount", "viewsCount", "statistics.views"])
    ),
    follower_count: fallbackFollowers,
    comments_count: toNumber(
      pick(item, ["comments", "commentsCount", "commentCount", "statistics.comments"])
    ),
    share_count: toNumber(
      pick(item, ["shares", "sharesCount", "shareCount", "statistics.shares"])
    ),
    likes: toNumber(
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
