import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import type { PostRow } from "@/lib/types";

function PlatformBadge({ platform }: { platform: string }) {
  const styles =
    platform === "instagram"
      ? "bg-pink-100 text-pink-700"
      : platform === "facebook"
        ? "bg-blue-100 text-blue-700"
        : "bg-slate-900 text-white";
  const label =
    platform === "instagram" ? "IG" : platform === "facebook" ? "FB" : "TT";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${styles}`}>
      {label}
    </span>
  );
}

const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
const head =
  "sticky top-0 z-10 bg-slate-100 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap";

export function PostsTable({ posts }: { posts: PostRow[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No posts yet. Use the{" "}
        <span className="font-medium text-slate-700">Scrape now</span> button to
        populate the table.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={head}>Influencer</th>
            <th className={head}>Plat</th>
            <th className={head}>Post</th>
            <th className={head}>Type</th>
            <th className={head}>Posted</th>
            <th className={`${head} text-right`}>Plays</th>
            <th className={`${head} text-right`}>Followers</th>
            <th className={`${head} text-right`}>Likes</th>
            <th className={`${head} text-right`}>Comments</th>
            <th className={`${head} text-right`}>Shares</th>
            <th className={`${head} text-right`}>Total</th>
            <th className={`${head} text-right`}>Eng %</th>
            <th className={`${head} text-right`}>Cmt/Like</th>
            <th className={`${head} text-right`}>Shr/View</th>
            <th className={`${head} text-right`}>Eng/Views</th>
            <th className={`${head} text-right`}>Resonance</th>
            <th className={`${head} text-right`}>Efficiency</th>
            <th className={`${head} text-right`}>Virality</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {posts.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                {p.influencer_name}
              </td>
              <td className="px-3 py-2">
                <PlatformBadge platform={p.platform} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <a
                  href={p.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                  title={p.caption ?? undefined}
                >
                  View ↗
                </a>
              </td>
              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                {p.post_type ?? "—"}
              </td>
              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                {formatDate(p.post_date)}
              </td>
              <td className={num}>{formatNumber(p.video_plays)}</td>
              <td className={num}>{formatNumber(p.follower_count)}</td>
              <td className={num}>{formatNumber(p.likes)}</td>
              <td className={num}>{formatNumber(p.comments_count)}</td>
              <td className={num}>{formatNumber(p.share_count)}</td>
              <td className={`${num} font-semibold`}>
                {formatNumber(p.total_interactions)}
              </td>
              <td className={`${num} font-semibold text-brand`}>
                {formatPercent(p.engagement_rate_pct)}
              </td>
              <td className={num}>{formatPercent(p.comment_to_like_pct)}</td>
              <td className={num}>{formatPercent(p.share_to_view_pct)}</td>
              <td className={num}>{formatPercent(p.engagement_to_views_pct)}</td>
              <td className={num}>{formatPercent(p.content_resonance_pct)}</td>
              <td className={num}>{formatPercent(p.influencer_efficiency_pct)}</td>
              <td className={num}>{formatPercent(p.virality_index_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
