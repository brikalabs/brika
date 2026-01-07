# @brika/blocks-builtin

Core reactive blocks for BRIKA workflow automations. This plugin provides essential building blocks for creating visual workflows.

## Overview

The built-in blocks plugin is automatically loaded by the BRIKA hub and provides fundamental workflow control and data manipulation blocks using the reactive stream architecture.

## Available Blocks

### Triggers

#### Clock
Emit periodic ticks on an interval.

- **Inputs**: None (source block)
- **Outputs**: `tick` — `{ count: number, ts: number }`
- **Config**:
  - `interval` (duration) — Interval between ticks

```yaml
- id: clock
  type: "@brika/blocks-builtin:clock"
  config:
    interval: 5000  # 5 seconds
```

### Flow Control

#### Condition
Branch based on a boolean condition.

- **Inputs**: `in` (generic)
- **Outputs**: `then`, `else` (passthrough)
- **Config**:
  - `field` — Field path to check (e.g., `"value"`, `"data.status"`)
  - `operator` — `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `exists`
  - `value` — Value to compare against

```yaml
- id: check
  type: "@brika/blocks-builtin:condition"
  config:
    field: "temperature"
    operator: "gt"
    value: 25
```

#### Switch
Multi-way branch based on a value.

- **Inputs**: `in` (generic)
- **Outputs**: `case1`, `case2`, `case3`, `default` (passthrough)
- **Config**:
  - `field` — Field path to check
  - `case1`, `case2`, `case3` — Values to match

```yaml
- id: switch
  type: "@brika/blocks-builtin:switch"
  config:
    field: "status"
    case1: "active"
    case2: "pending"
    case3: "error"
```

#### Delay
Wait for a duration before continuing.

- **Inputs**: `in` (generic)
- **Outputs**: `out` (passthrough)
- **Config**:
  - `duration` (duration) — Duration to wait

```yaml
- id: wait
  type: "@brika/blocks-builtin:delay"
  config:
    duration: 5000  # 5 seconds
```

#### Merge
Wait for multiple inputs before continuing.

- **Inputs**: `a`, `b` (generic)
- **Outputs**: `out` — `{ a: any, b: any }`
- **Config**: None

```yaml
- id: merge
  type: "@brika/blocks-builtin:merge"
  config: {}
```

#### Split
Send data to multiple branches.

- **Inputs**: `in` (generic)
- **Outputs**: `a`, `b` (passthrough)
- **Config**: None

```yaml
- id: split
  type: "@brika/blocks-builtin:split"
  config: {}
```

#### End
Terminate a workflow branch.

- **Inputs**: `in` (generic)
- **Outputs**: None
- **Config**:
  - `status` — `"success"` or `"failure"`

```yaml
- id: end
  type: "@brika/blocks-builtin:end"
  config:
    status: success
```

### Actions

#### HTTP Request
Make HTTP requests to external APIs.

- **Inputs**: `trigger` (generic)
- **Outputs**: `response`, `error`
- **Config**:
  - `url` — Request URL
  - `method` — `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
  - `headers` — Request headers object
  - `body` — Request body (for POST/PUT/PATCH)

```yaml
- id: api-call
  type: "@brika/blocks-builtin:http-request"
  config:
    url: "https://api.example.com/data"
    method: GET
    headers:
      Authorization: "Bearer token"
```

#### Log
Log a message with variable interpolation.

- **Inputs**: `in` (generic)
- **Outputs**: `out` (passthrough)
- **Config**:
  - `message` — Message template with `{{inputs.in.field}}` expressions
  - `level` — `debug`, `info`, `warn`, `error`

```yaml
- id: log
  type: "@brika/blocks-builtin:log"
  config:
    message: "Received: {{inputs.in.value}}"
    level: info
```

### Data Manipulation

#### Transform
Transform or extract data.

- **Inputs**: `in` (generic)
- **Outputs**: `out` (any)
- **Config**:
  - `field` — Field to extract (empty for passthrough)
  - `template` — Template to build output object

```yaml
# Extract a field
- id: extract
  type: "@brika/blocks-builtin:transform"
  config:
    field: "data.temperature"

# Build new object
- id: reshape
  type: "@brika/blocks-builtin:transform"
  config:
    template:
      temp: "data.temperature"
      hum: "data.humidity"
```

## Usage Examples

### Simple Clock + Log

```yaml
id: clock-demo
name: Clock Demo
enabled: true

blocks:
  - id: clock
    type: "@brika/blocks-builtin:clock"
    config:
      interval: 5000
    position: { x: 100, y: 100 }

  - id: log
    type: "@brika/blocks-builtin:log"
    config:
      message: "Tick #{{inputs.in.count}}"
      level: info
    position: { x: 300, y: 100 }

connections:
  - from: clock
    fromPort: tick
    to: log
    toPort: in
```

### Conditional Flow

```yaml
id: condition-demo
name: Condition Demo
enabled: true

blocks:
  - id: clock
    type: "@brika/blocks-builtin:clock"
    config:
      interval: 10000

  - id: condition
    type: "@brika/blocks-builtin:condition"
    config:
      field: "count"
      operator: "gt"
      value: 5

  - id: high
    type: "@brika/blocks-builtin:log"
    config:
      message: "Count is high: {{inputs.in.count}}"
      level: warn

  - id: low
    type: "@brika/blocks-builtin:log"
    config:
      message: "Count is low: {{inputs.in.count}}"
      level: debug

connections:
  - from: clock
    fromPort: tick
    to: condition
    toPort: in
  - from: condition
    fromPort: then
    to: high
    toPort: in
  - from: condition
    fromPort: else
    to: low
    toPort: in
```

### Parallel Branches

```yaml
id: parallel-demo
name: Parallel Demo
enabled: true

blocks:
  - id: clock
    type: "@brika/blocks-builtin:clock"
    config:
      interval: 5000

  - id: split
    type: "@brika/blocks-builtin:split"
    config: {}

  - id: fast
    type: "@brika/blocks-builtin:log"
    config:
      message: "Fast path"

  - id: slow
    type: "@brika/blocks-builtin:delay"
    config:
      duration: 2000

  - id: slow-log
    type: "@brika/blocks-builtin:log"
    config:
      message: "Slow path (after 2s)"

  - id: merge
    type: "@brika/blocks-builtin:merge"
    config: {}

  - id: done
    type: "@brika/blocks-builtin:log"
    config:
      message: "Both paths completed"

connections:
  - from: clock
    fromPort: tick
    to: split
    toPort: in
  - from: split
    fromPort: a
    to: fast
    toPort: in
  - from: split
    fromPort: b
    to: slow
    toPort: in
  - from: slow
    fromPort: out
    to: slow-log
    toPort: in
  - from: fast
    fromPort: out
    to: merge
    toPort: a
  - from: slow-log
    fromPort: out
    to: merge
    toPort: b
  - from: merge
    fromPort: out
    to: done
    toPort: in
```

## Expression Syntax

Log blocks support `{{...}}` expressions for variable interpolation:

- `{{inputs.in}}` — Raw input data
- `{{inputs.in.field}}` — Access nested fields
- `{{config.value}}` — Access config values
- `{{JSON.stringify(inputs.in)}}` — Serialize to JSON

## Installation

This plugin is included by default with BRIKA and does not need to be installed separately.
