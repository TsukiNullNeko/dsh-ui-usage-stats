window.__ModuleLoader__.load({
	id: "dsh-ui-usage-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const { useState, useEffect, useMemo, useCallback, useRef } = react;
		const h = (type, props, ...children) => react.createElement(type, props, ...children.flat());
		const cx = (...names) => names.filter(Boolean).join(" ");

		//#region locales (labels mirror ZCode settings.usage.*)
		const NS = "usage-stats";
		const zh = {
			"lifetimeTotalTokens": "Token 消耗总量",
			"lifetimePeakTokens": "峰值日",
			"longestSession": "最长聊天时长",
			"currentStreak": "当前连续天数",
			"longestStreak": "最长连续天数",
			"activeDays": "活跃天数",
			"messages": "消息数量",
			"turns": "轮次",
			"toolCalls": "工具调用",
			"totalUsageDuration": "累计使用时长",
			"cacheHitRate": "缓存命中率",
			"peakHour": "峰值时段",
			"sessions": "会话数量",
			"heatmapTitle": "Token 活动",
			"heatmapDaily": "每日",
			"heatmapWeekly": "每周",
			"heatmapCumulative": "累计",
			"heatmapIntensity": "峰值强度",
			"heatmapLess": "较少",
			"heatmapMore": "较多",
			"rangeTitle": "时间范围",
			"range7": "近 7 日",
			"range30": "近 30 日",
			"range90": "近 90 日",
			"dailyChartTitle": "每日 Token 趋势图",
			"dailyChartDescription": "按天展示 Token 用量变化，共 {days} 天。",
			"modelChartTitle": "模型用量",
			"modelOther": "其他模型",
			"unknownModel": "未知模型",
			"tokenUnit": "tokens",
			"input": "输入",
			"cachedInput": "缓存",
			"uncachedInput": "未缓存",
			"output": "输出",
			"refresh": "刷新",
			"lastRefresh": "最近刷新时间：{time}",
			"emptyTitle": "还没有可展示的数据",
			"emptyDescription": "当前区间暂无可展示的用量数据。",
			"loadingTitle": "正在统计",
			"loadingDescription": "正在扫描会话日志并聚合用量数据…",
			"durationDay": "天",
			"durationHour": "小时",
			"durationMinute": "分钟",
			"daySun": "周日",
			"dayMon": "周一",
			"dayTue": "周二",
			"dayWed": "周三",
			"dayThu": "周四",
			"dayFri": "周五",
			"daySat": "周六",
			"panel": "使用统计",
			"filterSessions": "会话",
			"filterSessionsAll": "全部会话",
			"filterSessionsSelected": "已选 {count} 个会话",
			"filterWorkspaces": "工作区",
			"filterWorkspacesAll": "全部工作区",
			"filterWorkspacesSelected": "已选 {count} 个工作区",
			"filterClear": "清空选择",
			"filterSearch": "搜索会话…",
			"filterNone": "没有匹配项",
		};
		const en = {
			"lifetimeTotalTokens": "Token usage",
			"lifetimePeakTokens": "Peak day",
			"longestSession": "Longest session",
			"currentStreak": "Current streak",
			"longestStreak": "Longest streak",
			"activeDays": "Active days",
			"messages": "Messages",
			"turns": "Turns",
			"toolCalls": "Tool calls",
			"totalUsageDuration": "Total usage duration",
			"cacheHitRate": "Cache hit rate",
			"peakHour": "Peak hour",
			"sessions": "Sessions",
			"heatmapTitle": "Token activity",
			"heatmapDaily": "Daily",
			"heatmapWeekly": "Weekly",
			"heatmapCumulative": "Cumulative",
			"heatmapIntensity": "Peak intensity",
			"heatmapLess": "Less",
			"heatmapMore": "More",
			"rangeTitle": "Time range",
			"range7": "Last 7 days",
			"range30": "Last 30 days",
			"range90": "Last 90 days",
			"dailyChartTitle": "Daily token trend",
			"dailyChartDescription": "Token usage by day over {days} days.",
			"modelChartTitle": "Model usage",
			"modelOther": "Other models",
			"unknownModel": "Unknown model",
			"tokenUnit": "tokens",
			"input": "Input",
			"cachedInput": "Cached",
			"uncachedInput": "Uncached",
			"output": "Output",
			"refresh": "Refresh",
			"lastRefresh": "Last refresh: {time}",
			"emptyTitle": "No data yet",
			"emptyDescription": "No usage in this range.",
			"loadingTitle": "Collecting",
			"loadingDescription": "Scanning session logs…",
			"durationDay": "d",
			"durationHour": "h",
			"durationMinute": "m",
			"daySun": "Sun", "dayMon": "Mon", "dayTue": "Tue", "dayWed": "Wed", "dayThu": "Thu", "dayFri": "Fri", "daySat": "Sat",
			"panel": "Usage",
			"filterSessions": "Sessions",
			"filterSessionsAll": "All conversations",
			"filterSessionsSelected": "{count} conversations",
			"filterWorkspaces": "Workspaces",
			"filterWorkspacesAll": "All workspaces",
			"filterWorkspacesSelected": "{count} workspaces",
			"filterClear": "Clear",
			"filterSearch": "Search…",
			"filterNone": "No match",
		};
		//#endregion

		//#region rpc
		let rpcCounter = 0;
		async function rpcCall(endpoint, payload) {
			const response = await fetch("usage-stats/" + endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "client-request", rpcId: "us-" + (rpcCounter += 1), method: endpoint, payload: payload ?? {} }),
			});
			const body = await response.json().catch(() => null);
			const result = body?.result;
			if (result?.ok === true) return result.value;
			throw new Error(result?.error?.message ?? "rpc " + endpoint + " failed (" + String(response.status) + ")");
		}
		//#endregion

		//#region palette + formatters (ZCode usage chart palette, dark set)
		const PALETTE = ["#4099ff", "#46bf72", "#9e77ed", "#ff5c5c", "#ff8a30", "#42c8c8"];
		const MODEL_SLICES = 6;
		function fmtTokens(value) {
			const n = Number(value) || 0;
			if (n >= 1e8) return (n / 1e8).toFixed(2) + " 亿";
			if (n >= 1e4) return (n / 1e4).toFixed(1) + " 万";
			return String(n);
		}
		function fmtDuration(ms, t) {
			const minutes = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
			const days = Math.floor(minutes / 1440);
			const hours = Math.floor((minutes % 1440) / 60);
			const rest = minutes % 60;
			const parts = [];
			if (days > 0) parts.push(days + " " + t("durationDay"));
			if (hours > 0) parts.push(hours + " " + t("durationHour"));
			if (rest > 0 || parts.length === 0) parts.push(rest + " " + t("durationMinute"));
			return parts.join(" ");
		}
		function fmtDays(value, t) { return (Number(value) || 0) + " " + t("durationDay"); }
		function fmtShare(value) { const n = Number(value) || 0; return (n * 100).toFixed(n >= 0.1 ? 0 : 1) + "%"; }
		function fmtDateTime(time) {
			try { return new Date(time).toLocaleString("zh-CN", { hour12: false }); } catch { return "--"; }
		}
		//#endregion

		//#region heatmap math (ported 1:1 from the ZCode page)
		const HEATMAP_DAYS = 7;
		function levelFor(value, max) {
			if (!(value > 0) || !(max > 0)) return 0;
			return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
		}
		function fillFor(value, max) {
			if (!(value > 0) || !(max > 0)) return 0;
			return Math.min(HEATMAP_DAYS, Math.max(1, Math.ceil((value / max) * HEATMAP_DAYS)));
		}
		function columnTotal(week) { return week.days.reduce((total, day) => total + (day?.totalTokens ?? 0), 0); }
		function columnTurnTotal(week) { return week.days.reduce((total, day) => total + (day?.turnCount ?? 0), 0); }
		function columnToolTotal(week) { return week.days.reduce((total, day) => total + (day?.toolCallCount ?? 0), 0); }
		function columnLastDate(week) { return week.days[HEATMAP_DAYS - 1]?.date ?? ""; }
		function monthOfDate(date) { return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : ""; }
		function monthLabel(date) {
			if (typeof date !== "string" || date.length < 7) return "";
			return Number(date.slice(5, 7)) + " 月";
		}
		/** Column cells for one heatmap mode; weekly/cumulative share a level per column and fill from the right. */
		function heatmapColumns(weeks, mode) {
			if (mode === "daily") {
				let max = 0;
				for (const week of weeks) for (const day of week.days) max = Math.max(max, day?.totalTokens ?? 0);
				return weeks.map((week) => ({
					key: "daily-" + week.weekIndex,
					monthDate: week.days[0]?.date ?? "",
					cells: week.days.map((day) => ({
						key: "daily-" + (day?.date ?? week.weekIndex),
						level: levelFor(day?.totalTokens ?? 0, max),
						hasUsage: (day?.totalTokens ?? 0) > 0,
						tooltip: (day?.date ?? "") + "\n" + fmtTokens(day?.totalTokens ?? 0) + " tokens · " + (day?.turnCount ?? 0) + " 轮消息",
					})),
				}));
			}
			const cumulative = mode === "cumulative";
			const totals = [];
			let running = 0;
			for (const week of weeks) {
				const total = columnTotal(week);
				running += total;
				totals.push(cumulative ? running : total);
			}
			let max = 0;
			for (const value of totals) max = Math.max(max, value);
			return weeks.map((week, index) => {
				const value = totals[index] ?? 0;
				const level = levelFor(value, max);
				const fill = fillFor(value, max);
				const lastDate = columnLastDate(week);
				const turns = columnTurnTotal(week);
				const tools = columnToolTotal(week);
				const prefix = cumulative ? "截至 " + lastDate + " 当周累计" : lastDate + " 当周";
				return {
					key: mode + "-" + week.weekIndex,
					monthDate: week.days[0]?.date ?? lastDate,
					cells: week.days.map((day, row) => ({
						key: mode + "-" + (day?.date ?? week.weekIndex + "-" + row),
						level: row >= HEATMAP_DAYS - fill ? level : 0,
						hasUsage: row >= HEATMAP_DAYS - fill && value > 0,
						tooltip: prefix + "\n" + fmtTokens(value) + " tokens · " + turns + " 轮消息",
					})),
				};
			});
		}
		/** Month labels spanning grid columns (ZCode merges consecutive weeks of one month). */
		function heatmapMonths(columns) {
			const labels = [];
			for (const column of columns) {
				const month = monthOfDate(column.monthDate);
				const last = labels[labels.length - 1];
				if (last !== undefined && last.key === month) { last.span += 1; continue; }
				labels.push({ key: month, label: monthLabel(column.monthDate), span: 1 });
			}
			const drop = Math.max(0, labels.length - 11);
			for (let index = 0; index < drop; index += 1) if (labels[index]) labels[index].label = "";
			return labels;
		}
		//#endregion

		//#region css
		const css =
			".us_page{display:flex;flex-direction:column;gap:20px;font:13px/1.5 var(--ds-font-family,system-ui)}" +
			".us_card{background:var(--dsw-alias-bg-l1);border-radius:14px;padding:16px}" +
			".us_cardTight{background:var(--dsw-alias-bg-l1);border-radius:14px;padding:12px}" +
			".us_cardStack{display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-l1);border-radius:14px;padding:16px}" +
			".us_title{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".us_headRow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}" +
			".us_summary{display:flex;flex-direction:row;align-items:center;overflow:hidden;background:var(--dsw-alias-bg-l1);border-radius:14px}" +
			".us_summaryItem{flex:1;min-width:0;padding:12px 16px;text-align:center}" +
			".us_summaryValue{font-size:15px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}" +
			".us_summaryLabel{margin-top:4px;font-size:13px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".us_divider{width:1px;height:28px;background:var(--dsw-alias-border-l1);flex:none}" +
			".us_tabs{display:inline-flex;align-items:center;height:28px;border-radius:999px;background:var(--dsw-alias-fill-l1);padding:2px;gap:2px;flex:none}" +
			".us_tab{height:24px;border:0;border-radius:999px;padding:0 10px;font-size:12px;font-weight:500;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;white-space:nowrap}" +
			".us_tab[data-active='1']{background:var(--dsw-alias-bg-l1);color:var(--dsw-alias-label-primary)}" +
			".us_hmGrid{display:grid;gap:0 2px;width:100%}" +
			".us_hmCol{display:grid;grid-template-rows:repeat(7,1fr);gap:2px}" +
			".us_cell{width:100%;aspect-ratio:1/1;border-radius:3px;background:var(--dsw-alias-fill-l1)}" +
			".us_cell[data-level='1']{background:#203f4d}" +
			".us_cell[data-level='2']{background:#255d76}" +
			".us_cell[data-level='3']{background:#2c7ea3}" +
			".us_cell[data-level='4']{background:#3199c7}" +
			".us_hmMonths{display:grid;gap:0 2px;width:100%;margin-top:12px}" +
			".us_hmMonth{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
			".us_legend{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:12px;flex-wrap:wrap}" +
			".us_legendCell{width:11px;height:11px;border-radius:3px;flex:none}" +
			".us_rangeRow{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}" +
			".us_statGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}" +
			".us_statCard{background:var(--dsw-alias-bg-l1);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}" +
			".us_statLabel{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".us_statValue{font-size:15px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".us_donutWrap{position:relative;margin:0 auto;height:224px;width:100%;max-width:256px}" +
			".us_donutCenter{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 32px;pointer-events:none}" +
			".us_donutTotal{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden;text-overflow:ellipsis}" +
			".us_donutUnit{font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
			".us_pieGrid{display:grid;gap:16px;padding:12px}" +
			".us_modelList{min-width:0;align-self:center;display:flex;flex-direction:column}" +
			".us_modelRow{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:2px 8px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}" +
			".us_modelRow:last-child{border-bottom:0}" +
			".us_chip{width:10px;height:10px;border-radius:2px;flex:none}" +
			".us_mono{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-variant-numeric:tabular-nums}" +
			".us_modelName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-primary)}" +
			".us_modelShare{font-size:12px;color:var(--dsw-alias-label-tertiary);text-align:right}" +
			".us_modelTokens{grid-column-start:2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
			".us_refreshRow{display:flex;align-items:center;justify-content:flex-end;gap:10px}" +
			".us_btn{height:32px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l1);color:var(--dsw-alias-label-secondary);padding:0 12px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}" +
			".us_btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}" +
			".us_btn:disabled{cursor:default;opacity:.6}" +
			".us_meta{font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
			".us_empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:40px 16px;text-align:center}" +
			".us_emptyTitle{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}" +
			".us_emptyDesc{margin-top:8px;font-size:13px;color:var(--dsw-alias-label-tertiary)}" +
			".us_pickerRoot{position:relative;flex:none}" +
			".us_pickerMenu{position:absolute;right:0;top:calc(100% + 6px);z-index:40;width:300px;max-height:340px;overflow:auto;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-l1));border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.35);padding:8px}" +
			".us_pickerSearch{width:100%;box-sizing:border-box;background:var(--dsw-alias-fill-l1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);padding:5px 8px;font-size:12px;margin-bottom:6px}" +
			".us_pickerItem{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-secondary);text-align:left;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:12px}" +
			".us_pickerItem:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
			".us_pickerTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".us_pickerMeta{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}" +
			"@media (min-width:768px){.us_pieGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.us_donutWrap{height:256px;max-width:288px}}" +
			"@media (max-width:900px){.us_statGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}";
		const cssTagId = "dsh-ui-usage-stats/styles.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ui-usage-stats";
			tag.dataset.pluginCss = cssTagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region shared bits
		function Tabs({ items, value, onChange }) {
			return h("div", { className: cx("us_tabs"), role: "tablist" }, items.map((item) =>
				h("button", {
					key: item.value,
					className: cx("us_tab"),
					type: "button",
					"data-active": item.value === value ? "1" : "0",
					onClick: () => onChange(item.value),
				}, item.label)));
		}

		function EmptyState({ title, description }) {
			return h("div", { className: cx("us_empty") },
				h("div", { className: cx("us_emptyTitle") }, title),
				h("div", { className: cx("us_emptyDesc") }, description));
		}

		/** Summary row: value over label, five stats split by hairline dividers (ZCode layout). */
		function SummaryRow({ snapshot, t }) {
			const summary = snapshot?.summary;
			const stats = [
				{ label: t("lifetimeTotalTokens"), value: summary ? fmtTokens(summary.totalTokens) : "--" },
				{ label: t("lifetimePeakTokens"), value: summary ? fmtTokens(summary.peakDayTokens) : "--" },
				{ label: t("longestSession"), value: summary ? fmtDuration(summary.longestSessionMs, t) : "--" },
				{ label: t("currentStreak"), value: summary ? fmtDays(summary.currentStreakDays, t) : "--" },
				{ label: t("longestStreak"), value: summary ? fmtDays(summary.longestStreakDays, t) : "--" },
			];
			return h("section", { className: cx("us_summary") }, stats.map((stat, index) =>
				h(react.Fragment, { key: stat.label },
					index > 0 ? h("div", { className: cx("us_divider"), "aria-hidden": "true" }) : null,
					h("div", { className: cx("us_summaryItem") },
						h("div", { className: cx("us_summaryValue") }, stat.value),
						h("div", { className: cx("us_summaryLabel") }, stat.label)))));
		}

		/** Secondary stat cards (ZCode keeps these numbers in the same summary strip family). */
		function StatCards({ snapshot, t }) {
			const summary = snapshot?.summary;
			const cards = [
				{ label: t("activeDays"), value: summary ? String(summary.activeDays) : "--" },
				{ label: t("sessions"), value: summary ? String(summary.sessions) : "--" },
				{ label: t("turns"), value: summary ? String(summary.turns) : "--" },
				{ label: t("messages"), value: summary ? String(summary.messages) : "--" },
				{ label: t("toolCalls"), value: summary ? String(summary.toolCalls) : "--" },
				{ label: t("totalUsageDuration"), value: summary ? fmtDuration(summary.totalUsageDurationMs, t) : "--" },
				{ label: t("cacheHitRate"), value: summary ? fmtShare(summary.cacheHitRate) : "--" },
				{ label: t("peakHour"), value: summary ? String(summary.peakHourHour).padStart(2, "0") + ":00 · " + fmtTokens(summary.peakHourTokens) : "--" },
			];
			return h("div", { className: cx("us_statGrid") }, cards.map((card) =>
				h("div", { key: card.label, className: cx("us_statCard") },
					h("span", { className: cx("us_statLabel") }, card.label),
					h("span", { className: cx("us_statValue") }, card.value))));
		}

		/** Token activity heatmap: title, 每日/每周/累计 tabs, 53-week grid, month labels, intensity legend. */
		function Heatmap({ weeks, t }) {
			const [mode, setMode] = useState("daily");
			const columns = useMemo(() => heatmapColumns(weeks ?? [], mode), [weeks, mode]);
			const months = useMemo(() => heatmapMonths(columns), [columns]);
			const gridStyle = { gridTemplateColumns: "repeat(" + String(columns.length) + ", minmax(0, 1fr))" };
			const levels = [0, 1, 2, 3, 4];
			return h("div", { className: cx("us_cardTight") },
				h("div", { className: cx("us_headRow") },
					h("h3", { className: cx("us_title") }, t("heatmapTitle")),
					h(Tabs, { value: mode, onChange: setMode, items: [
						{ value: "daily", label: t("heatmapDaily") },
						{ value: "weekly", label: t("heatmapWeekly") },
						{ value: "cumulative", label: t("heatmapCumulative") },
					] })),
				h("div", { className: cx("us_hmGrid"), style: gridStyle }, columns.map((column) =>
					h("div", { key: column.key, className: cx("us_hmCol") }, column.cells.map((cell) =>
						h("div", { key: cell.key, className: cx("us_cell"), "data-level": String(cell.level), title: cell.tooltip }))))),
				h("div", { className: cx("us_hmMonths"), style: gridStyle }, months.map((month) =>
					h("div", { key: month.key, className: cx("us_hmMonth"), style: { gridColumn: "span " + month.span } }, month.label))),
				h("div", { className: cx("us_legend") },
					h("span", null, t("heatmapIntensity")),
					h("span", { style: { marginLeft: "4px" } }, t("heatmapLess")),
					levels.map((level) => h("span", { key: String(level), className: cx("us_legendCell"), "data-level": String(level), style: { background: level === 0 ? "var(--dsw-alias-fill-l1)" : ["#203f4d", "#255d76", "#2c7ea3", "#3199c7"][level - 1] } })),
					h("span", null, t("heatmapMore"))));
		}
		//#endregion

		//#region trend chart (1:1 port of AppUsageDailyModelTrendChart)
		function monotonePath(xs, ys) {
			const n = xs.length;
			if (n < 2) return "M " + xs[0] + " " + ys[0];
			const dx = [], dy = [], slope = [];
			for (let index = 0; index < n - 1; index += 1) { dx[index] = xs[index + 1] - xs[index]; dy[index] = ys[index + 1] - ys[index]; slope[index] = dy[index] / dx[index]; }
			const tangent = new Array(n);
			tangent[0] = slope[0];
			tangent[n - 1] = slope[n - 2];
			for (let index = 1; index < n - 1; index += 1) tangent[index] = slope[index - 1] * slope[index] <= 0 ? 0 : (slope[index - 1] + slope[index]) / 2;
			for (let index = 0; index < n - 1; index += 1) {
				if (slope[index] === 0) { tangent[index] = 0; tangent[index + 1] = 0; continue; }
				const a = tangent[index] / slope[index];
				const b = tangent[index + 1] / slope[index];
				const squared = a * a + b * b;
				if (squared > 9) { const tau = 3 / Math.sqrt(squared); tangent[index] = tau * a * slope[index]; tangent[index + 1] = tau * b * slope[index]; }
			}
			let path = "M " + xs[0].toFixed(2) + " " + ys[0].toFixed(2);
			for (let index = 0; index < n - 1; index += 1) {
				const h = dx[index];
				path += " C " + (xs[index] + h / 3).toFixed(2) + " " + (ys[index] + (tangent[index] * h) / 3).toFixed(2) + " " + (xs[index + 1] - h / 3).toFixed(2) + " " + (ys[index + 1] - (tangent[index + 1] * h) / 3).toFixed(2) + " " + xs[index + 1].toFixed(2) + " " + ys[index + 1].toFixed(2);
			}
			return path;
		}
		function shortModelName(modelId) { const slash = modelId.indexOf("/"); return slash >= 0 ? modelId.slice(slash + 1) : modelId; }
		function chartLabel(date) {
			const parts = String(date).split("-");
			if (parts.length < 3) return String(date);
			return Number(parts[1]) + "月" + Number(parts[2]) + "日";
		}
		const TREND_W = 1512, TREND_H = 240, TREND_TOP = 8, TREND_LEFT = 24, TREND_RIGHT = 24, TREND_AXIS = 26;

		/** Daily token trend: top-six model lines, monotone curves, horizontal dashed grid, no Y axis. */
		function TrendChart({ snapshot, t }) {
			const rows = snapshot?.dailyModelUsage ?? [];
			const models = snapshot?.models ?? [];
			const top = models.slice(0, 6).map((model, index) => ({ modelId: model.modelId, color: PALETTE[index % PALETTE.length], label: shortModelName(model.modelId || t("unknownModel")) }));
			const maxTokens = useMemo(() => {
				let max = 0;
				for (const row of rows) for (const entry of row.models ?? []) if (top.some((item) => item.modelId === entry.modelId)) max = Math.max(max, entry.totalTokens ?? 0);
				return Math.max(1, max);
			}, [rows, top.map((item) => item.modelId).join("|")]);
			const plotLeft = TREND_LEFT, plotRight = TREND_W - TREND_RIGHT, plotTop = TREND_TOP, plotBottom = TREND_H - TREND_AXIS;
			const plotWidth = plotRight - plotLeft, plotHeight = plotBottom - plotTop;
			const count = rows.length;
			const xs = rows.map((row, index) => plotLeft + (index + 0.5) * (plotWidth / Math.max(1, count)));
			const ty = (value) => plotBottom - (value / maxTokens) * plotHeight;
			const showTick = (index) => (count <= 14 ? true : index === 0 || index === count - 1 || index % (count > 45 ? 7 : 5) === 0);
			const grid = [0, 0.25, 0.5, 0.75, 1].map((fraction) => h("line", { key: "grid-" + fraction, x1: plotLeft, y1: ty(maxTokens * fraction).toFixed(1), x2: plotRight, y2: ty(maxTokens * fraction).toFixed(1), stroke: "var(--dsw-alias-border-l1)", strokeDasharray: "3 3" }));
			const lines = top.map((model) => {
				const values = rows.map((row) => {
					const entry = (row.models ?? []).find((item) => item.modelId === model.modelId);
					return ty(entry?.totalTokens ?? 0);
				});
				if (values.length === 0) return null;
				return h("path", { key: model.modelId, d: monotonePath(xs, values), fill: "none", stroke: model.color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" });
			});
			const labels = rows.map((row, index) => (showTick(index) ? h("text", { key: "x-" + row.date, x: xs[index].toFixed(1), y: plotBottom + 18, fontSize: 11, fill: "var(--dsw-alias-label-tertiary)", textAnchor: "middle", fontFamily: "var(--ds-font-family-code, monospace)" }, chartLabel(row.date)) : null));
			return h("section", { className: cx("us_cardStack") },
				h("h3", { className: cx("us_title") }, t("dailyChartTitle")),
				count === 0 ? h(EmptyState, { title: t("emptyTitle"), description: t("emptyDescription") }) : h("div", null,
					h("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", marginBottom: "12px" }, role: "list" }, top.map((model) =>
						h("div", { key: model.modelId, role: "listitem", style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } },
							h("span", { className: cx("us_chip"), style: { background: model.color } }),
							h("span", { style: { color: "var(--dsw-alias-label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, model.label)))),
					h("svg", { width: "100%", height: TREND_H, viewBox: "0 0 " + TREND_W + " " + TREND_H, preserveAspectRatio: "none" }, grid, lines, labels)));
		}
		//#endregion

		//#region model pie (1:1 port of AppUsageModelUsagePieChart)
		/** Top five models plus an 其他模型 bucket when there are more than six. */
		function modelSlices(snapshot, t) {
			const models = (snapshot?.models ?? []).filter((model) => (model.totalTokens ?? 0) > 0);
			const total = models.reduce((sum, model) => sum + model.totalTokens, 0);
			const more = models.length > MODEL_SLICES;
			const kept = more ? MODEL_SLICES - 1 : MODEL_SLICES;
			const head = models.slice(0, kept).map((model, index) => ({
				key: "model" + index,
				label: (model.modelId || "").trim() || t("unknownModel"),
				color: PALETTE[index % PALETTE.length],
				totalTokens: model.totalTokens,
				share: total > 0 ? model.totalTokens / total : 0,
			}));
			const rest = models.slice(kept).reduce((sum, model) => sum + model.totalTokens, 0);
			const tail = rest > 0 ? [{ key: "model" + kept, label: t("modelOther"), color: PALETTE[kept % PALETTE.length], totalTokens: rest, share: total > 0 ? rest / total : 0 }] : [];
			return { slices: head.concat(tail), total };
		}
		/** Donut arc between two angles (ZCode draws two arcs per slice from a recharts Pie). */
		function arcPath(cx0, cy0, radiusOuter, radiusInner, startAngle, endAngle) {
			const large = endAngle - startAngle > Math.PI ? 1 : 0;
			const x1 = cx0 + radiusOuter * Math.cos(startAngle), y1 = cy0 + radiusOuter * Math.sin(startAngle);
			const x2 = cx0 + radiusOuter * Math.cos(endAngle), y2 = cy0 + radiusOuter * Math.sin(endAngle);
			const x3 = cx0 + radiusInner * Math.cos(endAngle), y3 = cy0 + radiusInner * Math.sin(endAngle);
			const x4 = cx0 + radiusInner * Math.cos(startAngle), y4 = cy0 + radiusInner * Math.sin(startAngle);
			return "M " + x1.toFixed(2) + " " + y1.toFixed(2) + " A " + radiusOuter + " " + radiusOuter + " 0 " + large + " 1 " + x2.toFixed(2) + " " + y2.toFixed(2) + " L " + x3.toFixed(2) + " " + y3.toFixed(2) + " A " + radiusInner + " " + radiusInner + " 0 " + large + " 0 " + x4.toFixed(2) + " " + y4.toFixed(2) + " Z";
		}
		function ModelPie({ snapshot, t }) {
			const prepared = useMemo(() => modelSlices(snapshot, t), [snapshot, t]);
			const slices = prepared.slices;
			const total = prepared.total;
			const size = 256;
			const center = size / 2;
			const outer = center * 0.86;
			const inner = center * 0.56;
			const padding = slices.length > 1 ? 0.02 : 0;
			let angle = -Math.PI / 2;
			const arcs = slices.map((slice) => {
				const sweep = slice.share * Math.PI * 2;
				const end = angle + Math.max(sweep - padding, 0.004);
				const path = h("path", {
					key: slice.key,
					d: arcPath(center, center, outer, inner, angle, end),
					fill: slice.color,
					stroke: "var(--dsw-alias-bg-l1)",
					strokeWidth: 2,
				}, h("title", null, slice.label + " · " + fmtTokens(slice.totalTokens) + " (" + fmtShare(slice.share) + ")"));
				angle = end;
				return path;
			});
			const donut = h("div", { className: cx("us_donutWrap") },
				h("svg", { width: "100%", height: "100%", viewBox: "0 0 " + size + " " + size }, arcs),
				h("div", { className: cx("us_donutCenter") },
					h("div", { className: cx("us_donutTotal", "us_mono") }, fmtTokens(total)),
					h("div", { className: cx("us_donutUnit") }, t("tokenUnit"))));
			const legend = h("div", { className: cx("us_modelList"), role: "list" }, slices.map((slice) =>
				h("div", { key: slice.key, className: cx("us_modelRow"), role: "listitem" },
					h("span", { className: cx("us_chip"), style: { background: slice.color } }),
					h("span", { className: cx("us_modelName", "us_mono") }, slice.label),
					h("span", { className: cx("us_modelShare", "us_mono") }, fmtShare(slice.share)),
					h("span", { className: cx("us_modelTokens", "us_mono") }, fmtTokens(slice.totalTokens) + " " + t("tokenUnit")))));
			const body = total <= 0
				? h(EmptyState, { title: t("emptyTitle"), description: t("emptyDescription") })
				: h("div", { className: cx("us_pieGrid") }, donut, legend);
			return h("section", { className: cx("us_cardStack") },
				h("h3", { className: cx("us_title") }, t("modelChartTitle")),
				body);
		}
		//#endregion

		//#region pickers (session + workspace filters; empty selection = all)
		function useOutsideClose(rootRef, anchorRef, open, close) {
			useEffect(() => {
				if (!open) return;
				const onDoc = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (rootRef.current !== null && rootRef.current.contains(target)) return;
					if (anchorRef.current !== null && anchorRef.current.contains(target)) return;
					close();
				};
				document.addEventListener("mousedown", onDoc);
				return () => document.removeEventListener("mousedown", onDoc);
			}, [open, rootRef, anchorRef, close]);
		}

		function SessionPicker({ t, sessions, selectedIds, onApply, busy }) {
			const [open, setOpen] = useState(false);
			const [search, setSearch] = useState("");
			const [draft, setDraft] = useState(() => new Set(selectedIds ?? []));
			const rootRef = useRef(null);
			const anchorRef = useRef(null);
			useOutsideClose(rootRef, anchorRef, open, () => setOpen(false));
			useEffect(() => { setDraft(new Set(selectedIds ?? [])); }, [selectedIds]);
			const visible = useMemo(() => {
				const needle = search.trim().toLowerCase();
				const list = sessions ?? [];
				if (needle === "") return list;
				return list.filter((session) => (session.title ?? "").toLowerCase().includes(needle) || session.id.toLowerCase().includes(needle) || session.workspace.toLowerCase().includes(needle));
			}, [sessions, search]);
			const label = (selectedIds ?? []).length > 0 ? t("filterSessionsSelected", { count: String((selectedIds ?? []).length) }) : t("filterSessionsAll");
			return h("div", { className: cx("us_pickerRoot"), ref: rootRef },
				h("button", { ref: anchorRef, className: cx("us_btn"), type: "button", disabled: busy, onClick: () => setOpen(!open) },
					t("filterSessions") + ": " + label),
				open ? h("div", { className: cx("us_pickerMenu") },
					h("input", { className: cx("us_pickerSearch"), type: "search", placeholder: t("filterSearch"), value: search, onChange: (event) => setSearch(event.target.value) }),
					visible.length === 0 ? h("div", { className: cx("us_pickerItem") }, t("filterNone")) : null,
					visible.map((session) => h("button", {
						key: session.id,
						className: cx("us_pickerItem"),
						type: "button",
						onClick: () => setDraft((current) => { const next = new Set(current); if (next.has(session.id)) next.delete(session.id); else next.add(session.id); return next; }),
					},
						h("input", { type: "checkbox", checked: draft.has(session.id), readOnly: true }),
						h("span", { className: cx("us_pickerTitle") }, session.title ?? session.id.slice(0, 18)),
						h("span", { className: cx("us_pickerMeta") }, session.workspace + " · " + fmtTokens(session.tokens)))),
					h("div", { style: { display: "flex", gap: "6px", marginTop: "6px" } },
						h("button", { className: cx("us_btn"), type: "button", disabled: busy, onClick: () => { setOpen(false); onApply([...draft]); } }, t("refresh")),
						h("button", { className: cx("us_btn"), type: "button", disabled: busy || draft.size === 0, onClick: () => { setDraft(new Set()); setOpen(false); onApply([]); } }, t("filterClear")))) : null);
		}

		function WorkspacePicker({ t, workspaces, selectedWs, onApply, busy }) {
			const [open, setOpen] = useState(false);
			const [draft, setDraft] = useState(() => new Set(selectedWs ?? []));
			const rootRef = useRef(null);
			const anchorRef = useRef(null);
			useOutsideClose(rootRef, anchorRef, open, () => setOpen(false));
			useEffect(() => { setDraft(new Set(selectedWs ?? [])); }, [selectedWs]);
			const label = (selectedWs ?? []).length > 0 ? t("filterWorkspacesSelected", { count: String((selectedWs ?? []).length) }) : t("filterWorkspacesAll");
			return h("div", { className: cx("us_pickerRoot"), ref: rootRef },
				h("button", { ref: anchorRef, className: cx("us_btn"), type: "button", disabled: busy, onClick: () => setOpen(!open) },
					t("filterWorkspaces") + ": " + label),
				open ? h("div", { className: cx("us_pickerMenu") },
					workspaces.length === 0 ? h("div", { className: cx("us_pickerItem") }, t("filterNone")) : null,
					workspaces.map((workspace) => h("button", {
						key: workspace.name,
						className: cx("us_pickerItem"),
						type: "button",
						onClick: () => setDraft((current) => { const next = new Set(current); if (next.has(workspace.name)) next.delete(workspace.name); else next.add(workspace.name); return next; }),
					},
						h("input", { type: "checkbox", checked: draft.has(workspace.name), readOnly: true }),
						h("span", { className: cx("us_pickerTitle") }, workspace.name),
						h("span", { className: cx("us_pickerMeta") }, String(workspace.sessions) + " · " + fmtTokens(workspace.tokens)))),
					h("div", { style: { display: "flex", gap: "6px", marginTop: "6px" } },
						h("button", { className: cx("us_btn"), type: "button", disabled: busy, onClick: () => { setOpen(false); onApply([...draft]); } }, t("refresh")),
						h("button", { className: cx("us_btn"), type: "button", disabled: busy || draft.size === 0, onClick: () => { setDraft(new Set()); setOpen(false); onApply([]); } }, t("filterClear")))) : null);
		}
		//#endregion

		//#region page (ZCode app-usage layout: summary, heatmap, stats, range, trend, model pie, refresh)
		function UsageStatsPage({ t }) {
			const [range, setRange] = useState("7d");
			const [allSnapshot, setAllSnapshot] = useState(null);
			const [rangeSnapshot, setRangeSnapshot] = useState(null);
			const [sessions, setSessions] = useState([]);
			const [selectedIds, setSelectedIds] = useState([]);
			const [selectedWs, setSelectedWs] = useState([]);
			const [busy, setBusy] = useState(true);
			const [error, setError] = useState(null);
			const [refreshedAt, setRefreshedAt] = useState(Date.now());
			const filters = useMemo(() => ({ sessionIds: selectedIds, workspaces: selectedWs }), [selectedIds, selectedWs]);
			const load = useCallback(async () => {
				setBusy(true);
				try {
					const all = await rpcCall("all", { ...filters, range: "all" });
					const ranged = await rpcCall("filter", { ...filters, range });
					setAllSnapshot(all);
					setRangeSnapshot(ranged);
					setError(null);
					setRefreshedAt(Date.now());
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			}, [filters, range]);
			useEffect(() => { void load(); }, [load]);
			useEffect(() => {
				let active = true;
				rpcCall("sessions", {}).then((value) => { if (active) setSessions(value.sessions ?? []); }, () => {});
				return () => { active = false; };
			}, []);
			const workspaces = useMemo(() => {
				const byWorkspace = new Map();
				for (const session of sessions ?? []) {
					let entry = byWorkspace.get(session.workspace);
					if (entry === undefined) { entry = { name: session.workspace, tokens: 0, sessions: 0 }; byWorkspace.set(session.workspace, entry); }
					entry.tokens += session.tokens ?? 0;
					entry.sessions += 1;
				}
				return [...byWorkspace.values()].sort((left, right) => right.tokens - left.tokens);
			}, [sessions]);
			const weeks = allSnapshot?.heatmap?.weeks ?? [];
			return h("div", { className: cx("us_page") },
				error !== null ? h("div", { className: cx("us_statCard"), style: { borderColor: "var(--dsw-alias-state-error-primary)", borderStyle: "solid", borderWidth: "1px" } },
					h("span", { className: cx("us_statLabel") }, error)) : null,
				h(SummaryRow, { snapshot: allSnapshot, t }),
				weeks.length > 0 ? h(Heatmap, { weeks, t }) : null,
				allSnapshot !== null ? h(StatCards, { snapshot: allSnapshot, t }) : null,
				h("div", { className: cx("us_rangeRow") },
					h("div", { className: cx("us_title") }, t("rangeTitle")),
					h("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" } },
						h(Tabs, { value: range, onChange: setRange, items: [
							{ value: "7d", label: t("range7") },
							{ value: "30d", label: t("range30") },
							{ value: "90d", label: t("range90") },
						] }),
						h(SessionPicker, { t, sessions, selectedIds, onApply: setSelectedIds, busy }),
						h(WorkspacePicker, { t, workspaces, selectedWs, onApply: setSelectedWs, busy }))),
				busy && allSnapshot === null ? h(EmptyState, { title: t("loadingTitle"), description: t("loadingDescription") }) : null,
				allSnapshot === null && !busy ? h(EmptyState, { title: t("emptyTitle"), description: t("emptyDescription") }) : null,
				allSnapshot !== null ? h(TrendChart, { snapshot: rangeSnapshot, t }) : null,
				allSnapshot !== null ? h(ModelPie, { snapshot: rangeSnapshot, t }) : null,
				h("div", { className: cx("us_refreshRow") },
					h("span", { className: cx("us_meta") }, t("lastRefresh", { time: fmtDateTime(refreshedAt) })),
					h("button", { className: cx("us_btn"), type: "button", disabled: busy, onClick: () => { void load(); } }, t("refresh"))));
		}
		//#endregion

		//#region registration
		const inject = ["slots", "locale"];
		function PanelIcon({ size, active }) {
			const side = size ?? 20;
			const fill = active ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-tertiary)";
			return h("svg", { width: side, height: side, viewBox: "0 0 20 20", "aria-hidden": "true" },
				h("rect", { x: 3, y: 10, width: 3, height: 7, rx: 1, fill }),
				h("rect", { x: 8.5, y: 6, width: 3, height: 11, rx: 1, fill }),
				h("rect", { x: 14, y: 3, width: 3, height: 14, rx: 1, fill }));
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "usage-stats: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "usage-stats", locale: NS }, UsageStatsPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: "usage-stats",
				order: 11,
				locale: NS,
				label: () => t("panel"),
			}, PanelIcon));
		}
		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = { UsageStatsPage, Heatmap, TrendChart, ModelPie, SummaryRow, heatmapColumns };
		return module.exports;
	},
});
