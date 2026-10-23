"use client";

import { Component, useCallback, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { Filters } from "@/lib/analyticsSchema";
import type { DiscordProfile } from "@/lib/roles";
import { EXPANSION_PACKS, PACKS } from "@/lib/deck";

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
	const res = await fetch(path, {
		method: init?.method ?? "GET",
		cache: "no-store",
		headers: {
			"X-Requested-With": "itslam-admin",
			...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new ApiError(res.status, json.error || `Server returned ${res.status}`);
	return json as T;
}

export function avatarUrl(id: string, avatar: string | null): string {
	if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=32`;
	// Discord's default avatar for accounts without one
	const idx = Number((BigInt(id) >> BigInt(22)) % BigInt(6));
	return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

// Discord avatar and name with the account ID underneath
export function UserCell({ user, you }: { user: DiscordProfile; you?: boolean }) {
	return (
		<div className="flex items-center gap-2">
			<img src={avatarUrl(user.id, user.avatar)} alt="" width={24} height={24} className="rounded-full shrink-0" />
			<div className="min-w-0">
				<div className="truncate">
					{user.username ?? <span className="text-[#9a7888]">Never logged in</span>}
					{you && <span className="text-[#9a7888]"> (you)</span>}
				</div>
				<div className="text-[11px] text-[#9a7888] tabular-nums">{user.id}</div>
			</div>
		</div>
	);
}

export function filtersToQuery(f: Filters, extra: Record<string, string | number> = {}): string {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
	return params.toString();
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const load = useCallback(async () => {
		if (!path) return;
		setLoading(true);
		try {
			setData(await api<T>(path));
			setError(null);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [path, ...deps]);
	useEffect(() => {
		load();
	}, [load]);
	return { data, error, loading, reload: load };
}

// --- Formatting ---

export const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const nOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export function fmtDuration(ms: number | null): string {
	if (ms === null || isNaN(ms)) return "-";
	const totalS = Math.round(ms / 1000);
	const h = Math.floor(totalS / 3600);
	const m = Math.floor((totalS % 3600) / 60);
	const s = totalS % 60;
	if (h) return `${h}h ${m}m`;
	if (m) return `${m}m ${s.toString().padStart(2, "0")}s`;
	return `${s}s`;
}
export const pct = (v: unknown, digits = 0) =>
	v === null || v === undefined ? "-" : `${(Number(v) * 100).toFixed(digits)}%`;
export const dec = (v: unknown, digits = 1) =>
	v === null || v === undefined ? "-" : Number(v).toFixed(digits).replace(/\.0+$/, "");
export const prettyKey = (s: string) =>
	s
		.replace(/_/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (c) => c.toUpperCase());

// --- Components ---

// (i) icon that explains a stat on hover or keyboard focus. Fixed-positioned and
// clamped to the viewport so it never gets cut off by a card edge.
export function InfoTip({ text }: { text: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
	const WIDTH = 240;
	function show() {
		const r = ref.current?.getBoundingClientRect();
		if (!r) return;
		const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
		setPos({ left, top: r.bottom + 6 });
	}
	return (
		<span
			ref={ref}
			tabIndex={0}
			aria-label={text}
			onMouseEnter={show}
			onMouseLeave={() => setPos(null)}
			onFocus={show}
			onBlur={() => setPos(null)}
			className="inline-flex shrink-0 text-[#b08aa0] hover:text-[#7a3a58] focus:text-[#7a3a58] outline-none cursor-help"
		>
			<Info size={13} strokeWidth={2.5} />
			{pos && (
				<span
					role="tooltip"
					style={{ left: pos.left, top: pos.top, width: WIDTH }}
					className="fixed z-[100] bg-[#3d1a2c] text-white text-[12px] leading-snug font-semibold normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg pointer-events-none"
				>
					{text}
				</span>
			)}
		</span>
	);
}

export function Stat({ label, value, hint, info }: { label: string; value: React.ReactNode; hint?: string; info?: string }) {
	return (
		<div className="bg-white rounded-xl border-2 border-[#f5d0e8] px-4 py-3 text-left min-w-0">
			<div className="flex items-center gap-1 min-w-0">
				<p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8a5a70] truncate">{label}</p>
				{info && <InfoTip text={info} />}
			</div>
			<p className="text-2xl font-extrabold text-[#7a3a58] mt-0.5 tabular-nums truncate">{value}</p>
			{hint && <p className="text-[11px] text-[#9a7888] font-semibold mt-0.5">{hint}</p>}
		</div>
	);
}

export function StatGrid({ children }: { children: React.ReactNode }) {
	return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">{children}</div>;
}

export function ChartGrid({ children }: { children: React.ReactNode }) {
	return <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">{children}</div>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="font-extrabold text-[13px] uppercase tracking-wide text-[#8a5a70] mt-6 mb-2">{children}</h2>;
}

export function Message({ title, children }: { title: string; children?: React.ReactNode }) {
	return (
		<div className="text-center py-10">
			<p className="font-extrabold text-[#7a3a58] text-lg">{title}</p>
			{children && <div className="text-[13px] text-[#8a5a70] font-semibold mt-2">{children}</div>}
		</div>
	);
}

export function Loading() {
	return <p className="text-[#8a5a70] font-semibold text-sm py-8 text-center">Loading…</p>;
}

// Catches render errors in its children so one broken chart shows a message
// instead of taking down the whole page. Changing resetKey clears the error.
export class ErrorBoundary extends Component<
	{ children: React.ReactNode; resetKey?: unknown; message?: string },
	{ error: Error | null; key: unknown }
> {
	state = { error: null as Error | null, key: this.props.resetKey };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { error: Error | null; key: unknown }) {
		return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
	}
	componentDidCatch(error: Error) {
		console.error("[admin] render error:", error);
	}
	render() {
		if (this.state.error)
			return (
				<ErrorNote
					error={`${this.props.message ?? "Something went wrong showing this."} (${this.state.error.message})`}
					onRetry={() => this.setState({ error: null })}
				/>
			);
		return this.props.children;
	}
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
	return (
		<div className="bg-[#fff0f0] border-2 border-[#f5c8c8] text-[#a03040] rounded-xl px-4 py-3 text-[13px] font-semibold my-3">
			{error}{" "}
			{onRetry && (
				<button onClick={onRetry} className="underline font-extrabold">
					Retry
				</button>
			)}
		</div>
	);
}

export const inputClass =
	"px-2.5 py-1.5 rounded-lg border-2 border-[#f5d0e8] bg-white text-[13px] font-bold text-[#3d1a2c] outline-none focus:border-[#c05090]";
export const buttonClass =
	"font-extrabold text-[13px] px-4 py-1.5 rounded-full bg-[#c05090] text-white hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50";
export const ghostButtonClass =
	"font-extrabold text-[12px] px-3 py-1.5 rounded-full border-2 border-[#f5d0e8] bg-white text-[#7a3a58] hover:border-[#c05090] transition disabled:opacity-40";

export function Select<T extends string>({
	value,
	onChange,
	options,
	label,
}: {
	value: T;
	onChange: (v: T) => void;
	options: { value: T; label: string }[];
	label?: string;
}) {
	return (
		<label className="flex flex-col gap-0.5">
			{label && <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">{label}</span>}
			<select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputClass}>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

const RANGE_PRESETS: { label: string; days: number | null }[] = [
	{ label: "7d", days: 7 },
	{ label: "30d", days: 30 },
	{ label: "90d", days: 90 },
	{ label: "All", days: null },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
	const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
	const activePreset = RANGE_PRESETS.find((p) =>
		p.days === null
			? !filters.from && !filters.to
			: !filters.to && filters.from === isoDay(new Date(Date.now() - (p.days - 1) * 86400000)),
	);
	return (
		<div className="flex flex-wrap items-end gap-2 bg-white rounded-xl border-2 border-[#f5d0e8] px-3 py-2.5">
			<div className="flex flex-col gap-0.5">
				<span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">Range</span>
				<div className="flex bg-[#fbeaf3] rounded-lg p-0.5">
					{RANGE_PRESETS.map((p) => (
						<button
							key={p.label}
							onClick={() =>
								set({
									from: p.days === null ? undefined : isoDay(new Date(Date.now() - (p.days - 1) * 86400000)),
									to: undefined,
								})
							}
							className={`px-2.5 py-1 rounded-md text-[12px] font-extrabold ${
								activePreset === p ? "bg-white text-[#7a3a58] shadow-sm" : "text-[#8a5a70]"
							}`}
						>
							{p.label}
						</button>
					))}
				</div>
			</div>
			<label className="flex flex-col gap-0.5">
				<span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">From</span>
				<input
					type="date"
					value={filters.from ?? ""}
					onChange={(e) => set({ from: e.target.value || undefined })}
					className={inputClass}
				/>
			</label>
			<label className="flex flex-col gap-0.5">
				<span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">To</span>
				<input
					type="date"
					value={filters.to ?? ""}
					onChange={(e) => set({ to: e.target.value || undefined })}
					className={inputClass}
				/>
			</label>
			<Select
				label="Players"
				value={filters.players ?? ""}
				onChange={(v) => set({ players: v || undefined })}
				options={[
					{ value: "", label: "Any" },
					{ value: "2", label: "2" },
					{ value: "3", label: "3" },
					{ value: "4", label: "4" },
				]}
			/>
			<Select
				label="Status"
				value={filters.status ?? "completed"}
				onChange={(v) => set({ status: v })}
				options={[
					{ value: "completed", label: "Completed" },
					{ value: "abandoned", label: "Abandoned" },
					{ value: "all", label: "All" },
				]}
			/>
			<Select
				label="Bots"
				value={filters.bots ?? "any"}
				onChange={(v) => set({ bots: v })}
				options={[
					{ value: "any", label: "Any" },
					{ value: "none", label: "Humans only" },
					{ value: "some", label: "With bots" },
				]}
			/>
			<Select
				label="Lobby"
				value={filters.visibility ?? "any"}
				onChange={(v) => set({ visibility: v })}
				options={[
					{ value: "any", label: "Any" },
					{ value: "public", label: "Public" },
					{ value: "private", label: "Private" },
				]}
			/>
			<Select
				label="Card packs"
				value={filters.packs ?? "any"}
				onChange={(v) => set({ packs: v })}
				options={[
					{ value: "any", label: "Any" },
					{ value: "base", label: "Base game only" },
					{ value: "expansions", label: "Any expansion" },
					...EXPANSION_PACKS.map((id) => ({ value: id, label: `With ${PACKS[id].name}` })),
				]}
			/>
		</div>
	);
}
