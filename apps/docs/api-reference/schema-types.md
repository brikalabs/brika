# Schema Types

Complete reference for Zod schema types in the `@brika/sdk` package.

## Overview

The SDK provides a custom `z` module that extends Zod with BRIKA-specific types for UI rendering.

```typescript
import { z } from "@brika/sdk";
```

**Important:** Always import `z` from `@brika/sdk`, not directly from `zod`.

---

## Standard Zod Types

All standard Zod types are available:

### Primitives

```typescript
z.string()                    // String
z.number()                    // Number
z.boolean()                   // Boolean
z.bigint()                    // BigInt
z.date()                      // Date
z.null()                      // Null
z.void()                      // Void
z.nan()                       // NaN
z.never()                     // Never (no value valid)
```

### Literals and Enums

```typescript
z.literal("value")            // Literal value
z.enum(["a", "b", "c"])       // Enum (string union)
```

### Composites

```typescript
z.object({ name: z.string() })           // Object
z.array(z.number())                      // Array
z.tuple([z.string(), z.number()])        // Tuple
z.record(z.string(), z.number())         // Record (string keys)
z.map(z.string(), z.number())            // Map
z.set(z.string())                        // Set
```

### Unions and Intersections

```typescript
z.union([z.string(), z.number()])        // Union (OR)
z.discriminatedUnion("type", [...])      // Discriminated union
z.intersection(schemaA, schemaB)         // Intersection (AND)
```

### Modifiers

```typescript
z.optional(z.string())        // Optional
z.nullable(z.string())        // Nullable
z.coerce.number()             // Coerce to type
```

---

## Schema Modifiers

### .default(value)

Set a default value:

```typescript
z.string().default("hello")
z.number().default(42)
z.boolean().default(true)
z.enum(["fast", "slow"]).default("fast")
```

### .describe(description)

Add a description (shown as help text in UI):

```typescript
z.string().describe("Enter your name")
z.number().describe("Value between 1 and 100")
```

### .optional()

Make a field optional:

```typescript
z.string().optional()
z.number().optional()
```

### .min(value) / .max(value)

Set constraints:

```typescript
z.number().min(0).max(100)
z.string().min(3).max(50)
z.array(z.string()).min(1).max(10)
```

### .regex(pattern)

Validate against regex:

```typescript
z.string().regex(/^[a-z]+$/, "Must be lowercase letters")
```

---

## BRIKA Custom Types

### z.generic()

Accept any type. The actual type is inferred from connections in the UI.

```typescript
function generic<T extends string = "T">(typeVar?: T): GenericRef<T>
```

**Use cases:**
- Passthrough blocks
- Type-agnostic processing
- Dynamic routing

**Example:**

```typescript
inputs: {
  in: input(z.generic(), { name: "Input" }),
},
outputs: {
  out: output(z.passthrough("in"), { name: "Output" }),
}
```

**UI behavior:** Shows as "generic" until connected, then infers type.

---

### z.passthrough(inputId)

Output inherits type from the specified input port.

```typescript
function passthrough<K extends string>(sourcePortId: K): PassthroughRef<K>
```

**Example:**

```typescript
inputs: {
  data: input(z.number(), { name: "Data" }),
},
outputs: {
  // 'out' will have type number (same as 'data' input)
  out: output(z.passthrough("data"), { name: "Output" }),
}
```

**TypeScript behavior:** Correctly infers type from the linked input.

---

### z.duration(options?, description?)

Duration in milliseconds. UI renders a duration picker with unit selector (ms, s, m, h).

```typescript
function duration(
  options?: { min?: number; max?: number },
  description?: string
): ZodNumber
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.min` | `number` | Minimum value in ms |
| `options.max` | `number` | Maximum value in ms |
| `description` | `string` | Field description |

**Examples:**

```typescript
// Basic duration
z.duration(undefined, "Wait duration")

// With constraints
z.duration({ min: 100, max: 60000 }, "Timeout (100ms - 1min)")

// With default value
z.duration(undefined, "Interval").default(1000)
```

**Returns:** Number (milliseconds)

---

### z.color(description?)

Hex color value. UI renders a color picker.

```typescript
function color(description?: string): ZodString
```

**Example:**

```typescript
z.color("LED color")
z.color("Background color").default("#3b82f6")
```

**Returns:** Hex string (e.g., `#ff5500`)

