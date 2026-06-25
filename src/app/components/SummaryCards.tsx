import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type { DashboardData } from "../data";

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function SummaryCards({ summary }: { summary: DashboardData["summary"] }) {
  const lastScraped = summary.lastScrapedAt
    ? new Date(summary.lastScrapedAt).toLocaleString("en-US")
    : "never";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card label="Posts" value={formatNumber(summary.totalPosts)} />
      <Card label="Total Views" value={formatCompact(summary.totalViews)} />
      <Card
        label="Total Interactions"
        value={formatCompact(summary.totalInteractions)}
      />
      <Card
        label="Avg Engagement"
        value={formatPercent(summary.avgEngagementRate)}
      />
      <Card
        label="Accounts"
        value={formatNumber(summary.accountsTracked)}
        sub={`Last scrape: ${lastScraped}`}
      />
    </div>
  );
}
