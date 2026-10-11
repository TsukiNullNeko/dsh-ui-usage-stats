#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { apply } from "../lib/index.js";
const execFileAsync = promisify(execFile);

const home = mkdtempSync(join(tmpdir(), "usage-stats-test-"));
process.env.DSH_HOME = home;
const root = join(home, "sessions", "ws", "sess-1");
const { mkdirSync } = await import("node:fs");
mkdirSync(root, { recursive: true });

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const header1 = JSON.stringify({ type: "session", version: 4, id: "session-aaa", createdAt: now - 3 * DAY, cwd: "/data/qq-bot" });
const title1 = JSON.stringify({ type: "session/title", seq: 3, time: now - 3 * DAY, data: { title: "QQ 机器人" } });
const mk = (time, provider, model, input, output) => JSON.stringify({ type: "assistant/message", seq: 1, time, data: { usage: { inputTokens: input, outputTokens: output }, message: { source: { provider, model } } } });
const lines = [
	header1,
	mk(now - 3 * DAY, "w", "model-a", 100, 50),
	mk(now - 3 * DAY, "w", "model-a", 200, 80),
	mk(now - 2 * DAY, "n", "model-b", 10, 5),
	mk(now, "w", "model-a", 30, 20),
	title1,
	JSON.stringify({ type: "user/message", seq: 2, time: now, data: {} }),
].join("\n") + "\n";
const raw = root + "/session.v4.jsonl";
writeFileSync(raw, lines);
await execFileAsync("zstd", ["-f", "-q", raw, "-o", raw + ".zstd"]);
const root2 = join(home, "sessions", "ws2", "sess-2");
mkdirSync(root2, { recursive: true });
const header2 = JSON.stringify({ type: "session", version: 4, id: "session-bbb", createdAt: now - DAY, cwd: "/data/web" });
const lines2 = [header2, mk(now - DAY, "n", "model-b", 500, 100)].join("\n") + "\n";
const raw2 = root2 + "/session.v4.jsonl";
writeFileSync(raw2, lines2);
await execFileAsync("zstd", ["-f", "-q", raw2, "-o", raw2 + ".zstd"]);

const plugin = await import("../lib/index.js");
if (plugin.name !== "usage-stats") throw new Error("name");

const routes = [];
const ctx = {
	inject: (_l, cb) => { cb(ctx); return () => {}; },
	webServer: { register: (r) => { routes.push(r); return () => {}; } },
	connection: { admit: () => ({ peer: {} }) },
	logger: { info: () => {}, warn: () => {} },
};
plugin.apply(ctx);
if (routes.length !== 1 || routes[0].path !== "/usage-stats") throw new Error("route");

class FakeReq {
	constructor(body) { this.method = "POST"; this.headers = { "content-type": "application/json" }; this.body = body; }
	on(e, cb) { if (e === "data") this.dc = cb; if (e === "end") this.ec = cb; if (e === "error") setTimeout(() => { if (this.body !== undefined) this.dc?.(Buffer.from(this.body)); this.ec?.(); }, 0); return this; }
	destroy() {}
}
const drive = async (endpoint) => {
	const req = new FakeReq(JSON.stringify({ type: "client-request", rpcId: "t", method: endpoint, payload: {} }));
	const res = { status: 0, body: "" };
	res.writeHead = (s) => { res.status = s; };
	res.end = (b) => { res.body = b ?? ""; };
	await routes[0].handler(req, res);
	if (res.status !== 200) throw new Error(endpoint + " -> " + res.status + " " + res.body);
	return JSON.parse(res.body).result;
};

const all = await drive("all");
const value = all.value;
if (value.totalTokens !== 1095) throw new Error("total: " + value.totalTokens);
if (value.models.length !== 2 || value.models[0].key !== "n/model-b") throw new Error("models: " + JSON.stringify(value.models));
if (value.models[0].tokens !== 615) throw new Error("model-b total: " + value.models[0].tokens);
if (value.currentStreak !== 4) throw new Error("streak: " + JSON.stringify({ c: value.currentStreak, l: value.longestStreak }));
if (value.longestStreak !== 4) throw new Error("longest streak (gap between day-3 and day-2 breaks it): " + value.longestStreak);
const peak = value.peakDay;
if (peak === null || peak.tokens !== 600) throw new Error("peak day: " + JSON.stringify(peak));
const day3 = value.daily.find((d) => d.total === 430);
if (day3.byModel["w/model-a"] !== 430) throw new Error("daily byModel");
if (value.longestChatMs !== 3 * DAY) throw new Error("longest chat span: " + value.longestChatMs);

// idempotent re-run through cache
const driveFiltered = async (ids) => {	const req = new FakeReq(JSON.stringify({ type: "client-request", rpcId: "f", method: "all", payload: { sessionIds: ids } }));	const res = { status: 0, body: "" };	res.writeHead = (st) => { res.status = st; };	res.end = (b) => { res.body = b ?? ""; };	await routes[0].handler(req, res);	return JSON.parse(res.body).result.value; };
const onlyB = await driveFiltered(["session-bbb"]);
if (onlyB.totalTokens !== 600) throw new Error("filtered total: " + onlyB.totalTokens);
if (onlyB.filtered !== true || onlyB.sessionCount !== 1) throw new Error("filter metadata");
const emptySel = await driveFiltered([]);
if (emptySel.totalTokens !== 1095) throw new Error("empty selection = all");
const sessions = await drive("sessions");
if (sessions.value.sessions.length !== 2) throw new Error("session summaries");
const aaa = sessions.value.sessions.find((x) => x.id === "session-aaa");
if (aaa.title !== "QQ 机器人" || aaa.workspace !== "ws") throw new Error("summary metadata: " + JSON.stringify(aaa));
const again = await drive("all");
if (again.value.totalTokens !== 1095) throw new Error("cached rerun total");

// cleanup
rmSync(home, { recursive: true, force: true });
console.log("ALL USAGE-STATS AGGREGATION CHECKS PASSED");
