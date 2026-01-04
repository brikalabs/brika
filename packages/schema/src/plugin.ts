import * as z from "zod";

/**
 * BRIKA Plugin Package Schema (Zod)
 * 
 * Extends standard package.json with BRIKA-specific fields.
 * JSON Schema is generated from this file.
 */

// ============================================================================
// Base Package.json Schema
// ============================================================================

const Bugs = z.union([
	z.string(),
	z.object({
		url: z.optional(z.string()),
		email: z.optional(z.string()),
	}),
]);

const Funding = z.union([
	z.string(),
	z.object({
		url: z.string(),
		type: z.optional(z.string()),
	}),
	z.array(
		z.union([
			z.string(),
			z.object({
				url: z.string(),
				type: z.optional(z.string()),
			}),
		]),
	),
]);

const Person = z.union([
	z.string(),
	z.object({
		name: z.string(),
		email: z.optional(z.string()),
		url: z.optional(z.string()),
	}),
]);

const Repository = z.union([
	z.string(),
	z.object({
		type: z.string(),
		url: z.string(),
		directory: z.optional(z.string()),
	}),
]);

const BasePackageJson = z.looseObject({
	$schema: z.optional(z.url().describe("JSON Schema reference for IDE validation")),
	name: z.string(),
	version: z.string(),
	description: z.optional(z.string()),
	keywords: z.optional(z.array(z.string())),
	homepage: z.optional(z.string()),
	bugs: z.optional(Bugs),
	license: z.optional(z.string()),
	author: z.optional(Person),
	contributors: z.optional(z.array(Person)),
	maintainers: z.optional(z.array(Person)),
	funding: z.optional(Funding),
	files: z.optional(z.array(z.string())),
	exports: z.optional(
		z.union([z.null(), z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]),
	),
	type: z.optional(z.literal(["module", "commonjs"])),
	main: z.optional(z.string()),
	browser: z.optional(
		z.union([z.string(), z.record(z.string(), z.union([z.string(), z.boolean()]))]),
	),
	bin: z.optional(z.union([z.string(), z.record(z.string(), z.string())])),
	man: z.optional(z.union([z.string(), z.array(z.string())])),
	directories: z.optional(z.record(z.string(), z.string())),
	repository: z.optional(Repository),
	scripts: z.optional(z.record(z.string(), z.string())),
	config: z.optional(z.record(z.string(), z.unknown())),
	dependencies: z.optional(z.record(z.string(), z.string())),
	devDependencies: z.optional(z.record(z.string(), z.string())),
	peerDependencies: z.optional(z.record(z.string(), z.string())),
	peerDependenciesMeta: z.optional(z.record(z.string(), z.object({ optional: z.boolean() }))),
	bundleDependencies: z.optional(z.union([z.boolean(), z.array(z.string())])),
	bundledDependencies: z.optional(z.union([z.boolean(), z.array(z.string())])),
	optionalDependencies: z.optional(z.record(z.string(), z.string())),
	overrides: z.optional(z.record(z.string(), z.unknown())),
	engines: z.optional(z.record(z.string(), z.string())),
	os: z.optional(z.array(z.string())),
	cpu: z.optional(z.array(z.string())),
	private: z.optional(z.boolean()),
	publishConfig: z.optional(z.record(z.string(), z.unknown())),
	workspaces: z.optional(z.array(z.string())),
	module: z.optional(z.string()),
	types: z.optional(z.string()),
	typings: z.optional(z.string()),
	packageManager: z.optional(z.string()),
	sideEffects: z.optional(z.union([z.boolean(), z.array(z.string())])),
	imports: z.optional(z.record(z.string(), z.unknown())),
});

// ============================================================================
// BRIKA-specific Schema Extensions
// ============================================================================

const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
// Simplified: allows ^1.0.0, ~1.0.0, >=1.0.0, 1.0.0, etc.
const semverRangePattern = /^[~^><=]*\d+\.\d+\.\d+(-[\w.-]+)?(\s+[~^><=]*\d+\.\d+\.\d+(-[\w.-]+)?)*$/;

const ToolSchema = z.object({
	id: z.string().describe("Tool identifier (local to plugin)"),
	description: z.optional(z.string().describe("Human-readable description")),
	icon: z.optional(z.string().describe("Lucide icon name")),
	color: z.optional(z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Hex color")),
});

const BlockSchema = z.object({
	id: z.string().describe("Block identifier (local to plugin)"),
	name: z.optional(z.string().describe("Display name")),
	description: z.optional(z.string().describe("Human-readable description")),
	category: z.literal(["trigger", "flow", "action", "transform"]).describe("Block category"),
	icon: z.optional(z.string().describe("Lucide icon name")),
	color: z.optional(z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Hex color")),
});

// ============================================================================
// Final Plugin Package Schema
// ============================================================================

export const PluginPackageSchema = BasePackageJson.extend({
	// Override: plugin name can be scoped or unscoped
	name: z.string()
		.regex(/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/)
		.describe("Plugin package name (used as plugin ID). Can be scoped (e.g., @myorg/plugin-name) or unscoped (e.g., brika-plugin-example)"),
	
	// Override: strict semver for plugins
	version: z.string()
		.regex(semverPattern)
		.describe("Plugin version (semver)"),
	
	// Override: require engines with brika field
	engines: z.looseObject({
		brika: z.string()
			.regex(semverRangePattern)
			.describe("Required BRIKA hub version (semver range). Should match @brika/sdk version."),
	}).describe("Engine requirements. Must include 'brika' field."),
	
	// BRIKA-specific fields
	tools: z.optional(z.array(ToolSchema).describe("Tools provided by this plugin")),
	blocks: z.optional(z.array(BlockSchema).describe("Workflow blocks provided by this plugin")),
	icon: z.optional(z.string().describe("Path to plugin icon (PNG/SVG, relative to package root)")),
});

/**
 * TypeScript type for BRIKA plugin package.json
 */
export type PluginPackageSchema = z.infer<typeof PluginPackageSchema>;
