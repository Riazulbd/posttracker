import { getSupabaseAdmin } from "./supabase";
import { env } from "./env";
import { matchableText } from "./mappers";
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

export function normalizeKeyword(text: string): string {
  return normalize(text);
}

export async function getTrackedKeywords(): Promise<string[]> {
  const fallback = env.trackKeywords;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tracked_keywords")
      .select("keyword, active")
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (error) return fallback;

    const keywords = (data ?? [])
      .map((row) => String((row as { keyword?: string }).keyword ?? "").trim())
      .filter(Boolean);
    return keywords.length > 0 ? keywords : fallback;
  } catch {
    return fallback;
  }
}

export async function replaceTrackedKeywords(keywords: string[]): Promise<string[]> {
  const normalized = [...new Map(
    keywords
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .map((keyword) => [normalizeKeyword(keyword), keyword] as const)
  ).values()];

  const supabase = getSupabaseAdmin();
  const { error: deleteError } = await supabase
    .from("tracked_keywords")
    .delete()
    .lte("created_at", new Date().toISOString());
  if (deleteError) {
    if ((deleteError as { code?: string }).code === "42P01") {
      throw new Error(
        "Keyword storage is not initialized. Run supabase/migrations/0002_tracked_keywords.sql in Supabase first."
      );
    }
    throw new Error(`Failed to clear keywords: ${deleteError.message}`);
  }

  if (normalized.length === 0) return [];

  const { error: insertError } = await supabase.from("tracked_keywords").insert(
    normalized.map((keyword) => ({ keyword, active: true }))
  );
  if (insertError) {
    if ((insertError as { code?: string }).code === "42P01") {
      throw new Error(
        "Keyword storage is not initialized. Run supabase/migrations/0002_tracked_keywords.sql in Supabase first."
      );
    }
    throw new Error(`Failed to save keywords: ${insertError.message}`);
  }

  return normalized;
}

/**
 * True if the post mentions any tracked keyword.
 *
 * Matching runs over the caption, the hashtags AND the usernames the post
 * references without naming in the text — @-mentions, tagged users, collab
 * co-authors (see `matchableText`). Caption-only matching used to drop any
 * post where the creator tagged the brand instead of typing the hashtag; those
 * posts were counted as "scanned" and then discarded with no trace, which is
 * exactly how tracked posts went missing.
 *
 * When no keywords are configured, every post is kept.
 */
export function postMatchesKeywords(
  post: NormalizedPost,
  keywords: string[]
): boolean {
  if (keywords.length === 0) return true;

  const haystack = normalize(matchableText(post));
  return keywords.some((kw) => {
    const needle = normalize(kw);
    return needle !== "" && haystack.includes(needle);
  });
}
