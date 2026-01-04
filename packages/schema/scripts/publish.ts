#!/usr/bin/env bun
import { join } from "node:path";
import { parseArgs } from "node:util";

/**
 * Publish @brika/schema to npm
 * 
 * Usage:
 *   bun run publish            # Normal publish (checks if version exists)
 *   bun run publish --force    # Force publish (skip version check)
 *   bun run publish --dry-run  # Dry run (show what would be published)
 */

const rootDir = join(import.meta.dir, "..");

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    force: {
      type: "boolean",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      default: false,
    },
  },
  strict: true,
  allowPositionals: false,
});

const isForce = values.force;
const isDryRun = values["dry-run"];

console.log("📦 Publishing @brika/schema to npm...\n");

// Read package version
const packageFile = Bun.file(join(rootDir, "package.json"));
const packageJson = await packageFile.json();
const version = packageJson.version;
const packageName = packageJson.name;

console.log(`   Package: ${packageName}`);
console.log(`   Version: ${version}`);
console.log(`   Force: ${isForce ? "✅ Yes" : "❌ No"}`);
console.log(`   Dry run: ${isDryRun ? "✅ Yes" : "❌ No"}\n`);

// Step 1: Build the schemas
console.log("🔨 Building schemas...");
const buildProcess = Bun.spawn(["bun", "run", "build"], {
  cwd: rootDir,
  stdout: "inherit",
  stderr: "inherit",
});

const buildExit = await buildProcess.exited;
if (buildExit !== 0) {
  console.error("❌ Build failed!");
  process.exit(1);
}

console.log("✅ Build complete\n");

// Step 2: Check if version exists on npm (unless --force)
if (!isForce && !isDryRun) {
  console.log("🔍 Checking if version exists on npm...");
  
  const checkProcess = Bun.spawn(
    ["npm", "view", `${packageName}@${version}`, "version"],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  
  const exitCode = await checkProcess.exited;
  
  if (exitCode === 0) {
    const output = await new Response(checkProcess.stdout).text();
    
    if (output.trim() === version) {
      console.error(`\n❌ Version ${version} already exists on npm!`);
      console.error("\nOptions:");
      console.error("  1. Bump version: npm version patch|minor|major");
      console.error("  2. Force publish: bun run publish --force");
      console.error("  3. Unpublish first: npm unpublish @brika/schema@" + version);
      process.exit(1);
    }
  }
  
  console.log("✅ Version is new\n");
}

// Step 3: Publish to npm
if (isDryRun) {
  console.log("🔍 Dry run - showing what would be published...\n");
  
  const dryRunProcess = Bun.spawn(["npm", "publish", "--dry-run"], {
    cwd: rootDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  
  await dryRunProcess.exited;
  console.log("\n✅ Dry run complete (nothing was published)");
  process.exit(0);
}

console.log("📤 Publishing to npm..." + (isForce ? " (forced)" : "") + "\n");

const publishArgs = ["npm", "publish", "--access", "public"];

if (isForce) {
  publishArgs.push("--force");
}

const publishProcess = Bun.spawn(publishArgs, {
  cwd: rootDir,
  stdout: "inherit",
  stderr: "inherit",
});

const publishExit = await publishProcess.exited;

if (publishExit !== 0) {
  console.error("\n❌ Publish failed!");
  process.exit(1);
}

console.log("\n✅ Published successfully!\n");
console.log("🌐 Schema available at:");
console.log("   https://unpkg.com/@brika/schema@" + version + "/dist/plugin.schema.json");
console.log("   https://cdn.jsdelivr.net/npm/@brika/schema@" + version + "/dist/plugin.schema.json");
console.log("   https://schema.brika.dev/" + version + "/plugin.schema.json");
console.log("   https://schema.brika.dev/plugin.schema.json (latest)\n");

console.log("📝 Don't forget to:");
console.log("   git push --follow-tags");

