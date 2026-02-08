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
export type { LogLevel as LogLevelType } from './events';
// ─── Events ───
export { LogLevel, log, ping } from './events';
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
  updatePreference,
} from './lifecycle';
export type {
  SparkDefinition as SparkDefinitionType,
  SparkEvent as SparkEventType,
} from './sparks';
// ─── Sparks ───
export {
  emitSpark,
  registerSpark,
  SparkDefinition,
  SparkEvent,
  sparkEvent,
  subscribeSpark,
  unsubscribeSpark,
} from './sparks';
export type { BrickTypeDefinition as BrickTypeDefinitionType } from './bricks';
// ─── Bricks ───
export {
  BrickTypeDefinition,
  brickInstanceAction,
  mountBrickInstance,
  patchBrickInstance,
  registerBrickType,
  resizeBrickInstance,
  unmountBrickInstance,
  updateBrickConfig,
} from './bricks';
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
export type {
  RouteMethod as RouteMethodType,
  RouteRequest as RouteRequestType,
  RouteResponse as RouteResponseType,
} from './routes';
// ─── Routes ───
export {
  registerRoute,
  routeRequest,
  RouteMethod,
  RouteRequest,
  RouteResponse,
} from './routes';
