# @elia/plugin-example-echo

A simple example plugin that provides an echo tool for testing and demonstration purposes.

## Overview

This plugin provides a basic `echo` tool that returns any message you send to it. It's useful for testing workflows, debugging, and learning how ELIA plugins work.

## Available Tools

### echo

Echoes back the provided message. This is useful for testing workflows and verifying that tool calls are working correctly.

**Parameters:**
- `message` (string, required): The message to echo back

**Returns:**
- `ok`: `true` if successful
- `content`: The echoed message

## Usage

### In Workflows

Use the echo tool in your workflows to test or debug:

```yaml filename="test-workflow.yml"
blocks:
  - id: trigger
    type: event
    config:
      event: test.trigger
  
  - id: echo_block
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-example-echo:echo"
      args:
        message: "Hello, ELIA!"
  
  - id: log_result
    type: @elia/blocks-builtin:log
    config:
      message: "Echo returned: {{ echo_block.data.content }}"
```

### Example Code

Here's how you might use the echo tool in a plugin:

```typescript filename="src/index.ts"
import { defineTool, z } from "@elia/sdk";

export const echo = defineTool(
  {
    id: "echo",
    description: "Echo back the provided message",
    schema: z.object({
      message: z.string().describe("The message to echo back"),
    }),
  },
  async (args) => {
    return { ok: true, content: args.message };
  },
);
```

### Testing Workflows

You can use the echo tool to verify that your workflow is executing correctly:

```yaml
blocks:
  - id: start
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-example-echo:echo"
      args:
        message: "Workflow started"
  
  - id: middle
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-example-echo:echo"
      args:
        message: "Workflow in progress"
  
  - id: end
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-example-echo:echo"
      args:
        message: "Workflow completed"
```

## Installation

Add to your `brika.yml`:

```yaml
plugins:
  - "@elia/plugin-example-echo"
```
