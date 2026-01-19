# @brika/plugin-example-echo

A simple example plugin demonstrating how to create reactive blocks for BRIKA.

## Overview

This plugin provides a basic echo block that passes input data to output, optionally with prefix/suffix transformation. It's useful for learning how BRIKA plugins work and for testing workflows.

## Available Blocks

### Echo

Echoes input data to output with optional prefix/suffix for string messages.

**Inputs:**
- `in` (generic) — Any data to echo

**Outputs:**
- `out` (generic) — The echoed data

**Config:**
- `prefix` (string, optional) — Prefix to add to string messages
- `suffix` (string, optional) — Suffix to add to string messages

## Usage

### In Workflows

```yaml
blocks:
  - id: clock
    type: "@brika/blocks-builtin:clock"
    config:
      interval: 5000

  - id: echo
    type: "@brika/plugin-example-echo:echo"
    config:
      prefix: "[Echo] "

  - id: log
    type: "@brika/blocks-builtin:log"
    config:
      message: "Received: {{ JSON.stringify(inputs.in) }}"

connections:
  - from: clock
    fromPort: tick
    to: echo
    toPort: in
  - from: echo
    fromPort: out
    to: log
    toPort: in
```

## Implementation

```typescript
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";

export const echo = defineReactiveBlock(
  {
    id: "echo",
    inputs: {
      in: input(z.generic(), { name: "Input" }),
    },
    outputs: {
      out: output(z.passthrough("in"), { name: "Output" }),
    },
    config: z.object({
      prefix: z.string().optional().describe("Optional prefix for string messages"),
      suffix: z.string().optional().describe("Optional suffix for string messages"),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      if (typeof data === "string" && (config.prefix || config.suffix)) {
        const prefix = config.prefix ?? "";
        const suffix = config.suffix ?? "";
        const result = `${prefix}${data}${suffix}`;
        log.info(`Echo: ${result}`);
        outputs.out.emit(result);
      } else {
        log.info(`Echo: ${JSON.stringify(data)}`);
        outputs.out.emit(data);
      }
    });
  }
);

onStop(() => log.info("Echo plugin stopping"));
log.info("Echo plugin loaded");
```

## Installation

Add to your `brika.yml`:

```yaml
install:
  - ref: "workspace:example-echo"
    enabled: true
```
