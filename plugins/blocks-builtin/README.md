# @brika/blocks-builtin

Core workflow blocks for BRIKA automations. This plugin provides essential building blocks for creating visual workflows in the BRIKA automation engine.

## Overview

The built-in blocks plugin is automatically loaded by the BRIKA hub and provides fundamental workflow control and data manipulation blocks. These blocks form the foundation of all BRIKA automations.

## Available Blocks

### Flow Control

#### Condition
Branch workflow execution based on a boolean expression.

- **Inputs**: `in`
- **Outputs**: `then`, `else`
- **Config**:
  - `if`: Condition expression (e.g., `trigger.payload.value > 10`)

#### Switch
Multi-way branch based on a value.

- **Inputs**: `in`
- **Outputs**: `default` + custom outputs defined in `cases`
- **Config**:
  - `value`: Expression to evaluate (e.g., `trigger.payload.status`)
  - `cases`: Map of value → output port ID

#### Delay
Wait for a specified duration before continuing.

- **Inputs**: `in`
- **Outputs**: `out`
- **Config**:
  - `duration`: Duration to wait (e.g., `"5s"`, `"1m"`, `5000`)

#### Merge
Wait for multiple inputs before continuing.

- **Inputs**: `a`, `b`
- **Outputs**: `out`
- **Config**:
  - `mode`: `"all"` or `"any"` (optional, defaults to `"all"`)

#### Parallel
Split workflow execution into parallel branches.

- **Inputs**: `in`
- **Outputs**: `a`, `b`
- **Config**: None

#### End
Terminate a workflow branch.

- **Inputs**: `in`
- **Outputs**: None
- **Config**:
  - `status`: `"success"` or `"failure"` (optional)
  - `message`: Optional message (optional)

### Actions

#### Action
Call a tool with arguments.

- **Inputs**: `in`
- **Outputs**: `out`
- **Config**:
  - `tool`: Tool name to call (e.g., `@brika/plugin-timer:set`)
  - `args`: Arguments to pass (optional, supports expressions)

#### Emit Event
Emit an event to the event bus.

- **Inputs**: `in`
- **Outputs**: `out`
- **Config**:
  - `event`: Event type to emit
  - `payload`: Event payload (optional, supports expressions)

#### Log
Log a message to the workflow logs.

- **Inputs**: `in`
- **Outputs**: `out`
- **Config**:
  - `message`: Message to log (supports expressions)
  - `level`: Log level - `"debug"`, `"info"`, `"warn"`, or `"error"` (optional, defaults to `"info"`)

### Data Manipulation

#### Set Variable
Set a workflow variable for use in subsequent blocks.

- **Inputs**: `in`
- **Outputs**: `out`
- **Config**:
  - `var`: Variable name to set
  - `value`: Value to assign (supports expressions)

## Usage Examples

### Simple Conditional Flow

Create a workflow that checks a sensor value and turns on lights if it's above a threshold:

```yaml filename="motion-lights.yml"
blocks:
  - id: trigger
    type: event
    config:
      event: motion.detected
  
  - id: check
    type: @brika/blocks-builtin:condition
    config:
      if: trigger.payload.value > 50
  
  - id: action
    type: @brika/blocks-builtin:action
    config:
      tool: "@brika/plugin-lights:turnOn"
      args:
        brightness: 100
```

### Timer with Delay

Set a timer and send a notification halfway through:

```yaml
blocks:
  - id: start
    type: @brika/blocks-builtin:action
    config:
      tool: "@brika/plugin-timer:set"
      args:
        seconds: 60
  
  - id: wait
    type: @brika/blocks-builtin:delay
    config:
      duration: "30s"
  
  - id: notify
    type: @brika/blocks-builtin:emit
    config:
      event: timer.halfway
      payload:
        message: "30 seconds remaining"
```

### Parallel Execution

Run multiple actions simultaneously when a button is pressed:

```yaml
blocks:
  - id: trigger
    type: event
    config:
      event: button.pressed
  
  - id: split
    type: @brika/blocks-builtin:parallel
    config: {}
  
  - id: lights
    type: @brika/blocks-builtin:action
    config:
      tool: "@brika/plugin-lights:toggle"
  
  - id: music
    type: @brika/blocks-builtin:action
    config:
      tool: "@brika/plugin-music:play"
  
  - id: merge
    type: @brika/blocks-builtin:merge
    config: {}
```

### Using Variables

Store and use data throughout your workflow:

```yaml filename="temperature-monitor.yml"
blocks:
  - id: trigger
    type: event
    config:
      event: sensor.reading
  
  - id: store_temp
    type: @brika/blocks-builtin:set
    config:
      var: temperature
      value: trigger.payload.temp
  
  - id: check
    type: @brika/blocks-builtin:condition
    config:
      if: vars.temperature > 25
  
  - id: log_high
    type: @brika/blocks-builtin:log
    config:
      message: "Temperature is {{ vars.temperature }}°C"
      level: warn
```

### Code Block Examples

You can specify filenames in code blocks to make examples clearer:

```js filename="example.js"
const result = await runtime.callTool("@brika/plugin-timer:set", {
  name: "Coffee Reminder",
  seconds: 300,
});
```

```typescript filename="plugin.ts"
import { defineTool, z } from "@brika/sdk";

export const myTool = defineTool({
  id: "action",
  schema: z.object({
    message: z.string(),
  }),
}, async (args) => {
  return { ok: true, content: args.message };
});
```

## Expression Syntax

Many blocks support expressions in their configuration. Expressions can reference:

- `trigger.payload.*` - Data from the workflow trigger
- `vars.*` - Workflow variables set by the `set` block
- `inputs.*` - Data from input ports

Example expressions:
- `trigger.payload.temperature > 25`
- `vars.count + 1`
- `inputs.a.value + inputs.b.value`

## Installation

This plugin is included by default with BRIKA and does not need to be installed separately.
