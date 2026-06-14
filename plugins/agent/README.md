# AI Agent

Run LLMs (Claude, any OpenAI-compatible endpoint, or a local Ollama server)
inside Brika workflows.

## Blocks

### Ask AI (`agent:llm`)

Prompt in, completion text out. One LLM call per input event. Use it to
summarize a sensor reading, classify an event, draft a notification, or rewrite
text inside a flow.

- **Inputs:** `prompt` (string)
- **Outputs:** `text` (string), `error` ({ message })
- **Config:** `model`, `systemPrompt`, `effort` (low | medium | high), `maxTokens`

### Call Tool (`agent:call-tool`)

Invoke a hub-registered tool by id and emit its result.

### AI Agent (`agent:agent`)

An LLM that reasons over the prompt and calls hub-registered tools to answer it.

## Setup

1. The plugin requests network grants, so it installs dormant until you enable it:
   - `dev.brika.net.fetch` scoped to the supported provider hosts (Anthropic,
     OpenAI, OpenRouter, Groq, Together, Mistral, Azure OpenAI)
   - `dev.brika.net.local.fetch` on the Ollama loopback port (11434)
2. Add a provider key in the plugin preferences (`Anthropic API Key`,
   `OpenAI API Key`, an OpenAI-compatible base URL, and/or an Ollama server URL).
   Password preferences are stored in the OS keychain.
3. Wire a trigger or any block's output into `prompt`, and route `text` onward.

## Notes

- Keys never leave the hub: they are read from the plugin preferences and sent
  only to the configured provider endpoint.
- Provider setup lives in the plugin-global preferences, never in individual
  blocks, so every AI block shares one set of credentials.
