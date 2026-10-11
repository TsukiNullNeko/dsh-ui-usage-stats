#!/usr/bin/env node
import { readFileSync } from "node:fs";
const code = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
let captured = null;
new Function("window", code)({ __ModuleLoader__: { load: (d) => { captured = d; } } });
let fetchMode = "all";
const fetchValue = {
	totalTokens: 2210000000,
	peakDay: { date: "2026-10-07", tokens: 260000000 },
	longestChatMs: 2 * 24 * 3600000 + 3 * 3600000 + 26 * 60000,
	currentStreak: 7,
	longestStreak: 9,
	daily: [
		{ date: "2026-10-04", total: 100, byModel: { "w/model-a": 60, "n/model-b": 40 } },
		{ date: "2026-10-05", total: 300, byModel: { "w/model-a": 200, "GLM-5.3": 100 } },
		{ date: "2026-10-06", total: 200, byModel: { "w/model-a": 150 } },
	],
	models: [
		{ key: "w/model-a", tokens: 410 },
		{ key: "n/model-b", tokens: 40 },
		{ key: "GLM-5.3", tokens: 100 },
	],
};
globalThis.fetch = async (url, init) => {
	const body = JSON.parse(init.body);
	return { status: 200, json: async () => ({ type: "server-response", rpcId: body.rpcId, result: { ok: true, value: fetchValue } }) };
};
const reactStub = {
	createElement: (type, props, ...children) => {
		const node = { type, props: props ?? {}, children: children.flat(Infinity) };
		if (typeof type === "function") return type(node.props);
		return node;
	},
	Fragment: "fragment",
	memo: (c) => c,
	useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
	useEffect: () => {},
	useMemo: (fn) => fn(),
	useRef: (i) => ({ current: i }),
	useCallback: (fn) => fn,
};
const client = captured.factory((id) => id === "react" ? reactStub : (() => { throw new Error("unexpected require " + id); })());
const I = client.__internals;
const fail = (m) => { throw new Error("ASSERT: " + m); };

// formatting: 亿 / 万
if (I.formatTokens(2210000000) !== "22.1 亿") throw new Error("亿: " + I.formatTokens(2210000000));
if (I.formatTokens(90863000) !== "9086 万") throw new Error("万: " + I.formatTokens(90863000));
if (I.formatDuration(2 * 24 * 3600000 + 3 * 3600000 + 26 * 60000) !== "2 天 3 小时 26 分") throw new Error("duration");

// heatmap cells
const daily = fetchValue.daily;
const heat = I.Heatmap({ daily });
const countNodes = (node) => {
	if (node === null || node === undefined || typeof node !== "object") return 0;
	let total = 1;
	for (const child of node.children ?? []) total += countNodes(child);
	return total;
};
if (countNodes(heat) < 50) throw new Error("heatmap renders 364-day grid");

// trend renders per-model polylines
const trend = I.TrendChart({ daily, days: 7, t: (k) => k });
const trendText = JSON.stringify(trend);
if (!trendText.includes("polyline")) throw new Error("trend polylines");
if (!trendText.includes("w/model-a")) throw new Error("trend legend");

// donut slices + legend
const donut = I.Donut({ daily, days: 7, t: (k) => k });
const donutText = JSON.stringify(donut);
if (!donutText.includes("path")) throw new Error("donut arcs");

console.log("ALL USAGE-STATS CLIENT CHECKS PASSED");
