/**
 * IPC Contract
 *
 * All message and RPC definitions for plugin-hub communication.
 */

// ─── Actions ───
export { callAction, registerAction } from './actions';
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
export type { BrickTypeDefinition as BrickTypeDefinitionType } from './bricks';
// ─── Bricks ───
export {
  BrickTypeDefinition,
  brickInstanceAction,
  pushBrickData,
  registerBrickType,
  updateBrickConfig,
} from './bricks';
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
  preferenceOptions,
  preferences,
  ready,
  stop,
  uninstall,
  updatePreference,
} from './lifecycle';
export type { HubLocation as HubLocationType } from './permissions';
// ─── Permissions ───
export { getHubLocation, getHubTimezone, HubLocation, setTimezone } from './permissions';
export type {
  RouteMethod as RouteMethodType,
  RouteRequest as RouteRequestType,
  RouteResponse as RouteResponseType,
} from './routes';
// ─── Routes ───
export {
  RouteMethod,
  RouteRequest,
  RouteResponse,
  registerRoute,
  routeRequest,
} from './routes';
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
export type {
  ActiveTheme as ActiveThemeType,
  ActiveThemeUpdate as ActiveThemeUpdateType,
  ColorMode as ColorModeType,
  ComponentRadiusKey as ComponentRadiusKeyType,
  ComponentTokens as ComponentTokensType,
  CornerStyle as CornerStyleType,
  ElevationStyle as ElevationStyleType,
  MotionStyle as MotionStyleType,
  ThemeColors as ThemeColorsType,
  ThemeConfig as ThemeConfigType,
} from './theme';
// ─── Theme ───
export {
  ActiveTheme,
  ActiveThemeUpdate,
  COMPONENT_RADIUS_KEYS,
  CORNER_STYLES,
  ColorMode,
  ComponentRadiusKey,
  ComponentTokens,
  CornerStyle,
  ELEVATION_STYLES,
  ElevationStyle,
  MOTION_STYLES,
  MotionStyle,
  THEME_CONFIG_VERSION,
  ThemeColors,
  ThemeConfig,
} from './theme';
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
