import { getSupabaseAdmin } from "./supabase";
import {
  buildActorInput,
  fetchInstagramFollowers,
  runActor,
} from "./apify";
import { env } from "./env";
import { getTrackedKeywords, postMatchesKeywords } from "./keywords";
import { mapItems } from "./mappers";
import type {
  NormalizedPost,
  Platform,
  ScrapeResult,
  TrackedAccount,
} from "./types";

export interface ScrapeProgressEvent {
  current: number;
  total: number;
  account: string;
  platform: Platform;
  scanned: number;
  matched: number;
  inserted: number;
  updated: number;
  error?: string;
  warning?: string;
}

/** Stat columns that must never be overwritten with null by a re-scrape. */
const STAT_COLUMNS = [
  "video_plays",
  "follower_count",
  "comments_count",
  "share_count",
  "likes",
] as const;

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

/**
 * Update a tracked account, tolerating a database that has not had migration
 * 0005 applied yet. `extra` holds the columns that migration adds; if they are
 * missing we retry with just the base patch instead of failing the account
 * (a failed account update is what used to freeze the dashboard's timestamp).
 */
async function updateAccount(
  id: string,
  base: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tracked_accounts")
    .update({ ...base, ...extra })
    .eq("id", id);
  if (!error) return;

  if (Object.keys(extra).length > 0) {
    await supabase.from("tracked_accounts").update(base).eq("id", id);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(`[scrape] failed to update account ${id}:`, error.message);
}

/** Scrape a single account and return its normalized posts + follower count. */
async function scrapeAccount(
  account: TrackedAccount,
  keywords: string[]
): Promise<{
  posts: NormalizedPost[];
  scanned: number;
  followerCount: number | null;
  followersRefreshed: boolean;
  warning?: string;
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
  const { items, warning } = await runActor(actorId, input);
  const allPosts = mapItems(platform, items, followerCount, account.username);

  // TikTok items carry the follower count themselves; capture it for caching.
  if (platform === "tiktok") {
    const fromPost = allPosts.find((p) => p.follower_count !== null);
    if (fromPost?.follower_count != null) {
      followerCount = fromPost.follower_count;
      followersRefreshed = true;
    }
  }

  // Keep only posts that mention a tracked keyword (e.g. the brand handle).
  const posts = allPosts.filter((post) => postMatchesKeywords(post, keywords));

  return {
    posts,
    scanned: allPosts.length,
    followerCount,
    followersRefreshed,
    warning,
  };
}

/**
 * Collapse posts that share a post_url down to one row.
 *
 * Actors routinely return the same post twice (a pinned post also appears in
 * the feed), and Postgres rejects an entire `insert ... on conflict do update`
 * statement when two of its rows target the same key. That error used to take
 * down the whole account: nothing persisted, and its last_scraped_at never
 * advanced — which is why the dashboard kept showing an old scrape date.
 */
function dedupeByUrl(posts: NormalizedPost[]): NormalizedPost[] {
  const byUrl = new Map<string, NormalizedPost>();
  for (const post of posts) {
    const existing = byUrl.get(post.post_url);
    byUrl.set(post.post_url, existing ? mergePost(existing, post) : post);
  }
  return [...byUrl.values()];
}

/**
 * Merge a freshly scraped post over what we already hold, keeping the stored
 * value wherever the new scrape has nothing to say.
 *
 * Actors intermittently omit a count (Facebook in particular), and a plain
 * upsert would write that gap straight over a good number — leaving a post
 * that is present but shows blank stats and no engagement rate.
 */
function mergePost(
  previous: Partial<NormalizedPost>,
  next: NormalizedPost
): NormalizedPost {
  const merged: NormalizedPost = { ...next };
  for (const column of STAT_COLUMNS) {
    if (merged[column] == null && previous[column] != null) {
      merged[column] = previous[column] as number;
    }
  }
  if (!merged.caption && previous.caption) merged.caption = previous.caption;
  if (merged.hashtags.length === 0 && previous.hashtags?.length) {
    merged.hashtags = previous.hashtags;
  }
  if (!merged.post_date && previous.post_date) merged.post_date = previous.post_date;
  return merged;
}

/**
 * Upsert posts by URL (so only new/unique posts are added; existing posts have
 * their stats refreshed) and append a snapshot row for each. Returns counts.
 */
async function persistPosts(
  posts: NormalizedPost[]
): Promise<{ inserted: number; updated: number }> {
  const supabase = getSupabaseAdmin();
  const unique = dedupeByUrl(posts);
  if (unique.length === 0) return { inserted: 0, updated: 0 };

  const urls = unique.map((p) => p.post_url);

  // Read the rows we're about to overwrite: to report inserted vs updated, and
  // to keep stats the actor didn't return this time.
  const { data: existing, error: existingError } = await supabase
    .from("posts")
    .select(
      "post_url, caption, hashtags, post_date, video_plays, follower_count, comments_count, share_count, likes"
    )
    .in("post_url", urls);
  if (existingError) {
    throw new Error(`Failed to read existing posts: ${existingError.message}`);
  }

  const existingByUrl = new Map(
    (existing ?? []).map((row) => [
      (row as { post_url: string }).post_url,
      row as unknown as Partial<NormalizedPost>,
    ])
  );

  const rows = unique.map((post) => {
    const previous = existingByUrl.get(post.post_url);
    return previous ? mergePost(previous, post) : post;
  });

  // Upsert on the unique post_url. Generated metric columns recompute in DB.
  const { error: upsertError } = await supabase
    .from("posts")
    .upsert(rows, { onConflict: "post_url" });
  if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);

  // Append history snapshots (best-effort; don't fail the run on this).
  const snapshots = rows.map((p) => ({
    post_url: p.post_url,
    video_plays: p.video_plays,
    follower_count: p.follower_count,
    comments_count: p.comments_count,
    share_count: p.share_count,
    likes: p.likes,
  }));
  const { error: snapshotError } = await supabase
    .from("post_snapshots")
    .insert(snapshots);
  if (snapshotError) {
    // eslint-disable-next-line no-console
    console.error("[scrape] snapshot insert failed:", snapshotError.message);
  }

  const inserted = rows.filter((p) => !existingByUrl.has(p.post_url)).length;
  return { inserted, updated: rows.length - inserted };
}

