import { getSupabaseAdmin } from "./supabase";
import {
  buildActorInput,
  fetchInstagramFollowers,
  runActor,
} from "./apify";
import { env } from "./env";
import { mapItems } from "./mappers";
import type {
  NormalizedPost,
  Platform,
  ScrapeResult,
  TrackedAccount,
} from "./types";

/** Whether the cached follower count is stale enough to re-fetch. */
function followersAreStale(account: TrackedAccount): boolean {
  if (account.follower_count == null) return true; // never fetched
  if (env.followerRefreshDays <= 0) return true; // refresh every run
  if (!account.follower_checked_at) return true;
  const ageMs = Date.now() - new Date(account.follower_checked_at).getTime();
  return ageMs > env.followerRefreshDays * 24 * 60 * 60 * 1000;
}

/** Load the accounts to scrape (active ones only). */
export async function getActiveAccounts(): Promise<TrackedAccount[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tracked_accounts")
    .select("*")
    .eq("active", true)
    .order("platform", { ascending: true });
  if (error) throw new Error(`Failed to load accounts: ${error.message}`);
  return (data ?? []) as TrackedAccount[];
}

/** Scrape a single account and return its normalized posts + follower count. */
async function scrapeAccount(
  account: TrackedAccount
): Promise<{
  posts: NormalizedPost[];
  followerCount: number | null;
  followersRefreshed: boolean;
}> {
  const platform = account.platform as Platform;

  // Instagram: the post scraper doesn't return follower counts, so look them
  // up via the (pricey) profile scraper — but only when the cached value is
  // stale, to stay within the Apify budget.
  let followerCount: number | null = account.follower_count ?? null;
  let followersRefreshed = false;
  if (platform === "instagram" && followersAreStale(account)) {
    const fresh = await fetchInstagramFollowers(account.username);
    if (fresh !== null) {
      followerCount = fresh;
      followersRefreshed = true;
    }
  }

  const { actorId, input } = buildActorInput(platform, account.username);
  const items = await runActor(actorId, input);
  const posts = mapItems(platform, items, followerCount, account.username);

  // TikTok items carry the follower count themselves; capture it for caching.
  if (platform === "tiktok") {
    const fromPost = posts.find((p) => p.follower_count !== null);
    if (fromPost?.follower_count != null) {
      followerCount = fromPost.follower_count;
      followersRefreshed = true;
    }
  }

  return { posts, followerCount, followersRefreshed };
}

/**
 * Upsert posts by URL (so only new/unique posts are added; existing posts have
 * their stats refreshed) and append a snapshot row for each. Returns counts.
 */
async function persistPosts(
  posts: NormalizedPost[]
): Promise<{ inserted: number; updated: number }> {
  const supabase = getSupabaseAdmin();
  if (posts.length === 0) return { inserted: 0, updated: 0 };

  const urls = posts.map((p) => p.post_url);

  // Which of these URLs already exist? (to report inserted vs updated)
  const { data: existing } = await supabase
    .from("posts")
    .select("post_url")
    .in("post_url", urls);
  const existingUrls = new Set((existing ?? []).map((r) => r.post_url as string));

  // Upsert on the unique post_url. Generated metric columns recompute in DB.
  const { error: upsertError } = await supabase
    .from("posts")
    .upsert(posts, { onConflict: "post_url" });
  if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);

  // Append history snapshots (best-effort; don't fail the run on this).
  const snapshots = posts.map((p) => ({
    post_url: p.post_url,
    video_plays: p.video_plays,
    follower_count: p.follower_count,
    comments_count: p.comments_count,
    share_count: p.share_count,
    likes: p.likes,
  }));
  await supabase.from("post_snapshots").insert(snapshots);

  const inserted = posts.filter((p) => !existingUrls.has(p.post_url)).length;
  return { inserted, updated: posts.length - inserted };
}

/** Scrape every active account and persist the results. */
export async function scrapeAllAccounts(): Promise<ScrapeResult[]> {
  const accounts = await getActiveAccounts();
  const supabase = getSupabaseAdmin();
  const results: ScrapeResult[] = [];

  for (const account of accounts) {
    const result: ScrapeResult = {
      account: account.username,
      platform: account.platform,
      found: 0,
      inserted: 0,
      updated: 0,
    };
    try {
      const { posts, followerCount, followersRefreshed } =
        await scrapeAccount(account);
      result.found = posts.length;

      const { inserted, updated } = await persistPosts(posts);
      result.inserted = inserted;
      result.updated = updated;

      const now = new Date().toISOString();
      await supabase
        .from("tracked_accounts")
        .update({
          follower_count: followerCount,
          last_scraped_at: now,
          // Only advance the throttle timestamp when we actually re-fetched.
          ...(followersRefreshed ? { follower_checked_at: now } : {}),
        })
        .eq("id", account.id);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[scrape] ${account.platform}/${account.username}:`, result.error);
    }
    results.push(result);
  }

  return results;
}
