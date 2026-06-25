import { getDashboardData } from "./data";
import { SummaryCards } from "./components/SummaryCards";
import { Filters } from "./components/Filters";
import { PostsTable } from "./components/PostsTable";

// Always render fresh data from Supabase.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { platform?: string; influencer?: string; q?: string };
}) {
  const filters = {
    platform: searchParams.platform,
    influencer: searchParams.influencer,
    q: searchParams.q,
  };

  let content;
  try {
    const { posts, accounts, summary } = await getDashboardData(filters);
    content = (
      <>
        <SummaryCards summary={summary} />
        <Filters accounts={accounts} current={filters} />
        <PostsTable posts={posts} />
      </>
    );
  } catch (err) {
    content = (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-semibold">Could not load data.</p>
        <p className="mt-1">
          {err instanceof Error ? err.message : String(err)}
        </p>
        <p className="mt-2 text-red-500">
          Check that <code>SUPABASE_URL</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> are set and the migration has
          been run.
        </p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Post Tracker</h1>
          <p className="text-sm text-slate-500">
            TikTok &amp; Instagram engagement metrics · scrapes Mon &amp; Fri
          </p>
        </div>
      </header>
      {content}
    </main>
  );
}
