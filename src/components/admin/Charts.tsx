"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { InfoTip } from "./Shared";

// Single-series charts use the site accent; multi-series use the validated categorical
// order (fixed - never cycled). Light-only, matching the rest of the site.
export const ACCENT = "#c05090";
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const INK = "#3d1a2c";
const INK_MUTED = "#8a5a70";
const GRID = "#f5e3ee";
const SURFACE = "#ffffff";

export type Fmt = (n: number) => string;
export const fmtInt: Fmt = (n) => Math.round(n).toLocaleString();
export const fmt1: Fmt = (n) => (Math.round(n * 10) / 10).toLocaleString();
export const fmtPct: Fmt = (n) => `${Math.round(n * 1000) / 10}%`;

function niceTicks(max: number, count = 4, integer = false): number[] {
	if (max <= 0) return [0, 1];
	const raw = max / count;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
	if (integer) step = Math.max(1, Math.ceil(step));
	const ticks: number[] = [];
	for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
	if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
	return ticks;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		if (!ref.current) return;
		setWidth(ref.current.clientWidth);
		const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);
	return [ref, width];
}

// --- Tooltip ---

interface Tip {
	x: number;
	y: number;
	title: string;
	rows: { label: string; value: string; color?: string }[];
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
	if (!tip) return null;
	const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 190));
	return (
		<div
			className="absolute z-10 pointer-events-none bg-white rounded-lg border border-[#f5d0e8] shadow-[0_4px_14px_rgba(130,50,90,0.18)] px-3 py-2 text-[12px] min-w-[120px] max-w-[220px]"
			style={{ left, top: Math.max(0, tip.y - 10) }}
		>
			<p className="font-extrabold text-[#3d1a2c] mb-1">{tip.title}</p>
			{tip.rows.map((r, i) => (
				<p key={i} className="flex items-center gap-1.5 text-[#5a3048] font-semibold">
					{r.color && <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />}
					<span className="flex-1">{r.label}</span>
					<span className="font-extrabold tabular-nums text-[#3d1a2c]">{r.value}</span>
				</p>
			))}
		</div>
	);
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
	if (items.length < 2) return null;
	return (
		<div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[12px] font-semibold text-[#5a3048]">
			{items.map((it) => (
				<span key={it.label} className="flex items-center gap-1.5">
					<span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />
					{it.label}
				</span>
			))}
		</div>
	);
}

