/** Display helpers for the dashboard. */

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // value is YYYY-MM-DD; render without timezone shifting.
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${m}/${d}/${y}`;
}

/**
 * Format a timestamp in the app's configured timezone (TZ env var, default
 * America/Chicago) with an explicit tz label — so it never renders ambiguous
 * UTC just because the server happens to run in UTC.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "never";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "never";
  const timeZone = process.env.TZ || "America/Chicago";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return d.toLocaleString("en-US");
  }
}

/** Short relative time, e.g. "3m ago", "5h ago", "2d ago". */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
