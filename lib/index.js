/**
 * dsh-ui-usage-stats host entry.
 *
 * Aggregates every durable session log under $DSH_HOME/sessions into the same
 * snapshot shape ZCode's app-usage page consumes (summary / heatmap.weeks /
 * models / dailyModelUsage), so the browser view is a 1:1 port of that page.
 */
import { readdirSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/** Cordis plugin identity. */
export const name = "usage-stats";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Columns in the heatmap grid (ZCode uses 53 week columns). */
const HEATMAP_WEEKS = 53;

/** Decode one workspace directory name ("--data-qq-bot--" to "data/qq-bot"). */
function decodeWorkspace(name) {
  const decoded = name.replace(/^-+/, "").replace(/-+$/, "").split("--").filter((part) => part !== "").join("/");
  return decoded === "" ? "/" : decoded;
}

/** Local YYYY-MM-DD for one epoch-ms timestamp. */
function localDate(time) {
  const date = new Date(time);
  const pad = (value) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function emptyFileResult() {
  return { sessionId: undefined, title: undefined, workspace: "/", records: [], dayCounters: new Map(), turns: 0, toolCalls: 0, messages: 0, firstTime: undefined, lastTime: undefined };
}

/** Bump one counter inside a per-day counter map. */
function bumpCounters(map, date, key) {
  let counters = map.get(date);
  if (counters === undefined) { counters = { turns: 0, toolCalls: 0, messages: 0 }; map.set(date, counters); }
  counters[key] += 1;
}

/** Decompress one zstd session log; fold usage, counters, session id, and title. */
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
    const isUsage = line.indexOf('"type":"assistant/message"') !== -1;
    const isTool = line.indexOf('"type":"tool/call"') !== -1;
    const isTurn = line.indexOf('"type":"turn/start"') !== -1;
    const isHeader = result.sessionId === undefined && line.indexOf('"type":"session"') !== -1;
    const isTitle = line.indexOf('"session/title"') !== -1;
    if (!isUsage && !isTool && !isTurn && !isHeader && !isTitle) continue;
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
    const time = typeof event.time === "number" ? event.time : undefined;
    if (time !== undefined) {
      if (result.firstTime === undefined || time < result.firstTime) result.firstTime = time;
      if (result.lastTime === undefined || time > result.lastTime) result.lastTime = time;
    }
    if (isTurn) { result.turns += 1; if (time !== undefined) bumpCounters(result.dayCounters, localDate(time), "turns"); continue; }
    if (isTool) { result.toolCalls += 1; if (time !== undefined) bumpCounters(result.dayCounters, localDate(time), "toolCalls"); continue; }
    if (!isUsage) continue;
    const usage = event.data?.usage;
    if (usage === null || typeof usage !== "object") continue;
    const uncachedInput = usage.inputTokens ?? 0;
    const cachedInput = usage.cacheReadTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    const tokens = uncachedInput + output + (usage.reasoningTokens ?? 0) + cachedInput + (usage.cacheWriteTokens ?? 0);
    result.messages += 1;
    if (time !== undefined) bumpCounters(result.dayCounters, localDate(time), "messages");
    if (!(tokens > 0)) continue;
    const source = event.data?.message?.source;
    result.records.push({
      time,
      provider: typeof source?.provider === "string" ? source.provider : "?",
      model: typeof source?.model === "string" ? source.model : "?",
      tokens, uncachedInput, cachedInput, output,
    });
  }
  return result;
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
          const info = statSync(file);
          files.push({ file, mtimeMs: info.mtimeMs, size: info.size, workspaceName: workspace.name });
        } catch {}
      }
    }
  }
  return files;
}

/** Ensure one accumulator entry for a day. */
function ensureDay(acc, date) {
  let day = acc.daily.get(date);
  if (day === undefined) {
    day = { totalTokens: 0, turns: 0, toolCalls: 0, messages: 0, cachedInput: 0, uncachedInput: 0, output: 0, byModel: new Map() };
    acc.daily.set(date, day);
  }
  return day;
}

