/**
 * Scaffold a new BRIKA plugin from file-based templates
 */

import * as p from '@clack/prompts';
import * as fs from 'fs/promises';
import * as path from 'path';
import pc from 'picocolors';
import type { PluginConfig } from './prompts';
import { renderTemplate, runCommand, toCamelCase, toPascalCase } from './utils';

export interface ScaffoldOptions extends PluginConfig {
  git: boolean;
  install: boolean;
}

/**
 * Template variables available in all template files
 */
interface TemplateVars {
  name: string;
  packageName: string;
  description: string;
  category: string;
  author: string;
  blockId: string;
  blockNamePascal: string;
  blockNameCamel: string;
  sdkVersion: string;
}

/**
 * Fetch the latest version of a package from npm
 */
async function fetchLatestVersion(packageName: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${packageName} version: ${response.status}`);
  }
  const data = (await response.json()) as { version: string };
  return data.version;
}

/**
 * File rename mappings (template name -> output name)
 */
const FILE_RENAMES: Record<string, string> = {
  _gitignore: '.gitignore',
  '_package.json': 'package.json',
};

/**
 * Get output filename, handling .template extension
 */
function getOutputName(filename: string): string {
  // Remove .template extension if present
  if (filename.endsWith('.template')) {
    filename = filename.slice(0, -'.template'.length);
  }
  // Apply rename mappings
  return FILE_RENAMES[filename] ?? filename;
}

/**
 * Create template variables from config
 */
function createTemplateVars(config: PluginConfig, sdkVersion: string): TemplateVars {
  return {
    name: config.name,
    packageName: `@brika/plugin-${config.name}`,
    description: config.description,
    category: config.category,
    author: config.author,
    blockId: config.name,
    blockNamePascal: toPascalCase(config.name),
    blockNameCamel: toCamelCase(config.name),
    sdkVersion,
  };
}

/**
 * Get the template directory path
 */
function getTemplateDir(): string {
  return path.resolve(import.meta.dir, '..', 'template');
}

/**
 * Process a single file: read, render, and write
 */
async function processFile(
  srcPath: string,
  destPath: string,
  vars: Record<string, string>
): Promise<void> {
  const content = await fs.readFile(srcPath, 'utf-8');
  const rendered = renderTemplate(content, vars);
  await fs.writeFile(destPath, rendered, 'utf-8');
}

/**
 * Recursively copy and render template files
 */
async function copyTemplateDir(
  srcDir: string,
  destDir: string,
  vars: Record<string, string>
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destName = getOutputName(entry.name);
    const destPath = path.join(destDir, destName);

    if (entry.isDirectory()) {
      await copyTemplateDir(srcPath, destPath, vars);
    } else {
      await processFile(srcPath, destPath, vars);
    }
  }
}

/**
 * Scaffold a new plugin
 */
export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const { git, install, ...config } = options;
  const targetDir = path.resolve(process.cwd(), config.name);

  // Check if directory exists
  try {
    await fs.access(targetDir);
    p.cancel(`Directory ${pc.cyan(config.name)} already exists`);
    throw new Error('cancelled');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const templateDir = getTemplateDir();
  const spinner = p.spinner();

  // Fetch latest SDK version
  spinner.start('Fetching latest SDK version');
  const sdkVersion = await fetchLatestVersion('@brika/sdk');
  spinner.stop(`Using SDK version ${pc.cyan(sdkVersion)}`);

  const vars = createTemplateVars(config, sdkVersion) as unknown as Record<string, string>;

  // Create files from template
  spinner.start('Creating plugin files');
  await copyTemplateDir(templateDir, targetDir, vars);
  spinner.stop('Created plugin files');

  // Initialize git repository
  if (git) {
    spinner.start('Initializing git repository');
    const success = await runCommand(['git', 'init'], targetDir);
    spinner.stop(success ? 'Initialized git repository' : 'Skipped git init');
  }

  // Install dependencies
  if (install) {
    spinner.start('Installing dependencies');
    const success = await runCommand(['bun', 'install'], targetDir);
    if (success) {
      spinner.stop('Installed dependencies');
    } else {
      spinner.stop('Failed to install dependencies');
      p.log.warn('Run `bun install` manually to install dependencies');
    }
  }

  // Show summary
  p.note(
    [
      `${pc.cyan('package.json')}     Plugin manifest with blocks`,
      `${pc.cyan('src/index.ts')}     Block definitions`,
      `${pc.cyan('tsconfig.json')}    TypeScript config`,
      `${pc.cyan('README.md')}        Documentation`,
      `${pc.cyan('locales/')}         i18n translations`,
    ].join('\n'),
    'Created files'
  );
}
