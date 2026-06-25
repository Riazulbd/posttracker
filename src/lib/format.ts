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
