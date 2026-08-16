# @dsh-external/dsh-skill-inspector

Skills 检查器 —— 回答「我到底有哪些技能、它们为什么（不）生效」。

DSH 里技能 = 纯 Markdown 数据（`SKILL.md`），由 `skill` + `skill-filesystem` + `tool-skill` + `ui-skill`
四个插件协作加载。本插件**只读磁盘**，把 `skill-filesystem` 实际扫描的目录列出来并逐项校验。

## 功能

- 扫描与 `skill-filesystem` 一致的用户技能根目录：
  - `~/.dsh/skills`（user-dsh，主要目录）
  - `~/.agents/skills`（user-agents，跨 agent 共享）
- 每个技能校验三件事（模型目录依赖的字段）：
  1. `name` 存在且为 kebab-case（小写+连字符）——否则**整个技能被静默丢弃**
  2. `name` 与所在目录名一致
  3. `description` 非空——它决定模型「什么时候想起用这个技能」
- 额外检测经典坑：驼峰 `userInvocable`（会把整个文件丢弃）。
- 输入框旁 📚 按钮打开面板：每个根目录分组展示技能清单，✓/✗ 徽标 + 告警原因 + 描述预览。

## 为什么需要它

hello-dsh 教程和官方文档里，技能失效的常见原因全是静默的：
命名不合规不报错、description 缺失不报错、web profile 里 skill 插件 disabled 也不报错。
这个工具让「技能为什么没生效」一眼可见。

## API

- `GET /@dsh-external/dsh-skill-inspector/api/skills` → `{ total, validCount, roots: [{ path, label, exists, skills: [{ dir, name, description, valid, warnings }] }] }`

## 构建与注入

```bash
DSH_CHECKOUT=/path/to/deepseek-harness bash scripts/build.sh   # host → lib/index.js
/path/to/deepseek-harness/node_modules/.bin/tsdown             # client → lib/client.js
# 注入器环境：dev_inject_plugin <本目录>；改代码后 dev_reload_package
```
