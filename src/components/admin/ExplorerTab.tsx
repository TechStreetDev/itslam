"use client";

import { useEffect, useMemo, useState } from "react";
import {
	EVENT_DIMENSIONS,
	EVENT_FIELDS,
	EVENT_TYPES,
	EventTypeName,
	ExploreMetric,
	ExploreQuery,
	ExploreSource,
	FieldDef,
	Filters,
	GAME_COLUMNS,
	PLAYER_COLUMNS,
	SHARED_GAME_DIMENSIONS,
} from "@/lib/analyticsSchema";
import { BarChart, ChartCard, ColumnChart, SERIES, fmt1 } from "./Charts";
import { ErrorBoundary, ErrorNote, Select, api, buttonClass, filtersToQuery, ghostButtonClass, inputClass, prettyKey } from "./Shared";

interface ExploreResult {
	rows: { group: string; split?: string; value: number | null; n: number }[];
	sql: string;
}

function fieldsFor(source: ExploreSource, eventType: EventTypeName | ""): FieldDef[] {
	if (source === "games") return [...GAME_COLUMNS, ...SHARED_GAME_DIMENSIONS.filter((d) => d.key !== "g.status" && d.key !== "g.player_count")];
	if (source === "players")
		return [
			...PLAYER_COLUMNS,
			...SHARED_GAME_DIMENSIONS,
			...GAME_COLUMNS.filter((c) => c.key !== "status" && c.key !== "player_count").map((c) => ({ ...c, key: `g.${c.key}`, label: `Game: ${c.label}` })),
		];
	const data = eventType
		? EVENT_FIELDS[eventType]
		: Object.values(EVENT_FIELDS)
				.flat()
				.filter((f, i, all) => all.findIndex((x) => x.key === f.key) === i);
	return [...EVENT_DIMENSIONS, ...data.map((f) => ({ ...f, key: `data.${f.key}` })), ...SHARED_GAME_DIMENSIONS];
}

const METRICS: { value: ExploreMetric; label: string; needsField?: "num" | "bool" }[] = [
	{ value: "count", label: "Count of rows" },
	{ value: "games", label: "Distinct games" },
	{ value: "avg", label: "Average of…", needsField: "num" },
	{ value: "sum", label: "Sum of…", needsField: "num" },
	{ value: "min", label: "Minimum of…", needsField: "num" },
	{ value: "max", label: "Maximum of…", needsField: "num" },
	{ value: "pct_true", label: "% where true…", needsField: "bool" },
];

const PRESETS: { label: string; query: ExploreQuery }[] = [
	{ label: "Win rate by seat × players", query: { source: "players", groupBy: "seat", splitBy: "g.player_count", metric: "pct_true", metricField: "is_winner" } },
	{ label: "Coin fairness by challenge", query: { source: "events", eventType: "coin_flip", groupBy: "data.challenge", splitBy: "data.flip", metric: "count" } },
	{ label: "Sheep kinds by player count", query: { source: "events", eventType: "sheep_built", groupBy: "data.kind", splitBy: "g.player_count", metric: "count" } },
	{ label: "Avg game length by weekday", query: { source: "games", groupBy: "g.weekday", metric: "avg", metricField: "duration_min" } },
	{ label: "Field points by turn", query: { source: "events", eventType: "turn_end", groupBy: "turn", metric: "avg", metricField: "data.fieldPoints" } },
	{ label: "Challenge targets the leader?", query: { source: "events", eventType: "challenge_played", groupBy: "data.challenge", metric: "avg", metricField: "data.targetPoints" } },
	{ label: "Score: bots vs humans", query: { source: "players", groupBy: "is_bot", splitBy: "g.player_count", metric: "avg", metricField: "score" } },
	{ label: "Events per turn bucket", query: { source: "events", groupBy: "turn_bucket", splitBy: "type", metric: "count" } },
];

export function ExplorerTab({ filters }: { filters: Filters }) {
	return (
		<ErrorBoundary message="The explorer hit a problem.">
			<Builder filters={filters} />
		</ErrorBoundary>
	);
}

