# 中转站模型思考强度（reasoning effort）适配与使用说明

## 问题

DSH 里自定义中转站路由（claude / gpt / grok）选不了思考强度，
官方 DeepSeek 路由却可以。

## 根因

- 中转站模型走 `llm-pi-ai` 适配器（`deepseek-harness/packages/llm/llm-pi-ai`）。
- pi-ai 按**内置 provider 名**（`anthropic`、`openai`、`xai`…）查模型目录；
  路由名不匹配 → 查不到 → 模型被判为「无推理能力」→ 选择器不出现、请求不带思考参数。
- 修复：在 `~/.dsh/settings.yaml` 里给每个模型**显式声明** `reasoningEfforts`。

## 每个模型的真实档位（2026-08 实测，不是一刀切）

档位由 pi-ai 的 `ModelThinkingLevel` 词汇表限定：`off / minimal / low / medium / high / xhigh / max`。
**每个模型声明哪些档位，界面就显示哪些**。下表是逐档向你的中转站发真实请求的实测结果：

| 模型 | 协议 | 界面 Effort 选项 | 档位含义 / wire 说明 |
|---|---|---|---|
| `claude-opus-5` | anthropic-messages（**自适应思考**） | Off / Minimal / Low / Medium / High / **Xhigh / Max**（7 档，默认 High） | 档位映射为 `thinking: {type: adaptive, effort}`。**拉满选 Max**（Claude Code 里的「ultra」级别即对应这里的 xhigh/max）；7 档全部实测 200 |
| `gpt-5.5 / 5.6 / 5.6-*` | openai-responses | Default / Off / Low / Medium / High（4 档） | 映射为 `reasoning: {effort}`。**没有 xhigh/max**：xhigh 实测被上游拒绝（502）；minimal 目录标记不支持 |
| `gpt-image-2` | openai-responses | 无（图片生成模型） | `reasoningEfforts: false` 显式声明非推理 |
| `grok-4.6` | openai-completions | Default / Off / Low / Medium / High（4 档，默认 High） | 映射为 `reasoning_effort` 字段，实测 200 |
| 官方 DeepSeek 路由 | llm-deepseek | Off / High / Max | 与本次改动无关，原本就支持 |

### 为什么 claude 必须用路由名 `anthropic`

- `claude-opus-5` 在 pi-ai 目录里声明了 `forceAdaptiveThinking: true` + `thinkingLevelMap: {xhigh, max}`。
- 但目录查找**按路由 key**进行：路由名叫 `claude` 就查不到，只能退化为「预算式思考」
  （`thinking.budget_tokens`，档位只剩 minimal/low/medium/high，没有拉满档）。
- 把路由 key 改成 `anthropic` 后继承目录元数据 → 自适应思考 + 全部 7 档；
  界面显示名用 `displayName: claude` 保持「claude」不变。

## 生效方式（要不要重启）

**不需要重启 DSH。** settings.yaml 由 `llm-pi-ai` 在每次请求前重新解析，路由增删/改名也是
热重注册（同一适配器实例原地重建）。**只需要浏览器刷新一次页面**（模型选择器目录是页面加载时拉的）。

注意：路由改名（claude → anthropic）后，之前保存的「选中 claude」的会话选择会失效，
需要重新选一次模型（选中后 session 会记住）。

## 完整配置模板（脱敏，按你自己的 apiKeyEnv/baseURL 填）

```yaml
llm-pi-ai:
  providers:
    anthropic:                       # 路由 key 必须匹配内置 provider 名，才能继承自适应思考
      displayName: claude            # 界面显示名
      apiKeyEnv: CLAUDE_API_KEY
      api: anthropic-messages
      baseURL: https://你的中转站/
      reasoning: high                # 路由默认档位（claude 全模型可推理，安全）
      models:
        - id: claude-opus-5
          name: claude-opus-5
          reasoningEfforts:
            off:
            minimal: minimal
            low: low
            medium: medium
            high: high
            xhigh: xhigh
            max: max
    gpt:
      displayName: gpt
      apiKeyEnv: GPT_API_KEY
      api: openai-responses
      baseURL: https://你的中转站/
      # 注意：不要给 gpt 路由设 reasoning 默认档位——路由里混有 gpt-image-2（图片模型，
      # 必须 reasoningEfforts: false），路由级默认档位会让图片模型的请求直接报错。
      models:
        - id: gpt-5.6
          name: gpt-5.6
          reasoningEfforts:
            off:
            low: low
            medium: medium
            high: high
        - id: gpt-image-2
          name: gpt-image-2
          reasoningEfforts: false
    grok:
      apiKeyEnv: GROK_API_KEY
      api: openai-completions
      baseURL: https://你的中转站/v1
      reasoning: high
      models:
        - id: grok-4.6
          name: grok-4.6
          reasoningEfforts:
            off:
            low: low
            medium: medium
            high: high
```

## 档位怎么选（使用建议）

- **日常问答 / 简单任务**：claude 用 Low/Medium，gpt 用 Low。
- **代码、长文档、复杂推理**：claude 用 High 或 Xhigh，gpt 用 High。
- **拉满**：claude 选 **Max**（对应 Claude Code 里拉满的强度；xhigh 是 opus 原生档）。
- **Off**：关闭思考参数（模型按自身默认行为）。

## 踩坑记录

- `reasoningEfforts` 只声明档位；「档位 → wire 值」由 pi-ai 按协议序列化，不要自己拼协议字段。
- 除 `off` 外，其它档位**必须给非空字符串**，否则配置校验直接拒绝。
- 声明了档位但上游不认（如 gpt 的 xhigh）→ 请求报错，档位表以**实测**为准，不是以目录为准。
- `reasoningEfforts: false` = 显式声明非推理模型（如 gpt-image-2），与省略语义不同。
- 路由级 `reasoning:` 默认档位会作用于路由内**所有**模型——含非推理模型的路由不要设。
