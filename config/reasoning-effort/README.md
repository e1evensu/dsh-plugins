# 中转站模型思考强度（reasoning effort）适配

## 问题

DSH 只有「本身支持的模型」（官方 DeepSeek 路由）能在界面里选思考强度，
自定义中转站路由（gpt / claude / grok）选不了。

## 根因（查源码确认）

- 中转站模型走 `llm-pi-ai` 适配器（`deepseek-harness/packages/llm/llm-pi-ai`）。
- pi-ai 按**内置 provider 名**（`anthropic`、`openai`、`xai`…）查模型目录；
  你的路由名是 `claude`/`gpt`/`grok`，查不到 → 模型被标记为「无推理能力」→
  选择器不出现，请求也不带任何思考参数。
- 修复方式：在 `~/.dsh/settings.yaml` 里给每个模型**显式声明** `reasoningEfforts`。
  适配器会据此把模型标记为可推理，并把档位映射成各协议的 wire 参数：
  - gpt（`openai-responses`）→ `reasoning: { effort: "low"|"medium"|"high" }`
  - claude（`anthropic-messages`）→ 预算式思考 `thinking.budget_tokens`（档位对应 token 预算）
  - grok（`openai-completions`）→ `reasoning_effort`

## 配置模板

把下面内容合并进 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.*`（示例已脱敏，
`apiKeyEnv`/`baseURL` 按你自己的填；`off:` 空值 = 关闭思考时什么都不发）：

```yaml
llm-pi-ai:
  providers:
    claude:
      api: anthropic-messages
      baseURL: <你的中转站>
      reasoning: high            # 路由默认档位（claude 全部模型可推理，可安全设置）
      models:
        - id: claude-opus-5
          reasoningEfforts:
            off:                 # 空 = 关闭时什么都不发
            minimal: minimal
            low: low
            medium: medium
            high: high
    gpt:
      api: openai-responses
      baseURL: <你的中转站>
      # 注意：不要给 gpt 路由设 reasoning 默认档位 —— 路由里混有 gpt-image-2（图片模型，
      # 必须 reasoningEfforts: false），路由级默认档位会让图片模型请求直接报错。
      models:
        - id: gpt-5.6
          reasoningEfforts:
            off:
            minimal: minimal
            low: low
            medium: medium
            high: high
        - id: gpt-image-2
          reasoningEfforts: false   # 非推理模型：显式关闭
    grok:
      api: openai-completions
      baseURL: <你的中转站>/v1
      reasoning: high
      models:
        - id: grok-4.6
          reasoningEfforts:
            off:
            low: low
            medium: medium
            high: high
```

## 验证

1. 保存后无需重启（settings 热加载，下一个请求生效）。
2. 浏览器刷新页面 → 输入框旁模型选择器里选 gpt-5.6 或 claude-opus-5 →
   **Effort 下拉出现 Off / Minimal / Low / Medium / High**（claude 默认 High）。
3. 官方 DeepSeek 路由不受影响（Off / High / Max，走 `llm-deepseek`）。

## 踩坑记录

- `reasoningEfforts` 只声明档位；「档位 → wire 值」的映射由 pi-ai 按协议序列化，
  不需要自己拼协议字段。
- claude 的档位默认走**预算式思考**（low=2048 / medium=8192 / high=16384 tokens），
  可在 claude 路由上加 `thinkingBudgets: { minimal: 1024, low: 4096, medium: 16384, high: 32768 }` 调整。
- 除 `off` 外，其它档位**必须给非空字符串**，否则配置校验直接拒绝。
- `reasoningEfforts: false` 是「显式声明非推理模型」，与省略（继承/关闭）语义不同。
