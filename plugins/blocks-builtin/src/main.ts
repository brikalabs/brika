/**
 * Built-in Blocks Plugin
 *
 * Provides all core workflow blocks for ELIA automations.
 */

import type { Json } from "@brika/sdk";
import { defineBlock, expr, log, parseDuration, z } from "@brika/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Blocks
// ─────────────────────────────────────────────────────────────────────────────

// Action Block - Call a tool with arguments
export const action = defineBlock(
  {
    id: "action",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      tool: z.string().describe("Tool name to call"),
      args: z.record(z.string(), z.unknown()).optional().describe("Arguments to pass"),
    }),
  },
  async (config, ctx, runtime) => {
    const args = expr(config.args ?? {}, ctx);
    runtime.log("debug", `Calling tool: ${config.tool}`);
    const result = await runtime.callTool(config.tool, args as Record<string, never>);
    return { output: "out", data: result };
  },
);

// Condition Block - Branch based on a condition
export const condition = defineBlock(
  {
    id: "condition",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [
      { id: "then", name: "Then" },
      { id: "else", name: "Else" },
    ],
    schema: z.object({
      if: z.string().describe("Condition expression (e.g., trigger.payload.value > 10)"),
    }),
  },
  async (config, ctx, runtime) => {
    const result = Boolean(runtime.evaluate(config.if, ctx));
    runtime.log("debug", `Condition "${config.if}" evaluated to: ${result}`);
    return { output: result ? "then" : "else", data: result };
  },
);

// Switch Block - Multi-way branch
export const switchBlock = defineBlock(
  {
    id: "switch",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "default", name: "Default" }],
    schema: z.object({
      value: z.string().describe("Expression to evaluate (e.g., trigger.payload.status)"),
      cases: z.record(z.string(), z.string()).describe("Map of value -> output port ID"),
    }),
  },
  async (config, ctx, runtime) => {
    const value = String(runtime.evaluate(config.value, ctx));
    runtime.log("debug", `Switch value: ${value}`);
    const outputPort = config.cases[value] ?? "default";
    return { output: outputPort, data: value };
  },
);

// Delay Block - Wait for a duration
export const delay = defineBlock(
  {
    id: "delay",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      duration: z.union([z.string(), z.number()]).describe("Duration to wait (e.g., '5s', '1m', 5000)"),
    }),
  },
  async (config, ctx, runtime) => {
    const ms = parseDuration(config.duration);
    runtime.log("debug", `Waiting for ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { output: "out", data: ctx.input };
  },
);

// Emit Block - Emit an event
export const emitEvent = defineBlock(
  {
    id: "emit",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      event: z.string().describe("Event type to emit"),
      payload: z.record(z.string(), z.unknown()).optional().describe("Event payload"),
    }),
  },
  async (config, ctx, runtime) => {
    const payload = expr(config.payload ?? {}, ctx) as Json;
    runtime.log("debug", `Emitting event: ${config.event}`);
    runtime.emit(config.event, payload);
    return { output: "out", data: { event: config.event, payload } };
  },
);

// Set Block - Set a workflow variable
export const set = defineBlock(
  {
    id: "set",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      var: z.string().describe("Variable name to set"),
      value: z.unknown().describe("Value to assign (can use expressions)"),
    }),
  },
  async (config, ctx, runtime) => {
    const value = expr(config.value, ctx) as Json;
    runtime.log("debug", `Setting variable: ${config.var} = ${JSON.stringify(value)}`);
    runtime.setVar(config.var, value);
    return { output: "out", data: value };
  },
);

// Log Block - Log a message
export const logBlock = defineBlock(
  {
    id: "log",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      message: z.string().describe("Message to log (supports expressions)"),
      level: z.enum(["debug", "info", "warn", "error"]).optional().describe("Log level"),
    }),
  },
  async (config, ctx, runtime) => {
    const message = String(expr(config.message, ctx));
    const level = config.level ?? "info";
    runtime.log(level, message);
    return { output: "out", data: message };
  },
);

// Merge Block - Wait for multiple inputs
export const merge = defineBlock(
  {
    id: "merge",
    inputs: [
      { id: "a", name: "Input A" },
      { id: "b", name: "Input B" },
    ],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      mode: z.enum(["all", "any"]).optional().describe("Wait for all inputs or any"),
    }),
  },
  async (_config, ctx, runtime) => {
    const merged: Record<string, Json> = { ...ctx.inputs };
    runtime.log("debug", `Merged inputs: ${JSON.stringify(merged)}`);
    return { output: "out", data: merged };
  },
);

// Parallel Block - Split to parallel branches
export const parallel = defineBlock(
  {
    id: "parallel",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [
      { id: "a", name: "Branch A" },
      { id: "b", name: "Branch B" },
    ],
    schema: z.object({}),
  },
  async (_config, ctx, runtime) => {
    runtime.log("debug", "Splitting to parallel branches");
    return { output: "a", data: ctx.input };
  },
);

// End Block - Terminate workflow
export const end = defineBlock(
  {
    id: "end",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [],
    schema: z.object({
      status: z.enum(["success", "failure"]).optional().describe("End status"),
      message: z.string().optional().describe("Optional message"),
    }),
  },
  async (config, ctx, runtime) => {
    const status = config.status ?? "success";
    runtime.log("debug", `Workflow ended with status: ${status}`);
    return {
      output: "", // No output for terminal block
      data: { status, message: config.message ?? null, finalInput: ctx.input },
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────

log("info", "Built-in blocks plugin loaded");
