# dsh-plugins

> 我们自己的 DeepSeek Harness (DSH) 插件运营仓库 —— 公开、可安装、可扩展。

DSH 是「万物皆插件」的 agent 框架（`dsh --profile web` 启动的网页版也是 133+ 插件拼出来的）。
本仓库只放**我们自己新做的**插件与配置模板，每个包都是独立可构建、可热注入的 DSH 插件。

## 目录

| 包 | 形态 | 干什么 |
|---|---|---|
| [`packages/dsh-plugin-leaderboard`](packages/dsh-plugin-leaderboard) | hybrid（host 统计 + 设置页区块） | **插件使用频率排行榜**：统计每次工具调用，按「工具 → 归属插件」聚合；入口在 **Settings → 排行榜**（输入框不再占位） |
| [`packages/dsh-file-upload`](packages/dsh-file-upload) | hybrid（host 存储 + UI 按钮/拖拽） | **任意文件上传**：多选按钮 + 页面级拖拽/粘贴拦截，非图片文件落到会话工作区 `.dsh/references/`，以 `[参考文件：x](<路径>)` 插入草稿 |
| [`packages/dsh-skill-inspector`](packages/dsh-skill-inspector) | hybrid（可选，默认不注入） | Skills 检查器：只读列出本地技能与 frontmatter 校验。日常使用价值低，默认不装；需要时可自行构建注入 |
| [`config/reasoning-effort`](config/reasoning-effort) | 配置模板（非插件） | **中转站模型思考强度适配**：给自定义 gpt/claude/grok 路由声明 `reasoningEfforts`，让思考强度选择器生效 |

## 安装（注入）

所有插件通过 `dsh-super-injector` 运行时注入，**不需要重启 DSH、不需要改 profile**：

```bash
# 1. 构建（DSH_CHECKOUT 指向 deepseek-harness 源码 checkout）
DSH_CHECKOUT=/path/to/deepseek-harness bash packages/dsh-plugin-leaderboard/scripts/build.sh
(cd packages/dsh-plugin-leaderboard && /path/to/deepseek-harness/node_modules/.bin/tsdown)

# 2. 在注入器环境里执行 dev_inject_plugin（指向包目录）
# 3. 浏览器刷新页面即可看到效果
```

修改代码后：重新 build → `dev_reload_package` 热重载，无需重启。

## 状态与统计

- 排行榜数据存于 `~/.dsh/plugin-leaderboard/counts.json`
- 工具归属可在 `~/.dsh/plugin-leaderboard/attributes.json` 覆盖（`{ "工具名": "插件标签" }`）
- 非工具型插件可调用 `POST /@dsh-external/dsh-plugin-leaderboard/api/count`（body `{ "plugin": "...", "tool": "..." }`）自报计数，一样上榜

## 历史资产盘点

我们的旧插件/项目清单与处置建议见 [`docs/inventory.md`](docs/inventory.md)。

## License

MIT © e1evensu
