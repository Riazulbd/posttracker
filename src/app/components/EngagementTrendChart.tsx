"use client";

import { useRef, useState } from "react";
import { formatCompact } from "@/lib/format";

const LINE_COLOR = "#2a78d6"; // validated categorical palette, series 1 (blue)
const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

function shortDate(value: string): string {
  const [, m, d] = value.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = Number(m) - 1;
  return `${months[mi] ?? m}/${d}`;
}

/** Line + area chart trending a single metric over time, with hover crosshair. */
export function EngagementTrendChart({ data }: { data: TrendPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <p className="py-6 text-center text-xs text-slate-400">
        Not enough data yet to trend.
      </p>
    );
  }

  const times = data.map((d) => new Date(d.date).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const maxV = Math.max(1, ...data.map((d) => d.value));

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const xFor = (t: number) =>
    PAD.left + (maxT === minT ? innerW / 2 : ((t - minT) / (maxT - minT)) * innerW);
  const yFor = (v: number) => PAD.top + innerH - (v / maxV) * innerH;

  const points = data.map((d, i) => ({ x: xFor(times[i]), y: yFor(d.value), ...d }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    `${linePath} L${points[points.length - 1].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} ` +
    `L${points[0].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  const yTicks = [0, 0.5, 1].map((f) => ({
    value: maxV * f,
    y: yFor(maxV * f),
  }));

  const labelIdxs = Array.from(
    new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  );

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const tooltipLeft = hovered
    ? Math.min(92, Math.max(8, (hovered.x / WIDTH) * 100))
    : 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        className="overflow-visible"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((t) => (
          <g key={t.value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              {formatCompact(t.value)}
            </text>
          </g>
        ))}

        {labelIdxs.map((i) => (
          <text
            key={i}
            x={points[i].x}
            y={HEIGHT - 6}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize={9}
            fill="#94a3b8"
          >
            {shortDate(points[i].date)}
          </text>
        ))}

        <path d={areaPath} fill={LINE_COLOR} fillOpacity={0.08} stroke="none" />
        <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" />

        {hovered ? (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            <circle
              cx={hovered.x}
              cy={hovered.y}
              r={4}
              fill="#fff"
              stroke={LINE_COLOR}
              strokeWidth={2}
            />
          </>
        ) : null}
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${tooltipLeft}%` }}
        >
          <div className="font-medium text-slate-700">{shortDate(hovered.date)}</div>
          <div className="tabular-nums font-semibold text-slate-900">
            {formatCompact(hovered.value)} interactions
          </div>
        </div>
      ) : null}
    </div>
  );
}
