"use client";

import { useState } from "react";
import { formatNumber, formatPercent } from "@/lib/format";

const SIZE = 160;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const GAP_DEG = 2.5; // surface gap between segments

export interface DonutSlice {
  label: string;
  count: number;
  color: string;
}

/** Donut chart — part-to-whole by count, with legend and per-segment hover. */
export function PostTypeDonut({ slices }: { slices: DonutSlice[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const total = slices.reduce((s, r) => s + r.count, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-xs text-slate-400">No data yet.</p>;
  }

  let cursor = 0;
  const segments = slices
    .filter((s) => s.count > 0)
    .map((s, i) => {
      const fraction = s.count / total;
      const gapLen = (GAP_DEG / 360) * CIRC;
      const rawLen = fraction * CIRC;
      const len = Math.max(0, rawLen - gapLen);
      const offset = -cursor;
      cursor += rawLen;
      return { ...s, len, offset, index: i };
    });

  const hovered = hoverIdx !== null ? segments[hoverIdx] : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((s, i) => (
              <circle
                key={s.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={hoverIdx === i ? STROKE + 4 : STROKE}
                strokeDasharray={`${s.len} ${CIRC - s.len}`}
                strokeDashoffset={s.offset}
                opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.45}
                className="transition-all duration-150"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-900">
            {hovered ? formatNumber(hovered.count) : formatNumber(total)}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            {hovered ? hovered.label : "posts"}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {segments.map((s, i) => (
          <li
            key={s.label}
            className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors ${
              hoverIdx === i ? "bg-slate-50" : ""
            }`}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
              {s.label}
            </span>
            <span className="flex-shrink-0 tabular-nums text-slate-500">
              {formatNumber(s.count)} · {formatPercent((s.count / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