/** Merge one file result into the mutable accumulators. */
function foldFileResult(result, acc) {
  for (const record of result.records) {
    const date = localDate(record.time);
    const day = ensureDay(acc, date);
    day.totalTokens += record.tokens;
    day.cachedInput += record.cachedInput;
    day.uncachedInput += record.uncachedInput;
    day.output += record.output;
    const modelKey = record.provider + "/" + record.model;
    day.byModel.set(modelKey, (day.byModel.get(modelKey) ?? 0) + record.tokens);
    let model = acc.modelTotals.get(modelKey);
    if (model === undefined) { model = { modelId: modelKey, totalTokens: 0, cachedInputTokens: 0, uncachedInputTokens: 0, outputTokens: 0 }; acc.modelTotals.set(modelKey, model); }
    model.totalTokens += record.tokens;
    model.cachedInputTokens += record.cachedInput;
    model.uncachedInputTokens += record.uncachedInput;
    model.outputTokens += record.output;
    const hour = new Date(record.time).getHours();
    acc.hours.set(hour, (acc.hours.get(hour) ?? 0) + record.tokens);
    acc.totalTokens += record.tokens;
    acc.cachedInputTokens += record.cachedInput;
    acc.uncachedInputTokens += record.uncachedInput;
    acc.outputTokens += record.output;
    if (day.totalTokens > acc.peakDayTokens) { acc.peakDayTokens = day.totalTokens; acc.peakDayDate = date; }
  }
  for (const [date, counters] of result.dayCounters) {
    const day = ensureDay(acc, date);
    day.turns += counters.turns;
    day.toolCalls += counters.toolCalls;
    day.messages += counters.messages;
  }
  const span = result.lastTime !== undefined && result.firstTime !== undefined ? result.lastTime - result.firstTime : 0;
  if (span > acc.longestChatMs) acc.longestChatMs = span;
  acc.totalDurationMs += span;
  acc.turns += result.turns;
  acc.toolCalls += result.toolCalls;
  acc.messages += result.messages;
  if (result.sessionId !== undefined) { acc.sessions.add(result.sessionId); }
}

/** Streak computation over the set of active local dates. */
function computeStreaks(dates) {
  if (dates.size === 0) return { current: 0, longest: 0 };
  const sorted = [...dates].sort();
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(sorted[index - 1] + "T00:00:00");
    const current = new Date(sorted[index] + "T00:00:00");
    if (Math.round((current - previous) / DAY_MS) === 1) { run += 1; if (run > longest) longest = run; }
    else run = 1;
  }
  const today = localDate(Date.now());
  const yesterday = localDate(Date.now() - DAY_MS);
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

/** Build the 53x7 heatmap grid ZCode renders (columns = weeks, rows = Sun..Sat). */
function buildWeeks(dailyTotals) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastSunday = new Date(today.getTime() - today.getDay() * DAY_MS);
  const firstSunday = new Date(lastSunday.getTime() - (HEATMAP_WEEKS - 1) * 7 * DAY_MS);
  const weeks = [];
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const days = [];
    for (let row = 0; row < 7; row += 1) {
      const key = localDate(firstSunday.getTime() + (week * 7 + row) * DAY_MS);
      const totals = dailyTotals.get(key);
      days.push({
        date: key,
        totalTokens: totals === undefined ? 0 : totals.totalTokens,
        turnCount: totals === undefined ? 0 : totals.turns,
        toolCallCount: totals === undefined ? 0 : totals.toolCalls,
      });
    }
    weeks.push({ weekIndex: week, days });
  }
  return weeks;
}

/** How many days a range covers (0 = everything). */
function rangeDays(range) {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  return 0;
}

