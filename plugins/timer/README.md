# @elia/plugin-timer

Timer and reminder functionality for ELIA automations. Set timers that fire events when they complete, enabling time-based workflows and reminders.

## Overview

The timer plugin provides tools for managing timers and countdowns. Timers can be set with a duration, and when they complete, they emit events that can trigger other workflows. This enables delayed actions, reminders, and time-based automation logic.

## Available Tools

### set

Set a timer that fires after the specified duration.

**Parameters:**
- `name` (string, optional): Timer name (auto-generated if not provided)
- `seconds` (number, required): Duration in seconds (1-86400, i.e., 1 second to 24 hours)

**Returns:**
- `ok`: `true` if successful
- `content`: Success message
- `data`: Object containing `id`, `name`, and `seconds`

### list

List all active timers with their remaining time.

**Parameters:** None

**Returns:**
- `ok`: `true` if successful
- `content`: Message with timer count
- `data`: Array of timer objects with `id`, `name`, `remaining` (ms), and `duration` (ms)

### cancel

Cancel an active timer by ID or name.

**Parameters:**
- `target` (string, required): Timer ID or name to cancel

**Returns:**
- `ok`: `true` if successful, `false` if timer not found
- `content`: Success or error message

### clear

Clear all active timers at once.

**Parameters:** None

**Returns:**
- `ok`: `true` if successful
- `content`: Message with count of cleared timers

## Events

The timer plugin emits the following events that you can listen to in your workflows:

### timer.completed

Emitted when a timer completes. Use this to trigger actions when a timer finishes.

**Payload:**
- `id`: Timer ID
- `name`: Timer name
- `duration`: Original duration in milliseconds

### timer.cancelled

Emitted when a timer is cancelled.

**Payload:**
- `id`: Timer ID
- `name`: Timer name

## Usage Examples

### Simple Timer Workflow

Set a timer and react when it completes:

```yaml filename="break-reminder.yml"
blocks:
  - id: set_timer
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-timer:set"
      args:
        name: "Break Reminder"
        seconds: 1800  # 30 minutes
  
  - id: timer_done
    type: event
    config:
      event: timer.completed
  
  - id: notify
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-notifications:send"
      args:
        message: "Time for a break!"
```

### Timer Plugin Implementation

Example of how the timer plugin is implemented:

```typescript filename="src/index.ts"
import { defineTool, emit, z } from "@elia/sdk";

export const set = defineTool(
  {
    id: "set",
    schema: z.object({
      name: z.string().optional(),
      seconds: z.number().min(1).max(86400),
    }),
  },
  async (args) => {
    const timeout = setTimeout(() => {
      emit("timer.completed", { name: args.name });
    }, args.seconds * 1000);
    
    return { ok: true, content: `Timer "${args.name}" set` };
  },
);
```

### Multiple Timers with Cancellation

Set multiple timers and cancel one:

```yaml
blocks:
  - id: timer1
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-timer:set"
      args:
        name: "Short Timer"
        seconds: 60
  
  - id: timer2
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-timer:set"
      args:
        name: "Long Timer"
        seconds: 300
  
  - id: cancel_short
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-timer:cancel"
      args:
        target: "Short Timer"
```

### Timer with Delay Block

Combine timer events with delay blocks for complex timing:

```yaml
blocks:
  - id: start
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-timer:set"
      args:
        name: "Main Timer"
        seconds: 600  # 10 minutes
  
  - id: warning
    type: @elia/blocks-builtin:delay
    config:
      duration: "540s"  # 9 minutes (1 minute before timer)
  
  - id: warn
    type: @elia/blocks-builtin:emit
    config:
      event: timer.warning
      payload:
        message: "1 minute remaining"
  
  - id: complete
    type: event
    config:
      event: timer.completed
```

### List Active Timers

Check what timers are currently running:

```yaml
blocks:
  - id: list_timers
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-timer:list"
  
  - id: log_result
    type: @elia/blocks-builtin:log
    config:
      message: "Active timers: {{ list_timers.data | length }}"
```

### Reminder System

Create a reminder that triggers after a delay:

```yaml
blocks:
  - id: trigger
    type: event
    config:
      event: reminder.requested
  
  - id: set_reminder
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-timer:set"
      args:
        name: "{{ trigger.payload.name }}"
        seconds: "{{ trigger.payload.seconds }}"
  
  - id: reminder_done
    type: event
    config:
      event: timer.completed
  
  - id: send_reminder
    type: @elia/blocks-builtin:action
    config:
      tool: "@elia/plugin-notifications:send"
      args:
        message: "Reminder: {{ reminder_done.payload.name }}"
```

## Timer Lifecycle

1. **Creation**: Timer is created with `set` tool and starts counting down
2. **Active**: Timer is running and can be queried with `list`
3. **Completion**: Timer fires `timer.completed` event and is removed
4. **Cancellation**: Timer can be cancelled with `cancel` or `clear`, firing `timer.cancelled` event

## Best Practices

1. **Name Your Timers**: Use descriptive names to make them easier to manage
2. **Handle Events**: Always set up event listeners for `timer.completed` if you need to react to timer completion
3. **Clean Up**: Use `clear` when shutting down or resetting state
4. **Duration Limits**: Timers are limited to 1-86400 seconds (24 hours max)

## Installation

Add to your `brika.yml`:

```yaml
plugins:
  - "@elia/plugin-timer"
```
