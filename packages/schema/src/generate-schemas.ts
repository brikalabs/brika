#!/usr/bin/env bun
import { join } from 'node:path';
import * as z from 'zod';
import { PluginPackageSchema } from './plugin';

/**
 * Generate JSON Schemas from Zod schemas
 *
 * Uses Zod 4's native z.toJSONSchema() to convert to JSON Schema.
 * Generated schemas are published to npm, then served via:
 * - unpkg: https://unpkg.com/@brika/schema@0.1.0/dist/plugin.schema.json
 * - jsdelivr: https://cdn.jsdelivr.net/npm/@brika/schema@0.1.0/dist/plugin.schema.json
 * - Custom domain (proxied): https://schema.brika.dev/plugin.schema.json
 */

const rootDir = join(import.meta.dir, '..');

// Read package version using Bun.file
const packageFile = Bun.file(join(rootDir, 'package.json'));
const packageJson = await packageFile.json();
const version = packageJson.version;

console.log(`📦 Generating schemas for version ${version}...`);

// Generate plugin schema using Zod 4's native toJSONSchema
const pluginJsonSchema = z.toJSONSchema(PluginPackageSchema, {
  target: 'draft-07',
  metadata: z.globalRegistry,
});

// Customize the JSON schema
const customizedPluginSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: `https://schema.brika.dev/${version}/plugin.schema.json`,
  title: 'BRIKA Plugin package.json',
  description: 'Schema for BRIKA plugin package.json files',
  // Merge with base package.json schema
  allOf: [
    {
      $ref: 'https://json.schemastore.org/package.json',
    },
    pluginJsonSchema,
  ],
};

const schemaJson = JSON.stringify(customizedPluginSchema, null, 2);

// Write to dist/ (published to npm)
const distPath = join(rootDir, 'dist', 'plugin.schema.json');
await Bun.write(distPath, schemaJson);
console.log(`✅ Generated: ${distPath}`);

console.log(`\n🎉 Schema generation complete!`);
console.log(`   Version: ${version}`);
console.log(`   Schema ID: https://schema.brika.dev/${version}/plugin.schema.json`);
console.log(`\n📦 After publishing to npm, available at:`);
console.log(`   https://unpkg.com/@brika/schema@${version}/dist/plugin.schema.json`);
console.log(`   https://cdn.jsdelivr.net/npm/@brika/schema@${version}/dist/plugin.schema.json`);
