/**
 * dsh-ui-usage-stats host entry.
 *
 * Aggregates token usage across every durable session log under
 * $DSH_HOME/sessions (assistant/message usage + timestamps), caches per file
 * mtime, supports an optional session-id filter, and serves an authenticated
 * /usage-stats JSON channel for the sidebar dashboard.
 */
import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Cordis plugin identity. */
export const name = "usage-stats";

//#region aggregation
function emptyFileResult() {
	return { sessionId: undefined, title: undefined, workspace: undefined, records: [], firstTime: undefined, lastTime: undefined };
}

/** Decode one workspace directory name ("--data-qq-bot--" to "data/qq-bot"). */
function decodeWorkspace(name) {
	const decoded = name.replace(/^-+/, "").replace(/-+$/, "").split("--").filter((part) => part !== "").join("/");
	return decoded === "" ? "/" : decoded;
}

/** Decompress one zstd session log; fold usage, session id, and titles. */
async function aggregateSessionFile(file, workspaceName) {
	const result = emptyFileResult();
	result.workspace = decodeWorkspace(workspaceName);
	let stdout;
	try {
		({ stdout } = await execFileAsync("zstd", ["-dc", file], { maxBuffer: 256 * 1024 * 1024 }));
	} catch {
		return result;
	}
	for (const line of stdout.split("\n")) {
		if (line.length === 0) continue;
		const isUsage = line.indexOf('"assistant/message"') !== -1;
		const isHeader = result.sessionId === undefined && line.indexOf('"type":"session"') !== -1;
		const isTitle = line.indexOf('"session/title"') !== -1;
		if (!isUsage && !isHeader && !isTitle) continue;
		let event;
		try { event = JSON.parse(line); } catch { continue; }
		if (isHeader) {
			if (typeof event.id === "string") result.sessionId = event.id;
			continue;
		}
		if (isTitle) {
			if (typeof event.data?.title === "string" && event.data.title !== "") result.title = event.data.title;
			continue;
		}
		if (event?.type !== "assistant/message") continue;
		const usage = event.data?.usage;
		if (usage === null || typeof usage !== "object") continue;
		const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
		if (!(tokens > 0)) continue;
		const source = event.data?.message?.source;
		result.records.push({
			time: event.time,
			provider: typeof source?.provider === "string" ? source.provider : "?",
			model: typeof source?.model === "string" ? source.model : "?",
			tokens,
		});
		if (result.firstTime === undefined || event.time < result.firstTime) result.firstTime = event.time;
		if (result.lastTime === undefined || event.time > result.lastTime) result.lastTime = event.time;
	}
	return result;
}

