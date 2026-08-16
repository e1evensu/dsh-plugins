# @dsh-external/dsh-plugin-leaderboard

插件使用频率排行榜 —— 统计 DSH 每次工具调用，按「工具 → 归属插件」聚合。
**入口在 Settings → 排行榜**（设置页导航里的独立区块，不占输入框位置）。

## 功能

- **host**：监听 `tools/result` 事件（每次工具调用必发，与内置 `agent-instructions` 同源信号），
  按工具名计数，周期性落盘到 `~/.dsh/plugin-leaderboard/counts.json`；
  提供 HTTP API 聚合排行榜。
- **client**：在 Web Settings 注册「排行榜」区块（`settings.section` 槽位），
  显示插件排名（带比例条）+ 每个插件下钻到具体工具调用次数，可手动刷新。
- **自报计数**：非工具型插件（如 `dsh-file-upload`）可
  `POST /@dsh-external/dsh-plugin-leaderboard/api/count`，body `{ "plugin": "...", "tool": "..." }`，
  把自己的事件也计入榜单。

> 注：Settings → 插件（Plugins）页面在当前安装的 DSH 构建里有一个**与本次工作无关的既有崩溃**
> （React #130，未引入任何改动也会崩），所以排行榜注册成了独立的 Settings 区块；待该页修复后可移入插件页标签。

## 归属规则

工具 → 插件标签的映射三层叠加：

1. 内置默认表（`DEFAULT_ATTRIBUTES`，覆盖常用内置工具 + 注入器 dev_* 工具）；
2. `~/.dsh/plugin-leaderboard/attributes.json` 用户覆盖（`{ "工具名": "标签" }`）；
3. `POST /count` 自报（运行时登记，`upload → @dsh-external/dsh-file-upload` 就是例子）。

未归类的工具显示为 `(unattributed)`，不会丢数据。

## API

- `GET  /@dsh-external/dsh-plugin-leaderboard/api/leaderboard` → `{ updatedAt, totalCalls, ranking: [{ plugin, total, tools }] }`
- `POST /@dsh-external/dsh-plugin-leaderboard/api/count` body `{ plugin, tool }` → 归因并 +1

## 构建与注入

```bash
DSH_CHECKOUT=/path/to/deepseek-harness bash scripts/build.sh   # host → lib/index.js
/path/to/deepseek-harness/node_modules/.bin/tsdown             # client → lib/client.js
# 注入器环境：dev_inject_plugin <本目录>；改代码后 dev_reload_package
```