**Validation:** Must match `/^#[0-9A-Fa-f]{6}$/`

---

### z.code(language, description?)

Code snippet. UI renders a code editor with syntax highlighting.

```typescript
function code(language: string, description?: string): ZodString
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | `string` | Language for syntax highlighting |
| `description` | `string` | Field description |

**Supported languages:**
- `javascript`, `typescript`
- `json`, `yaml`
- `html`, `css`
- `sql`
- `markdown`
- `python`, `go`, `rust`

**Example:**

```typescript
z.code("javascript", "Script to execute")
z.code("json", "Configuration JSON")
z.code("sql", "Database query")
```

**Returns:** String (code content)

---

### z.secret(description?)

Secret value (password, API key). UI renders a masked input with show/hide toggle.

```typescript
function secret(description?: string): ZodString
```

**Example:**

```typescript
z.secret("API key")
z.secret("Database password")
```

**Returns:** String

**Security:** Values are not logged and are stored securely.

---

### z.expression(description?)

Expression with variable interpolation. UI provides variable autocomplete.

```typescript
function expression(description?: string): ZodString
```

**Example:**

```typescript
z.expression("Dynamic value")
z.expression("Condition expression")
```

**Expression syntax:**
- `{{variable}}` - Variable reference
- `{{device.temperature}}` - Nested property
- `{{time.hour}} >= 8` - Comparison

**Returns:** String (expression)

---

### z.filePath(description?)

File path. UI renders a file picker or path input.

```typescript
function filePath(description?: string): ZodString
```

**Example:**

```typescript
z.filePath("Configuration file")
z.filePath("Output directory")
```

**Returns:** String (file path)

---

### z.url(description?)

URL with validation. UI renders a URL input.

```typescript
function url(description?: string): ZodString
```

**Example:**

```typescript
z.url("Webhook URL")
z.url("API endpoint")
```

**Returns:** String (valid URL)

**Validation:** Must be a valid URL format.

---

### z.sparkType(description?)

Reference to a spark type. UI renders a spark picker dropdown.

```typescript
function sparkType(description?: string): ZodString
```

**Example:**

```typescript
z.sparkType("Spark to trigger")
```

**Returns:** String (spark type ID, e.g., `timer:timer-started`)

---

### z.jsonSchema(description?)

Raw JSON value. UI renders a JSON editor.

```typescript
function jsonSchema(description?: string): ZodString
```

**Example:**

```typescript
z.jsonSchema("Custom configuration")
```

**Returns:** String (JSON)

---

## Complete Configuration Example

```typescript
export const smartLight = defineReactiveBlock(
  {
    id: "smart-light",
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
      brightness: input(z.number().min(0).max(100), { name: "Brightness %" }),
    },
    outputs: {
      status: output(z.object({
        on: z.boolean(),
        brightness: z.number(),
        color: z.string(),
      }), { name: "Status" }),
      error: output(z.string(), { name: "Error" }),
    },
    config: z.object({
      // Basic types with defaults
      name: z.string().default("Living Room").describe("Light name"),
      autoOff: z.boolean().default(true).describe("Auto turn off"),

      // Enum
      mode: z.enum(["normal", "party", "sleep"]).default("normal")
        .describe("Light mode"),

      // BRIKA custom types
      color: z.color("Default color"),
      offDelay: z.duration(undefined, "Auto-off delay").default(300000),
      apiKey: z.secret("Philips Hue API key"),
      condition: z.expression("Turn on condition"),

      // Optional fields
      schedule: z.string().optional().describe("Cron expression"),
      
      // Constrained numbers
      minBrightness: z.number().min(0).max(100).default(10)
        .describe("Minimum brightness level"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    // Implementation
  }
);
```

---

## Type Inference

Use `z.infer` to extract TypeScript types from schemas:

```typescript
const configSchema = z.object({
  name: z.string(),
  count: z.number(),
  enabled: z.boolean(),
});

type Config = z.infer<typeof configSchema>;
// { name: string; count: number; enabled: boolean }
```

---

## JSON Schema Generation

Schemas are automatically converted to JSON Schema for:
- API documentation
- Form generation in UI
- IDE autocomplete in `package.json`

```typescript
import { zodToJsonSchema } from "@brika/sdk";

const jsonSchema = zodToJsonSchema(mySchema);
```
