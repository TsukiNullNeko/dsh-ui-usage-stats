window.__ModuleLoader__.load({
	id: "dsh-ui-usage-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const { useState, useEffect, useMemo, useCallback } = react;
		const h = (type, props, ...children) => react.createElement(type, props, ...children.flat());
		const cx = (...names) => names.filter(Boolean).join(" ");

		//#region locales
		const NS = "usage-stats";
		const zh = {
			"panel": "使用统计",
			"panel.title": "使用统计",
			"card.total": "累计 Token 数",
			"card.peak": "峰值 Token 数",
			"card.longest": "最长聊天时长",
			"card.streak": "当前连续天数",
			"card.longestStreak": "最长连续天数",
			"heatmap.title": "Token 活动",
			"trend.title": "每日 Token 趋势图",
			"donut.title": "模型用量",
			"range.7": "近 7 日",
			"range.30": "近 30 日",
			"range.all": "全部",
			"loading": "聚合会话日志中…",
			"empty": "还没有任何用量记录",
			"action.refresh": "刷新",
			"error.title": "加载失败",
			"day": "天",
		};
		const en = {
			"panel": "Usage",
			"panel.title": "Usage statistics",
			"card.total": "Total tokens",
			"card.peak": "Peak tokens",
			"card.longest": "Longest chat",
			"card.streak": "Current streak",
			"card.longestStreak": "Longest streak",
			"heatmap.title": "Token activity",
			"trend.title": "Daily token trend",
			"donut.title": "Model usage",
			"range.7": "7 days",
			"range.30": "30 days",
			"range.all": "All",
			"loading": "Aggregating session logs…",
			"empty": "No usage records yet",
			"action.refresh": "Refresh",
			"error.title": "Load failed",
			"day": "d",
		};
		//#endregion

		//#region rpc
		let rpcCounter = 0;
		async function rpcCall(endpoint) {
			const response = await fetch("usage-stats/" + endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "client-request", rpcId: "us-" + (rpcCounter += 1), method: endpoint, payload: {} }),
			});
			const body = await response.json().catch(() => null);
			const result = body?.result;
			if (result?.ok === true) return result.value;
			throw new Error(result?.error?.message ?? "rpc " + endpoint + " failed (" + String(response.status) + ")");
		}
		//#endregion

		//#region formatting
		function formatTokens(value) {
			if (value >= 1e8) return (value / 1e8).toFixed(1).replace(/\.0$/, "") + " 亿";
			if (value >= 1e4) return (value / 1e4).toFixed(value >= 1e7 ? 0 : 1).replace(/\.0$/, "") + " 万";
			return String(value);
		}
		function formatDuration(ms) {
			if (!Number.isFinite(ms) || ms <= 0) return "—";
			const minutes = Math.floor(ms / 60000);
			const days = Math.floor(minutes / 1440);
			const hours = Math.floor((minutes % 1440) / 60);
			const mins = minutes % 60;
			if (days > 0) return days + " 天 " + hours + " 小时 " + mins + " 分";
			if (hours > 0) return hours + " 小时 " + mins + " 分";
			return mins + " 分";
		}
		//#endregion

		//#region css
		const css =
			".uS4d_page{box-sizing:border-box;width:100%;height:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);flex-direction:column;display:flex;overflow:hidden}" +
			".uS4d_head{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none;align-items:center;gap:10px;padding:14px 20px 12px;display:flex}" +
			".uS4d_title{color:var(--dsw-alias-label-primary);font:600 16px/22px var(--ds-font-family)}" +
			".uS4d_spacer{flex:1}" +
			".uS4d_button{border-radius:var(--dsw-radius-sm);height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:var(--dsw-font-xxs-12);background:0 0;border:0;flex:none;align-items:center;gap:5px;padding:0 9px;display:inline-flex}" +
			".uS4d_button:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}" +
			".uS4d_button:disabled{opacity:.5;cursor:default}" +
			".uS4d_body{flex:1;min-height:0;flex-direction:column;gap:14px;padding:16px 20px 24px;display:flex;overflow-y:auto}" +
			".uS4d_cards{gap:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}" +
			".uS4d_card{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);flex-direction:column;gap:4px;padding:12px 14px;display:flex}" +
			".uS4d_cardLabel{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);user-select:none}" +
			".uS4d_cardValue{color:var(--dsw-alias-label-primary);font:600 18px/24px var(--ds-font-family-code);font-variant-numeric:tabular-nums}" +
			".uS4d_section{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);flex-direction:column;gap:10px;padding:14px;display:flex}" +
			".uS4d_sectionTitle{color:var(--dsw-alias-label-secondary);font:600 13px/18px var(--ds-font-family)}" +
			".uS4d_heatmap{gap:2px;display:flex}" +
			".uS4d_heatCol{flex-direction:column;gap:2px;display:flex}" +
			".uS4d_cell{background:var(--dsw-alias-bg-module-platform);border-radius:2px;width:11px;height:11px}" +
			".uS4d_cell[data-level=q1]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 30%,transparent)}" +
			".uS4d_cell[data-level=q2]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent)}" +
			".uS4d_cell[data-level=q3]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 80%,transparent)}" +
			".uS4d_cell[data-level=q4]{background:var(--dsw-alias-state-business-primary)}" +
			".uS4d_rangeToggle{align-items:center;gap:2px;margin-left:auto;display:flex}" +
			".uS4d_chart{width:100%;height:220px}" +
			".uS4d_donutRow{gap:24px;display:flex}" +
			".uS4d_legend{flex-direction:column;gap:8px;min-width:260px;display:flex}" +
			".uS4d_legendItem{align-items:center;gap:8px;display:flex}" +
			".uS4d_dot{border-radius:50%;flex:none;width:8px;height:8px}" +
			".uS4d_legendName{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".uS4d_legendValue{color:var(--dsw-alias-label-tertiary);font:11px/16px var(--ds-font-family-code);flex:none}" +
			".uS4d_loading{color:var(--dsw-alias-label-tertiary);font:var(--dsh-content-font-size,14px);padding:48px 0;text-align:center}" +
			".uS4d_error{color:var(--dsw-alias-state-error-primary);font:var(--dsh-content-font-size-secondary,13px);padding:16px 0}" +
			".uS4d_empty{color:var(--dsw-alias-label-tertiary);font:var(--dsh-content-font-size,14px);padding:48px 0;text-align:center}";
		const cssTagId = "dsh-ui-usage-stats/styles.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ui-usage-stats";
			tag.dataset.pluginCss = cssTagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region charts
		const PALETTE = ["#5b9cf5", "#4ade80", "#a78bfa", "#f87171", "#fbbf24", "#34d399", "#f472b6", "#38bdf8"];

		/** GitHub-style activity heatmap: one column per week, 7 rows (weekdays). */
		function Heatmap({ daily }) {
			const cells = useMemo(() => {
				const byDate = new Map(daily.map((d) => [d.date, d.total]));
				const days = [];
				const end = new Date(); end.setHours(0, 0, 0, 0);
				const start = new Date(end); start.setDate(start.getDate() - 363);
				start.setDate(start.getDate() - start.getDay());
				for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
					const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
					days.push({ date: key, tokens: byDate.get(key) ?? 0 });
				}
				const max = Math.max(1, ...days.map((d) => d.tokens));
				return days.map((d) => ({ ...d, level: d.tokens === 0 ? 0 : d.tokens >= max * 0.5 ? 4 : d.tokens >= max * 0.25 ? 3 : d.tokens >= max * 0.1 ? 2 : 1 }));
			}, [daily]);
			const columns = [];
			for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));
			return h("div", { className: cx("uS4d_heatmap") }, columns.map((col, i) =>
				h("div", { key: i, className: cx("uS4d_heatCol") }, col.map((cell) =>
					h("div", {
						key: cell.date,
						className: cx("uS4d_cell"),
						"data-level": cell.level === 1 ? "q1" : cell.level === 2 ? "q2" : cell.level === 3 ? "q3" : cell.level === 4 ? "q4" : undefined,
						title: cell.date + " · " + formatTokens(cell.tokens),
					}))),
			));
		}

		/** Daily per-model trend: hand-rolled SVG polylines over the selected range. */
		function TrendChart({ daily, days, t }) {
			const view = useMemo(() => {
				const sliced = days === 0 ? daily : daily.slice(-days);
				const modelTotals = new Map();
				for (const day of sliced) for (const [key, tokens] of Object.entries(day.byModel)) modelTotals.set(key, (modelTotals.get(key) ?? 0) + tokens);
				const top = [...modelTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => key);
				return { sliced, top };
			}, [daily, days]);
			const width = 800, height = 200, padLeft = 8, padBottom = 20;
			const max = Math.max(1, ...view.sliced.map((d) => d.total));
			const x = (i) => view.sliced.length <= 1 ? width / 2 : padLeft + (i * (width - padLeft * 2)) / (view.sliced.length - 1);
			const y = (v) => height - padBottom - (v / max) * (height - padBottom - 8);
			const colorOf = (key) => PALETTE[view.top.indexOf(key) % PALETTE.length];
			return h("div", null,
				h("div", { className: cx("uS4d_rangeToggle") }, view.top.map((key, i) =>
					h("span", { key, style: { display: "inline-flex", alignItems: "center", gap: "4px", margin: "0 8px", font: "11px/16px var(--ds-font-family-code)", color: "var(--dsw-alias-label-secondary)" } },
						h("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: colorOf(key), display: "inline-block" } }),
						key)),
				),
				h("svg", { className: cx("uS4d_chart"), viewBox: "0 0 " + width + " " + height, preserveAspectRatio: "none" },
					[0.25, 0.5, 0.75].map((f) => h("line", { key: f, x1: 0, x2: width, y1: y(max * f), y2: y(max * f), stroke: "var(--dsw-alias-border-l1)", strokeWidth: 0.5 })),
					view.top.map((key) => h("polyline", {
						key,
						points: view.sliced.map((day, i) => x(i) + "," + y(day.byModel[key] ?? 0)).join(" "),
						fill: "none",
						stroke: colorOf(key),
						strokeWidth: 1.5,
					})),
					view.sliced.map((day, i) => (i % Math.ceil(view.sliced.length / 8) === 0 || i === view.sliced.length - 1) && i < view.sliced.length
						? h("text", { key: day.date, x: x(i), y: height - 4, textAnchor: i === 0 ? "start" : i === view.sliced.length - 1 ? "end" : "middle", fill: "var(--dsw-alias-label-tertiary)", font: "10px var(--ds-font-family-code)" }, day.date.slice(5))
						: null),
				),
			);
		}

		/** Model usage donut: SVG arc segments + legend. */
		function Donut({ daily, days, t }) {
			const slices = useMemo(() => {
				const sliced = days === 0 ? daily : daily.slice(-days);
				const totals = new Map();
				for (const day of sliced) for (const [key, tokens] of Object.entries(day.byModel)) totals.set(key, (totals.get(key) ?? 0) + tokens);
				const grand = [...totals.values()].reduce((a, b) => a + b, 0);
				return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key, tokens]) => ({ key, tokens, pct: grand > 0 ? tokens / grand : 0 }));
			}, [daily, days]);
			const size = 170, center = size / 2, radius = 70, thickness = 26;
			let angle = -Math.PI / 2;
			const arcs = [];
			slices.forEach((slice, index) => {
				if (slice.pct <= 0) return;
				const sweep = slice.pct * Math.PI * 2;
				const end = angle + sweep;
				const large = sweep > Math.PI ? 1 : 0;
				const x1 = center + radius * Math.cos(angle), y1 = center + radius * Math.sin(angle);
				const x2 = center + radius * Math.cos(end - 0.005), y2 = center + radius * Math.sin(end - 0.005);
				const xi2 = center + (radius - thickness) * Math.cos(end - 0.005), yi2 = center + (radius - thickness) * Math.sin(end - 0.005);
				const xi1 = center + (radius - thickness) * Math.cos(angle), yi1 = center + (radius - thickness) * Math.sin(angle);
				arcs.push(h("path", {
					key: slice.key,
					d: "M " + x1 + " " + y1 + " A " + radius + " " + radius + " 0 " + large + " 1 " + x2 + " " + y2 + " L " + xi2 + " " + yi2 + " A " + (radius - thickness) + " " + (radius - thickness) + " 0 " + large + " 0 " + xi1 + " " + yi1 + " Z",
					fill: PALETTE[index % PALETTE.length],
				},
					h("title", null, slice.key + " · " + formatTokens(slice.tokens)),
				));
				angle = end;
			});
			const grand = slices.reduce((a, b) => a + b.tokens, 0);
			return h("div", { className: cx("uS4d_donutRow") },
				h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size }, arcs,
					h("text", { x: center, y: center - 2, textAnchor: "middle", fill: "var(--dsw-alias-label-primary)", font: "600 16px var(--ds-font-family-code)" }, formatTokens(grand)),
					h("text", { x: center, y: center + 16, textAnchor: "middle", fill: "var(--dsw-alias-label-tertiary)", font: "11px var(--ds-font-family-code)" }, "tokens"),
				),
				h("div", { className: cx("uS4d_legend") }, slices.slice(0, 8).map((slice, index) =>
					h("div", { key: slice.key, className: cx("uS4d_legendItem") },
						h("span", { className: cx("uS4d_dot"), style: { background: PALETTE[index % PALETTE.length] } }),
						h("span", { className: cx("uS4d_legendName") }, slice.key),
						h("span", { className: cx("uS4d_legendValue") }, (slice.pct * 100).toFixed(1) + "% · " + formatTokens(slice.tokens)),
					)),
			),
		);
		}
		//#endregion

		//#region page
		function UsageStatsPage({ t }) {
			const [data, setData] = useState(null);
			const [loading, setLoading] = useState(true);
			const [error, setError] = useState(null);
			const [range, setRange] = useState(7);

			const refresh = useCallback(async () => {
				setLoading(true);
				try { setData(await rpcCall("all")); setError(null); }
				catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
				finally { setLoading(false); }
			}, []);
			useEffect(() => { void refresh(); }, [refresh]);

			const cards = data === null ? [] : [
				[t("card.total"), formatTokens(data.totalTokens)],
				[t("card.peak"), data.peakDay === null ? "—" : formatTokens(data.peakDay.tokens)],
				[t("card.longest"), formatDuration(data.longestChatMs)],
				[t("card.streak"), data.currentStreak + " " + t("day")],
				[t("card.longestStreak"), data.longestStreak + " " + t("day")],
			];
			return h("div", { className: cx("uS4d_page") },
				h("div", { className: cx("uS4d_head") },
					h("span", { className: cx("uS4d_title") }, t("panel.title")),
					h("span", { className: cx("uS4d_spacer") }),
					h("button", { className: cx("uS4d_button"), type: "button", disabled: loading, onClick: () => { void refresh(); } }, "⟳ " + t("action.refresh")),
				),
				h("div", { className: cx("uS4d_body") },
					loading && data === null ? h("div", { className: cx("uS4d_loading") }, t("loading")) : null,
					error !== null ? h("div", { className: cx("uS4d_error") }, t("error.title"), "：", error) : null,
					data !== null && data.totalTokens === 0 ? h("div", { className: cx("uS4d_empty") }, t("empty")) : null,
					data !== null && data.totalTokens > 0 ? h("div", { className: cx("uS4d_cards") },
						cards.map(([label, value]) => h("div", { key: label, className: cx("uS4d_card") },
							h("span", { className: cx("uS4d_cardLabel") }, label),
							h("span", { className: cx("uS4d_cardValue") }, value))),
					) : null,
					data !== null && data.daily.length > 0 ? h("div", { className: cx("uS4d_section") },
						h("div", { className: cx("uS4d_sectionTitle") }, t("heatmap.title")),
						h(Heatmap, { daily: data.daily }),
					) : null,
					data !== null && data.daily.length > 0 ? h("div", { className: cx("uS4d_section") },
						h("div", { className: cx("uS4d_sectionTitle") }, t("trend.title")),
						h("div", { className: cx("uS4d_rangeToggle") },
							[[30, "range.30"], [7, "range.7"]].map(([days, key]) =>
								h("button", { key, className: cx("uS4d_button"), type: "button", "aria-pressed": range === days, style: range === days ? { color: "var(--dsw-alias-state-business-primary)" } : undefined, onClick: () => setRange(days) }, t(key)))),
						h(TrendChart, { daily: data.daily, days: range, t }),
					) : null,
					data !== null && data.daily.length > 0 ? h("div", { className: cx("uS4d_section") },
						h("div", { className: cx("uS4d_sectionTitle") }, t("donut.title")),
						h(Donut, { daily: data.daily, days: range, t }),
					) : null,
				),
			);
		}
		//#endregion

		//#region registration
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "usage-stats: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("main", () =>
				ctx.slots.register({ name: "main", key: "usage-stats", locale: NS }, UsageStatsPage),
			);
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register({
					name: "sidebar.panellist",
					id: "usage-stats",
					order: 11,
					locale: NS,
					label: () => t("panel"),
				}, function PanelIcon({ size, active }) {
					const w = size ?? 20;
					return h("svg", { width: w, height: w, viewBox: "0 0 20 20", "aria-hidden": "true" },
						h("rect", { x: 3, y: 10, width: 3, height: 7, rx: 1, fill: active ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-tertiary)" }),
						h("rect", { x: 8.5, y: 6, width: 3, height: 11, rx: 1, fill: active ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-tertiary)" }),
						h("rect", { x: 14, y: 3, width: 3, height: 14, rx: 1, fill: active ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-tertiary)" }),
					);
				}),
			);
		}
		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = { UsageStatsPage, formatTokens, formatDuration, Heatmap, TrendChart, Donut };
		return module.exports;
	},
});
