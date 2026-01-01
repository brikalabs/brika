/**
 * Built-in Blocks Plugin
 *
 * Provides all core workflow blocks.
 */

import { createPluginRuntime } from '@elia/sdk'

// Re-export all blocks - auto-discovered by Hub
export * from './blocks'

// Import for registration
import {
  actionBlock,
  conditionBlock,
  delayBlock,
  emitBlock,
  endBlock,
  logBlock,
  mergeBlock,
  parallelBlock,
  setBlock,
  switchBlock
} from './blocks'

const plugin = createPluginRuntime({
  id: "@elia/blocks-builtin", // Match package.json name
  version: "0.1.0",
});

// Register all blocks
plugin.useBlock(actionBlock);
plugin.useBlock(conditionBlock);
plugin.useBlock(switchBlock);
plugin.useBlock(delayBlock);
plugin.useBlock(emitBlock);
plugin.useBlock(setBlock);
plugin.useBlock(logBlock);
plugin.useBlock(mergeBlock);
plugin.useBlock(parallelBlock);
plugin.useBlock(endBlock);

plugin.api.log("info", "Built-in blocks plugin loaded");

plugin.start().catch((err) => {
  plugin.api.log("error", "Plugin fatal error:", err);
  process.exit(1);
});
