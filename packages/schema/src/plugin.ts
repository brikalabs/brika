import { z } from "zod";

/**
 * BRIKA Plugin Package Schema (Zod)
 * 
 * This is the source of truth for plugin validation.
 * JSON Schema is generated from this file.
 */

// Semver pattern
const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
const semverRangePattern = /^(\^|~|>=|<=|>|<)?\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\s*\|\|\s*(\^|~|>=|<=|>|<)?\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?)*$/;

// Author schema
const AuthorSchema = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    email: z.email().optional(),
    url: z.url().optional(),
  }),
]);

// Repository schema
const RepositorySchema = z.union([
  z.string(),
  z.object({
    type: z.string().optional(),
    url: z.string().optional(),
    directory: z.string().optional(),
  }),
]);

// Tool schema
const ToolSchema = z.object({
  id: z.string().describe("Tool identifier (local to plugin)"),
  description: z.string().optional().describe("Human-readable description of the tool"),
  icon: z.string().optional().describe("Lucide icon name"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Hex color for the tool"),
});

// Block schema
const BlockSchema = z.object({
  id: z.string().describe("Block identifier (local to plugin)"),
  name: z.string().optional().describe("Display name for the block"),
  description: z.string().optional().describe("Human-readable description of the block"),
  category: z.enum(["trigger", "flow", "action", "transform"]).describe("Block category"),
  icon: z.string().optional().describe("Lucide icon name"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Hex color for the block"),
});

// Engines schema
const EnginesSchema = z.object({
  brika: z.string()
    .regex(semverRangePattern)
    .describe("Required BRIKA hub version (semver range). Should be compatible with your @brika/sdk dependency version."),
}).describe("Engine compatibility requirements. Must match the @brika/sdk version in dependencies.");

// Main plugin package schema
export const PluginPackageSchema = z.object({
  // Required fields
  name: z.string()
    .regex(/^@[a-z0-9-]+\/[a-z0-9-]+$/)
    .describe("Plugin package name (used as plugin ID). Must be scoped (e.g., @myorg/plugin-name)"),
  
  version: z.string()
    .regex(semverPattern)
    .describe("Plugin version (semver)"),
  
  engines: EnginesSchema,
  
  // Optional but recommended
  description: z.string().optional().describe("Short description of the plugin"),
  
  author: AuthorSchema.optional().describe("Plugin author"),
  
  repository: RepositorySchema.optional().describe("Repository URL (e.g., GitHub)"),
  
  icon: z.string().optional().describe("Path to plugin icon (PNG/SVG, relative to package root)"),
  
  keywords: z.array(z.string()).optional().describe("Keywords for plugin discovery"),
  
  license: z.string().optional().describe("Plugin license (e.g., MIT, Apache-2.0)"),
  
  // Plugin-specific fields
  tools: z.array(ToolSchema).optional().describe("Tools provided by this plugin"),
  
  blocks: z.array(BlockSchema).optional().describe("Workflow blocks provided by this plugin"),
  
  // Standard package.json fields
  dependencies: z.record(z.string(), z.string()).optional().describe("Plugin dependencies. For BRIKA plugins, should include @brika/sdk with version compatible with engines.brika"),
  
  devDependencies: z.record(z.string(), z.string()).optional(),
  
  type: z.enum(["module", "commonjs"]).optional(),
  
  main: z.string().optional(),
  
  exports: z.record(z.string(), z.string()).optional(),
  
  scripts: z.record(z.string(), z.string()).optional(),
});

// Export type inference
export type PluginPackage = z.infer<typeof PluginPackageSchema>;

// Validation helpers
export function validatePluginPackage(data: unknown) {
  return PluginPackageSchema.safeParse(data);
}

export function assertPluginPackage(data: unknown): asserts data is PluginPackage {
  PluginPackageSchema.parse(data);
}