// Rounded data-end, square at the baseline
function barPath(x: number, y: number, w: number, h: number, horizontal: boolean): string {
	const r = Math.min(4, horizontal ? w / 2 : h / 2, horizontal ? h / 2 : w / 2);
	if (w <= 0 || h <= 0) return "";
	if (horizontal)
		return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
	return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// --- Horizontal bar chart (categories with long labels) ---

export interface BarDatum {
	label: string;
	value: number;
	detail?: { label: string; value: string }[];
}

export function BarChart({
	data,
	format = fmtInt,
	color = ACCENT,
	labelWidth = 130,
	reference,
}: {
	data: BarDatum[];
	format?: Fmt;
	color?: string;
	labelWidth?: number;
	// Vertical hairline marking an expected value, e.g. a fair win rate
	reference?: { value: number; label: string };
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [tip, setTip] = useState<Tip | null>(null);
	const rowH = 28;
	const barH = 16;
	const valueW = 56;
	const plotW = Math.max(40, width - labelWidth - valueW);
	const max = Math.max(...data.map((d) => d.value), reference?.value ?? 0, 0) || 1;
	const refH = reference ? 18 : 0;
	const height = data.length * rowH + 4 + refH;

	return (
		<div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
			{width > 0 && (
				<svg width={width} height={height} role="img" aria-label="Bar chart">
					{reference && (
						<g>
							<line
								x1={labelWidth + (reference.value / max) * plotW}
								x2={labelWidth + (reference.value / max) * plotW}
								y1={0}
								y2={data.length * rowH}
								stroke={INK_MUTED}
								strokeWidth={1}
							/>
							<text
								x={labelWidth + (reference.value / max) * plotW}
								y={data.length * rowH + 13}
								textAnchor="middle"
								fontSize={11}
								fontWeight={600}
								fill={INK_MUTED}
							>
								{reference.label}
							</text>
						</g>
					)}
					{data.map((d, i) => {
						const y = i * rowH + (rowH - barH) / 2;
						const w = (Math.max(0, d.value) / max) * plotW;
						return (
							<g
								key={d.label}
								onMouseMove={(e) => {
									const box = ref.current!.getBoundingClientRect();
									setTip({
										x: e.clientX - box.left,
										y: e.clientY - box.top,
										title: d.label,
										rows: [{ label: "Value", value: format(d.value) }, ...(d.detail ?? [])],
									});
								}}
							>
								<rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
								<text
									x={labelWidth - 8}
									y={i * rowH + rowH / 2}
									textAnchor="end"
									dominantBaseline="central"
									fontSize={12}
									fontWeight={600}
									fill={INK}
								>
									{d.label.length > 20 ? d.label.slice(0, 19) + "…" : d.label}
								</text>
								<path d={barPath(labelWidth, y, w, barH, true)} fill={color} />
								<text
									x={labelWidth + w + 6}
									y={i * rowH + rowH / 2}
									dominantBaseline="central"
									fontSize={12}
									fontWeight={700}
									fill={INK_MUTED}
									className="tabular-nums"
								>
									{format(d.value)}
								</text>
							</g>
						);
					})}
				</svg>
			)}
			<Tooltip tip={tip} width={width} />
		</div>
	);
}

// --- Column chart (time / ordered buckets), optionally stacked or grouped ---

export interface ColumnSeries {
	key: string;
	label: string;
	color: string;
}

export function ColumnChart({
	data,
	series,
	format = fmtInt,
	mode = "stacked",
	height = 200,
}: {
	data: ({ label: string } & Record<string, number | string>)[];
	series: ColumnSeries[];
	format?: Fmt;
	mode?: "stacked" | "grouped";
	height?: number;
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [tip, setTip] = useState<Tip | null>(null);
	const [hover, setHover] = useState<number | null>(null);
	const padL = 40;
	const padB = 22;
	const padT = 8;
	const plotW = Math.max(40, width - padL - 4);
	const plotH = height - padB - padT;
	const val = (d: (typeof data)[number], k: string) => Number(d[k]) || 0;
	const max =
		mode === "stacked"
			? Math.max(...data.map((d) => series.reduce((s, ser) => s + val(d, ser.key), 0)), 0)
			: Math.max(...data.flatMap((d) => series.map((ser) => val(d, ser.key))), 0);
	const ticks = niceTicks(max || 1, 4, format === fmtInt);
	const top = ticks[ticks.length - 1];
	const band = data.length ? plotW / data.length : plotW;
	const groupW = Math.min(mode === "grouped" ? 24 * series.length + 2 * (series.length - 1) : 24, band * 0.75);
	const colW = mode === "grouped" ? (groupW - 2 * (series.length - 1)) / series.length : groupW;
	const yOf = (v: number) => padT + plotH - (v / top) * plotH;
	const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))));

	return (
		<div ref={ref} className="relative w-full" onMouseLeave={() => (setTip(null), setHover(null))}>
			<Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
			{width > 0 && (
				<svg width={width} height={height} role="img" aria-label="Column chart">
					{ticks.map((t) => (
						<g key={t}>
							<line x1={padL} x2={width} y1={yOf(t)} y2={yOf(t)} stroke={GRID} strokeWidth={1} />
							<text x={padL - 6} y={yOf(t)} textAnchor="end" dominantBaseline="central" fontSize={11} fill={INK_MUTED}>
								{format(t)}
							</text>
						</g>
					))}
					{data.map((d, i) => {
						const cx = padL + band * i + band / 2;
						let stackBase = 0;
						return (
							<g
								key={d.label}
								opacity={hover === null || hover === i ? 1 : 0.55}
								onMouseMove={(e) => {
									const box = ref.current!.getBoundingClientRect();
									setHover(i);
									setTip({
										x: e.clientX - box.left,
										y: e.clientY - box.top,
										title: d.label,
										rows: series.map((s) => ({
											label: s.label,
											value: format(val(d, s.key)),
											color: series.length > 1 ? s.color : undefined,
										})),
									});
								}}
							>
								<rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" />
								{series.map((s, si) => {
									const v = val(d, s.key);
									if (mode === "stacked") {
										const y1 = yOf(stackBase + v);
										const y0 = yOf(stackBase);
										const isTop = series.slice(si + 1).every((ss) => val(d, ss.key) === 0);
										stackBase += v;
										const h = Math.max(0, y0 - y1 - (si > 0 ? 2 : 0));
										return isTop ? (
											<path key={s.key} d={barPath(cx - colW / 2, y1, colW, h, false)} fill={s.color} />
										) : (
											<rect key={s.key} x={cx - colW / 2} y={y1} width={colW} height={h} fill={s.color} />
										);
									}
									const x = cx - groupW / 2 + si * (colW + 2);
									return <path key={s.key} d={barPath(x, yOf(v), colW, yOf(0) - yOf(v), false)} fill={s.color} />;
								})}
								{i % labelEvery === 0 && (
									<text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
										{d.label}
									</text>
								)}
							</g>
						);
					})}
					<line x1={padL} x2={width} y1={yOf(0)} y2={yOf(0)} stroke="#e8c8da" strokeWidth={1} />
				</svg>
			)}
			<Tooltip tip={tip} width={width} />
		</div>
	);
}