/** Finalize accumulators into the ZCode snapshot shape. */
function finishAggregate(acc, range) {
  const days = rangeDays(range);
  const cutoff = days > 0 ? localDate(Date.now() - (days - 1) * DAY_MS) : null;
  const inRange = (date) => cutoff === null || date >= cutoff;
  const daily = [...acc.daily.entries()]
    .filter(([date]) => inRange(date))
    .map(([date, day]) => ({
      date,
      totalTokens: day.totalTokens,
      turns: day.turns,
      toolCalls: day.toolCalls,
      messages: day.messages,
      cachedInputTokens: day.cachedInput,
      uncachedInputTokens: day.uncachedInput,
      outputTokens: day.output,
      models: [...day.byModel.entries()].map(([modelId, totalTokens]) => ({ modelId, totalTokens })).sort((left, right) => right.totalTokens - left.totalTokens),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const streaks = computeStreaks(new Set([...acc.daily.entries()].filter(([, day]) => day.totalTokens > 0).map(([date]) => date)));
  const models = [...acc.modelTotals.values()].sort((left, right) => right.totalTokens - left.totalTokens);
  let peakHourHour = 0;
  let peakHourTokens = 0;
  for (const [hour, tokens] of acc.hours) if (tokens > peakHourTokens) { peakHourTokens = tokens; peakHourHour = hour; }
  const inputTotal = acc.cachedInputTokens + acc.uncachedInputTokens;
  return {
    range: range ?? "all",
    generatedAt: Date.now(),
    summary: {
      totalTokens: acc.totalTokens,
      peakDayTokens: acc.peakDayTokens,
      peakDayDate: acc.peakDayDate ?? null,
      longestSessionMs: acc.longestChatMs,
      totalUsageDurationMs: acc.totalDurationMs,
      currentStreakDays: streaks.current,
      longestStreakDays: streaks.longest,
      activeDays: [...acc.daily.values()].filter((day) => day.totalTokens > 0).length,
      sessions: acc.sessions.size,
      messages: acc.messages,
      turns: acc.turns,
      toolCalls: acc.toolCalls,
      cachedInputTokens: acc.cachedInputTokens,
      uncachedInputTokens: acc.uncachedInputTokens,
      outputTokens: acc.outputTokens,
      cacheHitRate: inputTotal > 0 ? acc.cachedInputTokens / inputTotal : 0,
      peakHourHour,
      peakHourTokens,
    },
    heatmap: { weeks: buildWeeks(acc.daily) },
    models,
    dailyModelUsage: daily.map((day) => ({ date: day.date, models: day.models })),
    daily,
    filtered: acc.filtered,
    sessionCount: acc.sessionCount,
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
        try {
          const result = await aggregateSessionFile(entry.file, entry.workspaceName);
          cache.set(entry.file, {
            mtimeMs: entry.mtimeMs,
            size: entry.size,
            sessionId: result.sessionId,
            title: result.title,
            workspace: result.workspace,
            records: result.records,
            dayCounters: result.dayCounters,
            turns: result.turns,
            toolCalls: result.toolCalls,
            messages: result.messages,
            firstTime: result.firstTime,
            lastTime: result.lastTime,
          });
        } catch {}
      }
    });
    await Promise.all(workers);
  }

  /** Per-session summaries for the pickers (sorted by recency). */
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
      if ((entry.lastTime ?? 0) > existing.lastTime) { existing.lastTime = entry.lastTime ?? 0; if (entry.title !== undefined) existing.title = entry.title; }
      if (existing.workspace === "/" && entry.workspace !== "/") existing.workspace = entry.workspace;
    }
    return [...bySession.values()].sort((left, right) => right.lastTime - left.lastTime);
  }

  /** Aggregate with optional session-id / workspace filters (empty = all). */
  async function aggregate(options) {
    await ensureAll();
    const sessionIds = options?.sessionIds;
    const workspaces = options?.workspaces;
    const sessionFilter = Array.isArray(sessionIds) && sessionIds.length > 0 ? new Set(sessionIds) : null;
    const workspaceFilter = Array.isArray(workspaces) && workspaces.length > 0 ? new Set(workspaces) : null;
    const acc = {
      totalTokens: 0, cachedInputTokens: 0, uncachedInputTokens: 0, outputTokens: 0,
      peakDayTokens: 0, peakDayDate: undefined, longestChatMs: 0, totalDurationMs: 0,
      turns: 0, toolCalls: 0, messages: 0, daily: new Map(), modelTotals: new Map(), hours: new Map(), sessions: new Set(),
      filtered: sessionFilter !== null || workspaceFilter !== null, sessionCount: 0,
    };
    const matchedSessions = new Set();
    for (const entry of cache.values()) {
      if (sessionFilter !== null && !sessionFilter.has(entry.sessionId)) continue;
      if (workspaceFilter !== null && !workspaceFilter.has(entry.workspace)) continue;
      matchedSessions.add(entry.sessionId);
      foldFileResult(entry, acc);
    }
    acc.sessionCount = matchedSessions.size;
    return finishAggregate(acc, options?.range);
  }

  return { aggregate, sessionSummaries: async () => { await ensureAll(); return sessionSummaries(); } };
}

/** Read a request body with a hard size cap. */
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

/** Bridge one admitted request to the usage RPC envelope. */
function makeRpcRouteHandler(connection, handle) {
  return async (req, res) => {
    const write = (status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
    try {
      const admission = connection.admit(req);
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

/** Install the aggregator, the browser RPC channel, and a prompt section. */
export function apply(ctx) {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  const { aggregate, sessionSummaries } = createAggregator(join(home, "sessions"));

  const handleRpc = async (endpoint, payload) => {
    try {
      switch (endpoint) {
        case "all":
        case "filter":
          return { ok: true, value: await aggregate(payload ?? {}) };
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
    rpcCtx.webServer.register({ kind: "prefix", path: "/usage-stats", handler: makeRpcRouteHandler(rpcCtx.connection, handleRpc) });
  });

  ctx.inject(["systemPrompt"], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: "usage-stats",
      order: 9350,
      text: () => [
        "## 使用统计插件（dsh-ui-usage-stats）",
        "- 侧边栏「使用统计」页面按 ZCode 应用用量页 1:1 移植：汇总条（Token 消耗总量/峰值日/最长聊天时长/当前与最长连续）、Token 活动热力图（每日/每周/累计，峰值强度图例）、时间范围（近 7/30/90 日）、每日 Token 趋势图（按模型折线）、模型用量环形图（前 5 + 其他模型，含输入/缓存/输出拆分）。",
        "- 数据来自 $DSH_HOME/sessions 的会话日志（assistant/message 用量 + turn/tool 计数），刷新按钮重算；支持按会话/工作区筛选（不选=全部）。",
      ].join("\n"),
    });
  });

  ctx.logger?.info?.("usage-stats: aggregating %s", join(home, "sessions"));
}
