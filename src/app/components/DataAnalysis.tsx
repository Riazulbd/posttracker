import { formatCompact, formatPercent } from "@/lib/format";
import type { PostRow } from "@/lib/types";
import { EngagementTrendChart, type TrendPoint } from "./EngagementTrendChart";
import { PostTypeDonut, type DonutSlice } from "./PostTypeDonut";

// Validated categorical palette (dataviz skill, light surface), fixed order.
const SERIES = [
  "#2a78d6", // blue
  "#008300", // green
  "#e87ba4", // magenta
  "#eda100", // yellow
  "#1baf7a", // aqua
  "#eb6834", // orange
  "#4a3aa7", // violet
  "#e34948", // red
];
const OTHER = "#898781"; // muted gray for the folded tail

const PLATFORM = {
  instagram: { label: "Instagram", color: "#e87ba4" },
  facebook: { label: "Facebook", color: "#2a78d6" },
  tiktok: { label: "TikTok", color: "#4a3aa7" },
} as const;

interface Row {
  label: string;
  value: number;
  count: number;
  color: string;
}

/** Sum `value` per key, sort desc, color by rank, fold the tail into "Other". */
function aggregate(
  posts: PostRow[],
  keyOf: (p: PostRow) => string,
  colorOf: ((key: string, rank: number) => string) | null,
  topN = 8
): Row[] {
  const totals = new Map<string, { value: number; count: number }>();
  for (const p of posts) {
    const key = keyOf(p) || "—";
    const entry = totals.get(key) ?? { value: 0, count: 0 };
    entry.value += p.total_interactions ?? 0;
    entry.count += 1;
    totals.set(key, entry);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1].value - a[1].value);
  const rows: Row[] = sorted.slice(0, topN).map(([label, v], i) => ({
    label,
    value: v.value,
    count: v.count,
    color: colorOf ? colorOf(label, i) : SERIES[i % SERIES.length],
  }));

  const tail = sorted.slice(topN);
  if (tail.length > 0) {
    rows.push({
      label: `Other (${tail.length})`,
      value: tail.reduce((s, [, v]) => s + v.value, 0),
      count: tail.reduce((s, [, v]) => s + v.count, 0),
      color: OTHER,
    });
  }
  return rows;
}

/** Total interactions per day, sorted chronologically, for trending. */
function buildTrend(posts: PostRow[]): TrendPoint[] {
  const totals = new Map<string, number>();
  for (const p of posts) {
    if (!p.post_date) continue;
    totals.set(p.post_date, (totals.get(p.post_date) ?? 0) + (p.total_interactions ?? 0));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

/** Post count per type, colored by rank, for the donut. */
function buildPostTypeSlices(posts: PostRow[]): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const key = p.post_type || "Other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({ label, count, color: SERIES[i % SERIES.length] }));
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Ranked horizontal bars — magnitude comparison across labelled rows. */
function RankedBars({ rows }: { rows: Row[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));

  if (total === 0) {
    return <p className="py-6 text-center text-xs text-slate-400">No data yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span
                className="min-w-0 truncate font-medium text-slate-700"
                title={r.label}
              >
                {r.label}
              </span>
              <span className="flex-shrink-0 text-slate-400">
                {r.count} post{r.count === 1 ? "" : "s"}
              </span>
            </span>
            <span className="flex-shrink-0 tabular-nums text-slate-500">
              <span className="font-semibold text-slate-800">
                {formatCompact(r.value)}
              </span>{" "}
              · {formatPercent((r.value / total) * 100)}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                backgroundColor: r.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 100% stacked bar — part-to-whole composition. */
function StackedBar({ rows }: { rows: Row[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-xs text-slate-400">No data yet.</p>;
  }

  return (
    <>
      <div className="flex h-3.5 w-full gap-[3px]">
        {rows.map((r) =>
          r.value > 0 ? (
            <div
              key={r.label}
              className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(r.value / total) * 100}%`,
                minWidth: 6,
                backgroundColor: r.color,
              }}
              title={`${r.label}: ${formatCompact(r.value)}`}
            />
          ) : null
        )}
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center gap-2 text-xs text-slate-600"
          >
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span className="flex-1 font-medium text-slate-700">{r.label}</span>
            <span className="tabular-nums font-semibold text-slate-800">
              {formatCompact(r.value)}
            </span>
            <span className="w-12 text-right tabular-nums text-slate-400">
              {formatPercent((r.value / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function DataAnalysis({ posts }: { posts: PostRow[] }) {
  const totalInteractions = posts.reduce(
    (s, p) => s + (p.total_interactions ?? 0),
    0
  );

  const byInfluencer = aggregate(posts, (p) => p.influencer_name, null);
  const byPlatform = aggregate(
    posts,
    (p) => PLATFORM[p.platform]?.label ?? p.platform,
    (label) =>
      Object.values(PLATFORM).find((x) => x.label === label)?.color ?? OTHER
  );
  const trend = buildTrend(posts);
  const postTypeSlices = buildPostTypeSlices(posts);

  const composition: Row[] = [
    { label: "Likes", value: posts.reduce((s, p) => s + (p.likes ?? 0), 0), count: 0, color: "#e87ba4" },
    { label: "Comments", value: posts.reduce((s, p) => s + (p.comments_count ?? 0), 0), count: 0, color: "#2a78d6" },
    { label: "Shares", value: posts.reduce((s, p) => s + (p.share_count ?? 0), 0), count: 0, color: "#008300" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Data Analysis</h2>
        <span className="text-xs text-slate-400">
          {formatCompact(totalInteractions)} interactions across {posts.length}{" "}
          post{posts.length === 1 ? "" : "s"} · reflects current filters
        </span>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No posts to analyze yet.
        </div>
      ) : (
        <>
          <Panel
            title="Interactions over time"
            subtitle="Total engagement trended by post date"
          >
            <EngagementTrendChart data={trend} />
          </Panel>

          <Panel
            title="Interactions by influencer"
            subtitle="Who drove the most engagement"
          >
            <RankedBars rows={byInfluencer} />
          </Panel>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Panel
              title="Interactions by platform"
              subtitle="Where engagement came from"
            >
              <RankedBars rows={byPlatform} />
            </Panel>
            <Panel
              title="Interaction composition"
              subtitle="Likes vs comments vs shares"
            >
              <StackedBar rows={composition} />
            </Panel>
            <Panel title="Post type mix" subtitle="Share of posts by format">
              <PostTypeDonut slices={postTypeSlices} />
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}