/** Local YYYY-MM-DD for one epoch-ms timestamp. */
function localDate(time) {
	const date = new Date(time);
	const pad = (v) => String(v).padStart(2, "0");
	return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

/** Session-log inventory with mtimes. */
function sessionFiles(root) {
	const files = [];
	let workspaces;
	try { workspaces = readdirSync(root, { withFileTypes: true }); } catch { return files; }
	for (const workspace of workspaces) {
		if (!workspace.isDirectory()) continue;
		const workspacePath = join(root, workspace.name);
		let sessions;
		try { sessions = readdirSync(workspacePath, { withFileTypes: true }); } catch { continue; }
		for (const session of sessions) {
			if (!session.isDirectory()) continue;
			const sessionPath = join(workspacePath, session.name);
			let logs;
			try { logs = readdirSync(sessionPath); } catch { continue; }
			for (const log of logs) {
				if (!log.startsWith("session.v") || !log.endsWith(".jsonl.zstd")) continue;
				const file = join(sessionPath, log);
				try {
					const st = statSync(file);
					files.push({ file, mtimeMs: st.mtimeMs, size: st.size, workspaceName: workspace.name });
				} catch {}
			}
		}
	}
	return files;
}

/** Merge one file result into the mutable aggregate accumulators. */
function foldFileResult(result, acc) {
	for (const record of result.records) {
		const date = localDate(record.time);
		let day = acc.daily.get(date);
		if (day === undefined) { day = { total: 0, byModel: new Map() }; acc.daily.set(date, day); }
		day.total += record.tokens;
		const modelKey = record.provider + "/" + record.model;
		day.byModel.set(modelKey, (day.byModel.get(modelKey) ?? 0) + record.tokens);
		acc.modelTotals.set(modelKey, (acc.modelTotals.get(modelKey) ?? 0) + record.tokens);
		acc.totalTokens += record.tokens;
		if (day.total > acc.peakDayTokens) { acc.peakDayTokens = day.total; acc.peakDayDate = date; }
	}
	const span = result.lastTime !== undefined && result.firstTime !== undefined ? result.lastTime - result.firstTime : 0;
	if (span > acc.longestChatMs) acc.longestChatMs = span;
}

/** Streak computation over the set of active local dates. */
function computeStreaks(dates) {
	if (dates.size === 0) return { current: 0, longest: 0 };
	const sorted = [...dates].sort();
	const DAY = 24 * 60 * 60 * 1000;
	let longest = 1;
	let run = 1;
	for (let index = 1; index < sorted.length; index += 1) {
		const previous = new Date(sorted[index - 1] + "T00:00:00");
		const current = new Date(sorted[index] + "T00:00:00");
		if (Math.round((current - previous) / DAY) === 1) { run += 1; if (run > longest) longest = run; }
		else run = 1;
	}
	const today = localDate(Date.now());
	const yesterday = localDate(Date.now() - DAY);
	let current = 0;
	if (dates.has(today) || dates.has(yesterday)) {
		let cursor = dates.has(today) ? today : yesterday;
		while (dates.has(cursor)) {
			current += 1;
			const previous = new Date(cursor + "T00:00:00");
			previous.setDate(previous.getDate() - 1);
			cursor = localDate(previous.getTime());
		}
	}
	return { current, longest };
}

/** Finalize accumulators into the wire shape. */
function finishAggregate(acc) {
	const daily = [...acc.daily.entries()]
		.map(([date, day]) => ({ date, total: day.total, byModel: Object.fromEntries(day.byModel) }))
		.sort((left, right) => left.date.localeCompare(right.date));
	const models = [...acc.modelTotals.entries()]
		.map(([key, tokens]) => ({ key, tokens }))
		.sort((left, right) => right.tokens - left.tokens);
	const streaks = computeStreaks(new Set(acc.daily.keys()));
	return {
		totalTokens: acc.totalTokens,
		peakDay: acc.peakDayDate === undefined ? null : { date: acc.peakDayDate, tokens: acc.peakDayTokens },
		longestChatMs: acc.longestChatMs,
		currentStreak: streaks.current,
		longestStreak: streaks.longest,
		daily,
		models,
	};
}

/** Per-session aggregator with per-file mtime+size caching. */
function createAggregator(root) {
	const cache = new Map();

	/** Scan the store and refresh changed files into the cache. */
	async function ensureAll() {
		const pending = [];
		const seen = new Set();
		for (const entry of sessionFiles(root)) {
			seen.add(entry.file);
			const cached = cache.get(entry.file);
			if (cached !== undefined && cached.mtimeMs === entry.mtimeMs && cached.size === entry.size) continue;
			pending.push(entry);
		}
		for (const file of [...cache.keys()]) if (!seen.has(file)) cache.delete(file);
		const concurrency = 8;
		let cursor = 0;
		const workers = Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, async () => {
			while (cursor < pending.length) {
				const entry = pending[cursor];
				cursor += 1;
				const segments = entry.file.split(/[\\/]/);
				const workspaceName = segments[segments.length - 3] ?? "";
				const result = await aggregateSessionFile(entry.file, workspaceName);
				if (result.sessionId === undefined) result.sessionId = segments[segments.length - 2] ?? entry.file;
				cache.set(entry.file, { mtimeMs: entry.mtimeMs, size: entry.size, sessionId: result.sessionId, title: result.title, workspace: result.workspace, records: result.records, firstTime: result.firstTime, lastTime: result.lastTime });
			}
		});
		await Promise.all(workers);
	}

	/** Per-session summaries for the picker (sorted by recency). */
	function sessionSummaries() {
		const bySession = new Map();
		for (const entry of cache.values()) {
			const tokens = entry.records.reduce((total, record) => total + record.tokens, 0);
			const existing = bySession.get(entry.sessionId);
			if (existing === undefined) {
				bySession.set(entry.sessionId, { id: entry.sessionId, title: entry.title ?? null, workspace: entry.workspace, tokens, lastTime: entry.lastTime ?? 0 });
				continue;
			}
			existing.tokens += tokens;
			if ((entry.lastTime ?? 0) > existing.lastTime) { existing.lastTime = entry.lastTime; if (entry.title !== undefined) existing.title = entry.title; }
			if (existing.workspace === "/" && entry.workspace !== "/") existing.workspace = entry.workspace;
		}
		return [...bySession.values()].sort((left, right) => right.lastTime - left.lastTime);
	}

	/** Aggregate with optional session-id / workspace filters (empty = all); both filters intersect. */
	async function aggregate(sessionIds, workspaces) {
		await ensureAll();
		const sessionFilter = Array.isArray(sessionIds) && sessionIds.length > 0 ? new Set(sessionIds) : null;
		const workspaceFilter = Array.isArray(workspaces) && workspaces.length > 0 ? new Set(workspaces) : null;
		const acc = {
			totalTokens: 0, peakDayTokens: 0, peakDayDate: undefined, longestChatMs: 0,
			daily: new Map(), modelTotals: new Map(),
		};
		const matchedSessions = new Set();
		for (const entry of cache.values()) {
			if (sessionFilter !== null && !sessionFilter.has(entry.sessionId)) continue;
			if (workspaceFilter !== null && !workspaceFilter.has(entry.workspace)) continue;
			matchedSessions.add(entry.sessionId);
			foldFileResult({ records: entry.records, firstTime: entry.firstTime, lastTime: entry.lastTime }, acc);
		}
		const result = finishAggregate(acc);
		result.filtered = sessionFilter !== null || workspaceFilter !== null;
		result.sessionCount = matchedSessions.size;
		return result;
	}

	async function sessionSummariesAsync() { await ensureAll(); return sessionSummaries(); }
	return { aggregate, sessionSummaries: sessionSummariesAsync };
}
//#endregion

