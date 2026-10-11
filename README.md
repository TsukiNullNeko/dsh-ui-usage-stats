# dsh-ui-usage-stats

A cross-session usage statistics dashboard for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web client: a sidebar page aggregates token usage from **every** durable session log — overview cards, a GitHub-style activity heatmap, per-model daily trend lines, and a model-usage donut.

## Features

- **Overview cards**: total tokens, peak-day tokens, longest chat, current/longest streak.
- **Activity heatmap**: GitHub-style 364-day grid, colored by daily usage, hover tooltips.
- **Daily trend**: 7/30-day per-model SVG lines (top 5 legend).
- **Model usage**: SVG donut + legend with percentages, range-filtered.
- **Fast**: first scan of 100 session logs in ~5s (zstd decompress, 8-way concurrent), then per-file mtime cache.
- **Read-only**: never writes session data; authenticated `/usage-stats` channel.

## Token accounting

Every `assistant/message` event's usage (input + output + reasoning + cacheRead + cacheWrite) lands on its local date and model (`provider/model`); chat duration = a session's first-to-last event span; streaks = consecutive local dates with usage.

## Install

```sh
pnpm add github:yuexusi/dsh-ui-usage-stats
```

Add to `dsh.profile.bundles`, restart `dsh web` — the bar-chart icon appears in the sidebar under Automation tasks.

## License

[MIT](LICENSE)