function Builder({ filters }: { filters: Filters }) {
	const [query, setQuery] = useState<ExploreQuery>(PRESETS[0].query);
	// The result is kept with the query that produced it, so editing the form
	// doesn't redraw old rows with settings they weren't fetched for
	const [result, setResult] = useState<{ data: ExploreResult; query: ExploreQuery } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [running, setRunning] = useState(false);
	const fields = useMemo(() => fieldsFor(query.source, query.eventType ?? ""), [query.source, query.eventType]);
	const metric = METRICS.find((m) => m.value === query.metric) ?? METRICS[0];
	const metricFields = metric.needsField ? fields.filter((f) => f.kind === metric.needsField) : [];
	const set = (patch: Partial<ExploreQuery>) => setQuery((q) => ({ ...q, ...patch }));

	// Show something useful straight away, and re-run when the filters change
	useEffect(() => {
		run();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters]);

	async function run(q = query) {
		const m = METRICS.find((x) => x.value === q.metric);
		if (m?.needsField && !q.metricField) {
			setError(`Pick a field to ${m.label.replace("…", "").toLowerCase()}.`);
			setResult(null);
			return;
		}
		setRunning(true);
		setError(null);
		try {
			const data = await api<ExploreResult>(`/api/admin/explore?${filtersToQuery(filters)}`, { method: "POST", body: q });
			if (!data || !Array.isArray(data.rows)) throw new Error("The server sent back an unexpected response.");
			setResult({ data, query: q });
		} catch (e) {
			setError((e as Error)?.message || "The query failed.");
			setResult(null);
		} finally {
			setRunning(false);
		}
	}

	function changeSource(source: ExploreSource) {
		const f = fieldsFor(source, "");
		set({ source, eventType: "", groupBy: f[0].key, splitBy: "", metric: "count", metricField: undefined, where: [] });
	}

	const fieldOptions = fields.map((f) => ({ value: f.key, label: f.label }));
	const where = query.where ?? [];

	return (
		<>
			<div className="flex flex-wrap gap-1.5 mb-3">
				{PRESETS.map((p) => (
					<button
						key={p.label}
						className={ghostButtonClass}
						onClick={() => {
							setQuery(p.query);
							run(p.query);
						}}
					>
						{p.label}
					</button>
				))}
			</div>

			<div className="bg-white rounded-xl border-2 border-[#f5d0e8] p-3 flex flex-wrap items-end gap-2">
				<Select
					label="Data"
					value={query.source}
					onChange={changeSource}
					options={[
						{ value: "events", label: "Game events" },
						{ value: "games", label: "Games" },
						{ value: "players", label: "Player results" },
					]}
				/>
				{query.source === "events" && (
					<Select
						label="Event type"
						value={query.eventType ?? ""}
						onChange={(v) => set({ eventType: v as EventTypeName | "", where: [] })}
						options={[{ value: "", label: "Any event" }, ...EVENT_TYPES.map((t) => ({ value: t, label: prettyKey(t) }))]}
					/>
				)}
				<Select label="Group by" value={query.groupBy} onChange={(v) => set({ groupBy: v })} options={fieldOptions} />
				<Select
					label="Split by"
					value={query.splitBy ?? ""}
					onChange={(v) => set({ splitBy: v })}
					options={[{ value: "", label: "(none)" }, ...fieldOptions]}
				/>
				<Select
					label="Measure"
					value={query.metric}
					onChange={(v) => {
						const m = METRICS.find((x) => x.value === v)!;
						const first = m.needsField ? fields.find((f) => f.kind === m.needsField)?.key : undefined;
						set({ metric: v, metricField: first });
					}}
					options={METRICS.map((m) => ({ value: m.value, label: m.label }))}
				/>
				{metric.needsField && (
					<Select
						label="Field"
						value={query.metricField ?? ""}
						onChange={(v) => set({ metricField: v })}
						options={metricFields.map((f) => ({ value: f.key, label: f.label }))}
					/>
				)}
				<button className={buttonClass} onClick={() => run()} disabled={running}>
					{running ? "Running…" : "Run"}
				</button>
			</div>

			<div className="bg-white rounded-xl border-2 border-[#f5d0e8] p-3 mt-2">
				<p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70] mb-1">Only include rows where</p>
				{where.map((w, i) => (
					<div key={i} className="flex flex-wrap items-center gap-2 mb-1.5">
						<Select
							value={w.field}
							onChange={(v) => set({ where: where.map((x, j) => (j === i ? { ...x, field: v } : x)) })}
							options={fieldOptions}
						/>
						<span className="text-[13px] font-bold text-[#8a5a70]">=</span>
						<input
							value={w.value}
							onChange={(e) => set({ where: where.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
							placeholder="value (true/false, 1/0, text)"
							className={inputClass}
						/>
						<button className="text-[12px] font-extrabold text-[#c05090]" onClick={() => set({ where: where.filter((_, j) => j !== i) })}>
							Remove
						</button>
					</div>
				))}
				<button className="text-[12px] font-extrabold text-[#c05090] underline" onClick={() => set({ where: [...where, { field: fields[0].key, value: "" }] })}>
					+ Add condition
				</button>
			</div>

			{error && <ErrorNote error={error} onRetry={() => run()} />}
			{result && (
				<ErrorBoundary resetKey={result} message="Couldn't draw this result - try a different grouping or measure.">
					<ResultView result={result.data} query={result.query} />
				</ErrorBoundary>
			)}
		</>
	);
}

function ResultView({ result, query }: { result: ExploreResult; query: ExploreQuery }) {
	const fields = fieldsFor(query.source, query.eventType ?? "");
	const label = (key?: string) => fields.find((f) => f.key === key)?.label ?? key ?? "";
	return <ExploreChart result={result} query={query} groupLabel={label(query.groupBy)} splitLabel={label(query.splitBy)} metricLabel={metricLabel(query, fields)} />;
}

function metricLabel(q: ExploreQuery, fields: FieldDef[]): string {
	const f = fields.find((x) => x.key === q.metricField)?.label ?? "";
	switch (q.metric) {
		case "count":
			return "Rows";
		case "games":
			return "Games";
		case "pct_true":
			return `% ${f}`;
		default:
			return `${prettyKey(q.metric)} ${f}`;
	}
}

function sortGroups(groups: string[]): string[] {
	const allNumeric = groups.every((g) => g === "(none)" || !isNaN(Number(g)));
	return allNumeric ? [...groups].sort((a, b) => Number(a) - Number(b)) : groups;
}

function ExploreChart({
	result,
	query,
	groupLabel,
	splitLabel,
	metricLabel,
}: {
	result: ExploreResult;
	query: ExploreQuery;
	groupLabel: string;
	splitLabel: string;
	metricLabel: string;
}) {
	const [showSql, setShowSql] = useState(false);
	const rows = result.rows;
	const format = query.metric === "pct_true" ? (v: number) => `${v.toFixed(1)}%` : query.metric === "count" || query.metric === "games" ? (v: number) => Math.round(v).toLocaleString() : fmt1;
	const groups = sortGroups([...new Set(rows.map((r) => r.group ?? "(none)"))]);
	const splits = query.splitBy ? sortGroups([...new Set(rows.map((r) => r.split ?? "(none)"))]) : [];

	let chart: React.ReactNode;
	if (rows.length === 0) chart = <p className="text-[13px] font-semibold text-[#8a5a70]">No rows matched.</p>;
	else if (!query.splitBy) {
		const data = groups.map((g) => {
			const r = rows.find((x) => x.group === g)!;
			return { label: prettyKey(g), value: r.value ?? 0, detail: [{ label: "Rows", value: r.n.toLocaleString() }] };
		});
		chart = groups.length <= 25 ? <BarChart data={data} format={format} labelWidth={150} /> : (
			<ColumnChart data={data.map((d) => ({ label: d.label, value: d.value }))} series={[{ key: "value", label: metricLabel, color: SERIES[0] }]} format={format} />
		);
	} else if (splits.length <= SERIES.length && groups.length <= 40) {
		chart = (
			<ColumnChart
				mode="grouped"
				format={format}
				data={groups.map((g) => ({
					label: prettyKey(g),
					...Object.fromEntries(splits.map((s, i) => [`s${i}`, rows.find((r) => r.group === g && r.split === s)?.value ?? 0])),
				}))}
				series={splits.map((s, i) => ({ key: `s${i}`, label: `${splitLabel}: ${prettyKey(s)}`, color: SERIES[i] }))}
			/>
		);
	} else {
		chart = (
			<p className="text-[13px] font-semibold text-[#8a5a70]">
				Too many series to chart clearly ({splits.length} splits) - switch to the table, or pick a split with fewer values.
			</p>
		);
	}

	return (
		<div className="mt-3">
			<ChartCard
				title={`${metricLabel} by ${groupLabel}${query.splitBy ? ` and ${splitLabel}` : ""}`}
				subtitle={`${rows.length} result rows`}
				table={{
					columns: [groupLabel, ...(query.splitBy ? [splitLabel] : []), metricLabel, "Rows"],
					rows: rows.map((r) => [r.group, ...(query.splitBy ? [r.split ?? "(none)"] : []), r.value === null ? "-" : format(r.value), r.n]),
				}}
			>
				{chart}
			</ChartCard>
			<button className="text-[12px] font-extrabold text-[#8a5a70] underline mt-2" onClick={() => setShowSql(!showSql)}>
				{showSql ? "Hide SQL" : "Show SQL"}
			</button>
			{showSql && (
				<pre className="mt-1 bg-white border-2 border-[#f5d0e8] rounded-xl p-3 text-[11px] text-[#5a3048] whitespace-pre-wrap">{result.sql}</pre>
			)}
		</div>
	);
}
