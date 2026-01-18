/**
 * IPC Contract
 *
 * All message and RPC definitions for plugin-hub communication.
 */

export type {
  BlockCategory as BlockCategoryType,
  BlockDefinition as BlockDefinitionType,
  BlockPort as BlockPortType,
} from './blocks';
// ─── Blocks ───
export {
  BlockCategory,
  BlockDefinition,
  BlockPort,
  blockEmit,
  blockLog,
  pushInput,
  registerBlock,
  startBlock,
  stopBlock,
} from './blocks';
export type {
  EventPayload as EventPayloadType,
  LogLevel as LogLevelType,
} from './events';
// ─── Events ───
export {
  EventPayload,
  emit,
  event,
  LogLevel,
  log,
  ping,
  subscribe,
  unsubscribe,
} from './events';
export type {
  PluginInfo as PluginInfoType,
  PluginRequirements as PluginRequirementsType,
} from './lifecycle';
// ─── Lifecycle ───
export {
  fatal,
  hello,
  PluginInfo,
  PluginRequirements,
  preferences,
  ready,
  stop,
  uninstall,
} from './lifecycle';
export type {
  ToolCallContext as ToolCallContextType,
  ToolCallSource as ToolCallSourceType,
  ToolDefinition as ToolDefinitionType,
  ToolInputSchema as ToolInputSchemaType,
  ToolInputSchemaProperty as ToolInputSchemaPropertyType,
  ToolResult as ToolResultType,
} from './tools';
// ─── Tools ───
export {
  callTool,
  registerTool,
  ToolCallContext,
  ToolCallSource,
  ToolDefinition,
  ToolInputSchema,
  ToolInputSchemaProperty,
  ToolResult,
} from './tools';