// --- Line chart (e.g. field points per seat over turns) ---

export interface LineSeries {
	label: string;
	color: string;
	points: { x: number; y: number }[];
}

export function LineChart({
	series,
	xLabel,
	format = fmtInt,
	height = 220,
}: {
	series: LineSeries[];
	xLabel: string;
	format?: Fmt;
	height?: number;
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [hx, setHx] = useState<number | null>(null);
	const padL = 36;
	const padR = 70;
	const padB = 24;
	const padT = 8;
	const plotW = Math.max(40, width - padL - padR);
	const plotH = height - padB - padT;
	const allX = series.flatMap((s) => s.points.map((p) => p.x));
	const minX = Math.min(...allX, 0);
	const maxX = Math.max(...allX, 1);
	const yTicks = niceTicks(Math.max(...series.flatMap((s) => s.points.map((p) => p.y)), 1));
	const top = yTicks[yTicks.length - 1];
	const minY = Math.min(0, ...series.flatMap((s) => s.points.map((p) => p.y)));
	const xOf = (x: number) => padL + ((x - minX) / (maxX - minX || 1)) * plotW;
	const yOf = (y: number) => padT + plotH - ((y - minY) / (top - minY || 1)) * plotH;
	const xTicks = niceTicks(maxX - minX, 6).map((t) => t + minX);
	const valueAt = (s: LineSeries, x: number) => {
		let last: number | null = null;
		for (const p of s.points) if (p.x <= x) last = p.y;
		return last;
	};

	return (
		<div
			ref={ref}
			className="relative w-full"
			onMouseLeave={() => setHx(null)}
			onMouseMove={(e) => {
				const box = ref.current!.getBoundingClientRect();
				const x = minX + ((e.clientX - box.left - padL) / plotW) * (maxX - minX);
				setHx(Math.round(Math.min(maxX, Math.max(minX, x))));
			}}
		>
			<Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
			{width > 0 && (
				<svg width={width} height={height} role="img" aria-label="Line chart">
					{yTicks.map((t) => (
						<g key={t}>
							<line x1={padL} x2={padL + plotW} y1={yOf(t)} y2={yOf(t)} stroke={GRID} />
							<text x={padL - 6} y={yOf(t)} textAnchor="end" dominantBaseline="central" fontSize={11} fill={INK_MUTED}>
								{format(t)}
							</text>
						</g>
					))}
					{xTicks.map((t) => (
						<text key={t} x={xOf(t)} y={height - 6} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
							{t}
						</text>
					))}
					<text x={padL + plotW} y={height - 6} textAnchor="end" fontSize={11} fill={INK_MUTED} dx={60}>
						{xLabel}
					</text>
					{hx !== null && <line x1={xOf(hx)} x2={xOf(hx)} y1={padT} y2={padT + plotH} stroke="#e8c8da" />}
					{series.map((s) => {
						// Step line - values hold until the next turn they change
						let d = "";
						s.points.forEach((p, i) => {
							d += i === 0 ? `M${xOf(p.x)},${yOf(p.y)}` : ` H${xOf(p.x)} V${yOf(p.y)}`;
						});
						const last = s.points[s.points.length - 1];
						return (
							<g key={s.label}>
								<path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
								{last && (
									<>
										<circle cx={xOf(last.x)} cy={yOf(last.y)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
										<text x={xOf(last.x) + 8} y={yOf(last.y)} dominantBaseline="central" fontSize={11} fontWeight={700} fill={INK}>
											{s.label}
										</text>
									</>
								)}
								{hx !== null && valueAt(s, hx) !== null && (
									<circle cx={xOf(hx)} cy={yOf(valueAt(s, hx)!)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
								)}
							</g>
						);
					})}
				</svg>
			)}
			{hx !== null && (
				<Tooltip
					width={width}
					tip={{
						x: xOf(hx),
						y: padT + 20,
						title: `${xLabel} ${hx}`,
						rows: series.map((s) => ({
							label: s.label,
							value: valueAt(s, hx) === null ? "-" : format(valueAt(s, hx)!),
							color: s.color,
						})),
					}}
				/>
			)}
		</div>
	);
}

// --- Card wrapper with chart/table toggle ---

export function ChartCard({
	title,
	subtitle,
	info,
	table,
	children,
}: {
	title: string;
	subtitle?: string;
	info?: string;
	table?: { columns: string[]; rows: (string | number)[][] };
	children: React.ReactNode;
}) {
	const [view, setView] = useState<"chart" | "table">("chart");
	useEffect(() => {
		if (!table) setView("chart");
	}, [table]);
	return (
		<section className="bg-white rounded-xl border-2 border-[#f5d0e8] p-4 min-w-0">
			<div className="flex items-start justify-between gap-2 mb-2">
				<div>
					<div className="flex items-center gap-1.5">
						<h3 className="font-extrabold text-[14px] text-[#3d1a2c]">{title}</h3>
						{info && <InfoTip text={info} />}
					</div>
					{subtitle && <p className="text-[12px] text-[#8a5a70] font-semibold">{subtitle}</p>}
				</div>
				{table && (
					<div className="flex text-[11px] font-extrabold bg-[#fbeaf3] rounded-lg p-0.5 shrink-0">
						{(["chart", "table"] as const).map((v) => (
							<button
								key={v}
								onClick={() => setView(v)}
								className={`px-2 py-1 rounded-md capitalize ${view === v ? "bg-white text-[#7a3a58] shadow-sm" : "text-[#8a5a70]"}`}
							>
								{v}
							</button>
						))}
					</div>
				)}
			</div>
			{view === "chart" || !table ? children : <DataTable columns={table.columns} rows={table.rows} />}
		</section>
	);
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number | null)[][] }) {
	return (
		<div className="overflow-auto max-h-[420px] rounded-lg border border-[#f5d0e8]">
			<table className="w-full text-[12px] text-left">
				<thead className="sticky top-0 bg-[#fff6fa] text-[11px] uppercase tracking-wide text-[#8a5a70]">
					<tr>
						{columns.map((c) => (
							<th key={c} className="px-2.5 py-1.5 font-extrabold whitespace-nowrap">
								{c}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="text-[#3d1a2c] font-semibold">
					{rows.map((r, i) => (
						<tr key={i} className="border-t border-[#f5e3ee]">
							{r.map((v, j) => (
								<td key={j} className="px-2.5 py-1.5 tabular-nums whitespace-nowrap">
									{v === null ? "-" : v}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
