import type { TrackedAccount } from "@/lib/types";
import type { PostFilters } from "../data";

/**
 * A plain GET form — submitting reloads the page with query params, which the
 * server component reads. No client-side JS needed.
 */
export function Filters({
  accounts,
  current,
}: {
  accounts: TrackedAccount[];
  current: PostFilters;
}) {
  const influencers = accounts
    .map((a) => ({ username: a.username, label: a.display_name || a.username }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <label className="flex flex-col text-xs font-medium text-slate-600">
        Search
        <input
          type="text"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="caption or influencer…"
          className="mt-1 w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        />
      </label>

      <label className="flex flex-col text-xs font-medium text-slate-600">
        Platform
        <select
          name="platform"
          defaultValue={current.platform ?? "all"}
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="all">All</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
        </select>
      </label>

      <label className="flex flex-col text-xs font-medium text-slate-600">
        Influencer
        <select
          name="influencer"
          defaultValue={current.influencer ?? "all"}
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="all">All</option>
          {influencers.map((inf) => (
            <option key={inf.username} value={inf.username}>
              {inf.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Apply
      </button>
      <a
        href="/"
        className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        Reset
      </a>
    </form>
  );
}
