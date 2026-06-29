import { formatCompact, formatPercent } from "@/lib/format";
import type { PostRow } from "@/lib/types";

// A distinct, repeating multicolor palette for breakdown segments.
const PALETTE = [
  "#6d28d9", // violet (brand)
  "#2563eb", // blue
  "#059669", // emerald
  "#d97706", // amber
  "#dc2626", // red
  "#db2777", // pink
  "#0891b2", // cyan
  "#7c3aed", // purple
  "#65a30d", // lime
  "#ea580c", // orange
  "#0d9488", // teal
  "#4f46e5", // indigo
];

interface Segment {
  label: string;
  value: number;
  color: string;
  meta?: string;
}

/** Sum `value` per key, sort desc, color each, and group the long tail. */
function aggregate(
  posts: PostRow[],
  keyOf: (p: PostRow) => string,
  valueOf: (p: PostRow) => number,
  topN = 10
): Segment[] {
  const totals = new Map<string, { value: number; count: number }>();
  for (const p of posts) {
    const key = keyOf(p) || "—";
    const entry = totals.get(key) ?? { value: 0, count: 0 };
    entry.value += valueOf(p) || 0;
    entry.count += 1;
    totals.set(key, entry);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1].value - a[1].value);
  const head = sorted.slice(0, topN);
  const tail = sorted.slice(topN);

  const segments: Segment[] = head.map(([label, { value, count }], i) => ({
    label,
    value,
    color: PALETTE[i % PALETTE.length],
    meta: `${count} post${count === 1 ? "" : "s"}`,
  }));

  if (tail.length > 0) {
    const value = tail.reduce((s, [, v]) => s + v.value, 0);
    const count = tail.reduce((s, [, v]) => s + v.count, 0);
    segments.push({
      label: `Other (${tail.length})`,
      value,
      color: "#94a3b8", // slate-400
      meta: `${count} posts`,
    });
  }
  return segments;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

function BreakdownBar({
  title,
  subtitle,
  segments,
}: {
  title: string;
  subtitle: string;
  segments: Segment[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No data yet.</p>
      ) : (
        <>
          {/* multicolor stacked bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {segments.map((s) => (
              <div
                key={s.label}
                style={{ width: `${pct(s.value)}%`, backgroundColor: s.color }}
                title={`${s.label}: ${formatCompact(s.value)} (${formatPercent(
                  pct(s.value)
                )})`}
              />
            ))}
          </div>

          {/* legend */}
          <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {segments.map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-2 text-xs text-slate-600"
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate" title={s.label}>
                  {s.label}
                  {s.meta && (
                    <span className="text-slate-400"> · {s.meta}</span>
                  )}
                </span>
                <span className="tabular-nums font-medium text-slate-700">
                  {formatCompact(s.value)}
                </span>
                <span className="w-10 text-right tabular-nums text-slate-400">
                  {formatPercent(pct(s.value))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function DataAnalysis({ posts }: { posts: PostRow[] }) {
  const byInfluencer = aggregate(
    posts,
    (p) => p.influencer_name,
    (p) => p.total_interactions ?? 0
  );
  const byPlatform = aggregate(
    posts,
    (p) => PLATFORM_LABELS[p.platform] ?? p.platform,
    (p) => p.total_interactions ?? 0
  );

  // interaction composition across all shown posts
  const composition: Segment[] = [
    {
      label: "Likes",
      value: posts.reduce((s, p) => s + (p.likes ?? 0), 0),
      color: "#db2777",
    },
    {
      label: "Comments",
      value: posts.reduce((s, p) => s + (p.comments_count ?? 0), 0),
      color: "#2563eb",
    },
    {
      label: "Shares",
      value: posts.reduce((s, p) => s + (p.share_count ?? 0), 0),
      color: "#059669",
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Data Analysis</h2>
        <span className="text-xs text-slate-400">
          Breakdown of {posts.length} post{posts.length === 1 ? "" : "s"} ·
          reflects current filters
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BreakdownBar
          title="Interactions by influencer"
          subtitle="Who drove the most engagement"
          segments={byInfluencer}
        />
        <BreakdownBar
          title="Interactions by platform"
          subtitle="Instagram vs Facebook vs TikTok"
          segments={byPlatform}
        />
        <BreakdownBar
          title="Interaction composition"
          subtitle="Likes vs comments vs shares"
          segments={composition}
        />
      </div>
    </section>
  );
}