/** Open a row in scrape_runs. Returns null if the table isn't there yet. */
async function startRunRecord(trigger: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("scrape_runs")
      .insert({ trigger, started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

/** Close out the scrape_runs row. Best-effort. */
async function finishRunRecord(
  runId: string | null,
  results: ScrapeResult[]
): Promise<void> {
  if (!runId) return;
  const sum = (key: "scanned" | "matched" | "inserted" | "updated") =>
    results.reduce((total, result) => total + result[key], 0);
  const failed = results.filter((result) => result.error);
  try {
    await getSupabaseAdmin()
      .from("scrape_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: failed.length === 0,
        accounts_total: results.length,
        accounts_ok: results.length - failed.length,
        accounts_failed: failed.length,
        scanned: sum("scanned"),
        matched: sum("matched"),
        inserted: sum("inserted"),
        updated: sum("updated"),
        error: failed[0]?.error ?? null,
        results,
      })
      .eq("id", runId);
  } catch {
    // The run still completed; we just couldn't record it.
  }
}

/** Scrape every active account and persist the results. */
export async function scrapeAllAccounts(
  onProgress?: (event: ScrapeProgressEvent) => void,
  trigger = "manual"
): Promise<ScrapeResult[]> {
  const accounts = await getActiveAccounts();
  const keywords = await getTrackedKeywords();
  const results: ScrapeResult[] = [];
  const runId = await startRunRecord(trigger);

  onProgress?.({
    current: 0,
    total: accounts.length,
    account: "",
    platform: "instagram",
    scanned: 0,
    matched: 0,
    inserted: 0,
    updated: 0,
  });

  for (const [index, account] of accounts.entries()) {
    const result: ScrapeResult = {
      account: account.username,
      platform: account.platform,
      scanned: 0,
      matched: 0,
      inserted: 0,
      updated: 0,
    };
    const attemptedAt = new Date().toISOString();
    try {
      const { posts, scanned, followerCount, followersRefreshed, warning } =
        await scrapeAccount(account, keywords);
      result.scanned = scanned;
      result.matched = posts.length;
      result.warning = warning;

      const { inserted, updated } = await persistPosts(posts);
      result.inserted = inserted;
      result.updated = updated;

      const now = new Date().toISOString();
      await updateAccount(
        account.id,
        {
          follower_count: followerCount,
          last_scraped_at: now,
          // Only advance the throttle timestamp when we actually re-fetched.
          ...(followersRefreshed ? { follower_checked_at: now } : {}),
        },
        { last_attempted_at: attemptedAt, last_error: warning ?? null }
      );
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      // Record the attempt even though it failed, so a run that errors
      // everywhere is still visible instead of silently leaving the dashboard
      // showing the last successful scrape.
      await updateAccount(
        account.id,
        {},
        { last_attempted_at: attemptedAt, last_error: result.error }
      );
      // eslint-disable-next-line no-console
      console.error(`[scrape] ${account.platform}/${account.username}:`, result.error);
    }
    results.push(result);
    onProgress?.({
      current: index + 1,
      total: accounts.length,
      account: account.username,
      platform: account.platform,
      scanned: result.scanned,
      matched: result.matched,
      inserted: result.inserted,
      updated: result.updated,
      error: result.error,
      warning: result.warning,
    });
  }

  await finishRunRecord(runId, results);
  return results;
}
