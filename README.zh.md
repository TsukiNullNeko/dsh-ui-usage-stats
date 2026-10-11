# dsh-ui-usage-stats

DSH（DeepSeek Harness）跨会话用量统计面板：侧边栏新增「使用统计」页面（自动化任务下方），
聚合**全部**会话日志的 token 用量——概览卡片、GitHub 式活动热力图、按模型每日趋势线、模型用量环形图。

## 功能

- **概览卡片**：累计 Token、峰值日 Token、最长聊天时长、当前/最长连续天数
- **Token 活动热力图**：GitHub 风格年度网格（364 天，按日着色，悬停显示日期与用量）
- **每日趋势**：近 7/30 日按模型的 SVG 折线图（Top 5 模型图例）
- **模型用量**：SVG 环形图 + 图例（占比与 token 数，随时间范围过滤）
- **性能**：首扫 100 个会话日志约 5 秒（zstd 解压 + 8 并发），之后按文件 mtime 增量缓存，秒回
- **零侵入**：只读会话日志，不写任何数据；cookie 鉴权的 `/usage-stats` 通道

## 数据口径

每个 `assistant/message` 事件的 usage（input + output + reasoning + cacheRead + cacheWrite）计入当天与对应模型
（键为 `provider/model`）；聊天时长 = 单会话首尾事件跨度；连续天数 = 有用量的连续本地日期。

## 安装

```sh
pnpm add github:yuexusi/dsh-ui-usage-stats
```

加进 profile `dsh.profile.bundles`，重启 `dsh web`，侧边栏出现柱状图图标。

## 开发

```sh
node test/host.mjs    # 聚合引擎测试（合成日志 → zstd → 断言）
node test/client.mjs  # 仪表盘组件渲染测试
```

## 许可

[MIT](LICENSE)
