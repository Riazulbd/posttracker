export type Platform = "instagram" | "tiktok";

export interface TrackedAccount {
  id: string;
  platform: Platform;
  username: string;
  display_name: string | null;
  active: boolean;
  follower_count: number | null;
  follower_checked_at: string | null;
  last_scraped_at: string | null;
  created_at: string;
}

/**
 * A post normalized from an Apify actor's output, ready to upsert into the
 * `posts` table. Only raw stats live here — the metric columns are computed
 * by Postgres (see supabase/migrations/0001_init.sql).
 */
export interface NormalizedPost {
  post_url: string;
  platform: Platform;
  influencer_name: string;
  caption: string | null;
  post_type: string | null;
  hashtags: string[];
  video_plays: number | null;
  follower_count: number | null;
  comments_count: number | null;
  share_count: number | null;
  likes: number | null;
  post_date: string | null; // YYYY-MM-DD
  data_date: string | null; // YYYY-MM-DD
  raw: unknown;
}

/** A row as read back from the `posts` table, including computed metrics. */
export interface PostRow extends Omit<NormalizedPost, "raw"> {
  id: string;
  total_interactions: number | null;
  engagement_rate_pct: number | null;
  comment_to_like_pct: number | null;
  share_to_view_pct: number | null;
  engagement_to_views_pct: number | null;
  content_resonance_pct: number | null;
  influencer_efficiency_pct: number | null;
  virality_index_pct: number | null;
  created_at: string;
  updated_at: string;
}

export interface ScrapeResult {
  account: string;
  platform: Platform;
  found: number;
  inserted: number;
  updated: number;
  error?: string;
}