//#region rpc
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 1024 * 1024) { reject(new Error("request body too large")); req.destroy(); return; }
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function makeRpcRouteHandler(connectionCtx, handle) {
	return async (req, res) => {
		const write = (status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
		try {
			const admission = connectionCtx.connection.admit(req);
			if ("rejection" in admission) { res.writeHead(admission.rejection); res.end(admission.rejection === 401 ? "unauthorized" : "forbidden"); return; }
			if (req.method !== "POST") { write(405, { error: "method not allowed" }); return; }
			if ((req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") { write(415, { error: "content type must be application/json" }); return; }
			let message;
			try { message = JSON.parse(await readBody(req)); } catch { write(400, { error: "body is not JSON" }); return; }
			if (message === null || typeof message !== "object" || message.type !== "client-request" || typeof message.rpcId !== "string" || message.rpcId === "" || typeof message.method !== "string") {
				write(400, { type: "server-response", rpcId: "invalid-request", result: { ok: false, error: { code: "gateway/bad-request", message: "invalid client-request message" } } });
				return;
			}
			const result = await handle(message.method, message.payload ?? {});
			write(200, { type: "server-response", rpcId: message.rpcId, result });
		} catch (error) {
			write(500, { error: "rpc failure: " + String(error instanceof Error ? error.message : error) });
		}
	};
}
//#endregion

//#region body
export function apply(ctx) {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const { aggregate, sessionSummaries } = createAggregator(join(home, "sessions"));

	const handleRpc = async (endpoint, payload) => {
		try {
			switch (endpoint) {
				case "all":
					return { ok: true, value: await aggregate(payload?.sessionIds, payload?.workspaces) };
				case "filter":
					return { ok: true, value: await aggregate(payload?.sessionIds, payload?.workspaces) };
				case "sessions":
					return { ok: true, value: { sessions: await sessionSummaries() } };
				default:
					return { ok: false, error: { code: "usage-stats/unknown-endpoint", message: "unknown endpoint " + String(endpoint) } };
			}
		} catch (error) {
			return { ok: false, error: { code: "usage-stats/failed", message: error instanceof Error ? error.message : String(error) } };
		}
	};

	ctx.inject(["connection", "webServer"], (rpcCtx) => {
		rpcCtx.webServer.register({ kind: "prefix", path: "/usage-stats", handler: makeRpcRouteHandler(rpcCtx, handleRpc) });
	});

	ctx.logger?.info?.("usage-stats: aggregating %s", join(home, "sessions"));
}
//#endregion
