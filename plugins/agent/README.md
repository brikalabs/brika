# AI Agent

Run Claude inside Brika workflows.

## Blocks

### Ask Claude (`agent:llm`)

Prompt in, completion text out. One Anthropic Messages API call per input event,
defaulting to Claude Opus 4.8 with adaptive thinking. Use it to summarize a sensor
reading, classify an event, draft a notification, or rewrite text inside a flow.

- **Inputs:** `prompt` (string)
- **Outputs:** `text` (string), `error` ({ message })
- **Config:** `model` (claude-opus-4-8 | claude-sonnet-4-6), `systemPrompt`,
  `effort` (low | medium | high), `maxTokens`, `apiKeySecret`

## Setup

1. The plugin requests two grants, so it installs dormant until you enable it:
   - `dev.brika.net.fetch` scoped to `api.anthropic.com` (LLM egress)
   - `dev.brika.secrets.get` (read the API key)
2. Store your Anthropic API key as the plugin secret named `anthropic-api-key`
   (override the name per block via `apiKeySecret`).
3. Wire a trigger or any block's output into `prompt`, and route `text` onward.

## Notes

- The key never leaves the hub: it is read via the per-plugin secret store and
  sent only to `api.anthropic.com`.
- This is the single-call building block. A tool-calling agent (with memory and a
  chat entrypoint) builds on it once the hub exposes a tool registry.
