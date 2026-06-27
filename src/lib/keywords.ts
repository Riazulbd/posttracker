import { getSupabaseAdmin } from "./supabase";
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
    throw new Error(`Failed to clear keywords: ${deleteError.message}`);
  }

  if (normalized.length === 0) return [];

  const { error: insertError } = await supabase.from("tracked_keywords").insert(
    normalized.map((keyword) => ({ keyword, active: true }))
  );
  if (insertError) {
    throw new Error(`Failed to save keywords: ${insertError.message}`);
  }

  return normalized;
}

/**
 * True if the post's caption or hashtags mention any tracked keyword.
 * When no keywords are configured, every post is kept.
 */
export function postMatchesKeywords(
  post: NormalizedPost,
  keywords: string[]
): boolean {
  if (keywords.length === 0) return true;

  const haystack = normalize(
    [post.caption ?? "", ...(post.hashtags ?? [])].join(" ")
  );
  return keywords.some((kw) => haystack.includes(normalize(kw)));
}
