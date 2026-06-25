import { getSupabaseAdmin } from "@/lib/supabase";
import type { PostRow, TrackedAccount } from "@/lib/types";

export interface PostFilters {
  platform?: string;
  influencer?: string;
  q?: string;
}

export interface DashboardData {
  posts: PostRow[];
  accounts: TrackedAccount[];
  summary: {
    totalPosts: number;
    totalViews: number;
    totalInteractions: number;
    avgEngagementRate: number;
    accountsTracked: number;
    lastScrapedAt: string | null;
  };
}

export async function getDashboardData(
  filters: PostFilters
): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("posts")
    .select("*")
    .order("post_date", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (filters.platform && filters.platform !== "all") {
    query = query.eq("platform", filters.platform);
  }
  if (filters.influencer && filters.influencer !== "all") {
    query = query.eq("influencer_name", filters.influencer);
  }
  if (filters.q && filters.q.trim() !== "") {
    const term = `%${filters.q.trim()}%`;
    query = query.or(`caption.ilike.${term},influencer_name.ilike.${term}`);
  }

  const [{ data: posts, error }, { data: accounts }] = await Promise.all([
    query,
    supabase.from("tracked_accounts").select("*").order("username"),
  ]);

  if (error) throw new Error(`Failed to load posts: ${error.message}`);

  const rows = (posts ?? []) as PostRow[];
  const accountRows = (accounts ?? []) as TrackedAccount[];

  const totalViews = rows.reduce((s, p) => s + (p.video_plays ?? 0), 0);
  const totalInteractions = rows.reduce(
    (s, p) => s + (p.total_interactions ?? 0),
    0
  );
  const withRate = rows.filter((p) => p.engagement_rate_pct !== null);
  const avgEngagementRate =
    withRate.length > 0
      ? withRate.reduce((s, p) => s + (p.engagement_rate_pct ?? 0), 0) /
        withRate.length
      : 0;
  const lastScrapedAt = accountRows
    .map((a) => a.last_scraped_at)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  return {
    posts: rows,
    accounts: accountRows,
    summary: {
      totalPosts: rows.length,
      totalViews,
      totalInteractions,
      avgEngagementRate,
      accountsTracked: accountRows.filter((a) => a.active).length,
      lastScrapedAt,
    },
  };
}
