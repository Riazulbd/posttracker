import { env } from "./env";
import type { NormalizedPost } from "./types";

/**
 * Normalize text for loose matching: lowercase and strip everything that
 * isn't a letter or digit. This makes "Arthur's Jewelers", "@arthursjewelers",
 * "#ArthursJewelers", and "www.arthursjewelers.com" all collapse to the same
 * "arthursjewelers" so a single keyword matches every variant.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True if the post's caption or hashtags mention any tracked keyword.
 * When no keywords are configured, every post is kept.
 */
export function postMatchesKeywords(post: NormalizedPost): boolean {
  const keywords = env.trackKeywords;
  if (keywords.length === 0) return true;

  const haystack = normalize(
    [post.caption ?? "", ...(post.hashtags ?? [])].join(" ")
  );
  return keywords.some((kw) => haystack.includes(normalize(kw)));
}
