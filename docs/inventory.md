# 我们自己的 DSH 插件盘点（2026-08）

「哪些是我们自己的、哪些是 DSH 默认的」全清单。DSH 自带的 133+ 插件（`@deepseek-ai/dsh-*`）**不算**我们的资产，一律不动。

## 一、当前实际生效的（本仓库）

| 插件 | 位置 | 状态 | 可见效果 |
|---|---|---|---|
| `@dsh-external/dsh-plugin-leaderboard` | 本仓库 `packages/dsh-plugin-leaderboard` | ✅ 已注入 | 输入框旁 🏆 按钮 → 插件使用频率排行榜面板 |
| `@dsh-external/dsh-file-upload` | 本仓库 `packages/dsh-file-upload` | ✅ 已注入 | 输入框旁 📎 按钮（多选）+ 任意非图片文件可拖拽/粘贴上传 |

## 二、历史遗留（未进本仓库）

| 项目 | 位置 | 说明 | 建议 |
|---|---|---|---|
| `@dsh-external/dsh-reference-upload` | `/Users/suuuu/Developer/dsh-reference-upload` | 最早的「📎 参考文件上传」插件。**注册写法有 bug，按钮从未真正渲染过**（component 传错了位置）；功能已被本仓库 `dsh-file-upload` 完整取代 | 已卸载，可归档删除 |
| `@deepseek-ai/dsh-subagent-aiscan` | `deepseek-harness/packages/subagent/subagent-aiscan` | 给 sec-agent 用的**外部 AIScan 子代理提供者**。默认是休眠的：只有显式把子任务路由到 `aiscan` provider（且装有 AIScan 可执行文件）才干活，**在普通对话里永远不会出现效果** | 与 sec-agent 配套才需要；不用 sec-agent 可卸载 |
| `dsh-super-injector` | `/Users/suuuu/Developer/dsh-routing-suite/injector` | 注入器本体（dev_* 工具），**基础设施，继续用** | 保留 |
| `dsh-routing-suite/preset` | `/Users/suuuu/Developer/dsh-routing-suite/preset` | dsh-router-standard 路由预设 | 按需 |
| `dsh-anchored-standard` | `/Users/suuuu/Developer/dsh-anchored-standard` | 两阶段 preset 试验 | 按需 |
| `archify-dsh`（`@tt-a1i/archify-dsh`） | 第三方 bundle | 已在 web profile bundles 里，提供了 `archify` 技能等 | 第三方，不是我们的 |

## 三、为什么之前「看不出效果」

1. **注册契约错误**：`reference-upload` 把组件放在 register options 的 `component` 字段，而正确写法是第二参数 —— 按钮从未渲染，且**无任何报错提示**（React 错误被 slot 错误边界吞掉）。
2. **aiscan 是休眠提供者**：不路由就不干活，属于正常设计，但不是「装了就能看到」的东西。
3. **排行榜/上传**是本次新做并已修复验证的插件（见根 README）。

## 四、DSH 自身已装配的关键插件（默认，供理解，不需要动）

- 模型适配：`llm-deepseek`（官方 DeepSeek）、`llm-pi-ai`（你的中转站 gpt/claude/grok 路由）
- 技能（skills）：`skill` + `skill-filesystem` + `tool-skill` + `ui-skill` 协作，目录在 `~/.dsh/skills/`
- 工具注册表 `tools`、agent 主循环 `agent-loop`、会话 `session`、网页服务器 `webserver`
- 你的 web profile bundles：`dsh-base`、`dsh-web-app`、`archify-dsh`、`dsh-super-injector`
